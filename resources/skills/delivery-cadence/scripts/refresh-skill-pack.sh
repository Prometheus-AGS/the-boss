#!/usr/bin/env bash
# refresh-skill-pack.sh — refresh an installed skill pack from merged main.
#
# A delivery-cadence checkpoint procedure. Odd cadence iterations refresh fully
# (full), even ones only report the installed state (verify).
#
#   --deploy <worktree>   clean deploy worktree that tracks origin/main   (REFRESH_DEPLOY)
#   --state <state.json>  cadence state, read directly for --mode auto    (REFRESH_STATE)
#   --mode full|verify|auto                                               (REFRESH_MODE)
#   --services <a,b,...>  launchd labels to `launchctl kickstart -k`      (REFRESH_SERVICES)
#   --receipt <file>      also write the JSON summary to this file        (REFRESH_RECEIPT)
#
# Exit 0 done; 1 operational failure (dirty/diverged worktree, failed step);
# 2 unusable input (bad flags, unreadable state, non-numeric iteration). Never
# defaults a missing iteration: a guess silently turned every run into a full one.
# Bash 3.2 compatible.
set -euo pipefail

die() { echo "refresh-skill-pack: $2" >&2; exit "$1"; }

DEPLOY="${REFRESH_DEPLOY:-}"
STATE="${REFRESH_STATE:-}"
MODE="${REFRESH_MODE:-}"
SERVICES="${REFRESH_SERVICES:-}"
RECEIPT="${REFRESH_RECEIPT:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --deploy|--state|--mode|--services|--receipt)
      [ $# -ge 2 ] || die 2 "$1 needs a value"
      case "$1" in
        --deploy) DEPLOY="$2" ;; --state) STATE="$2" ;; --mode) MODE="$2" ;;
        --services) SERVICES="$2" ;; --receipt) RECEIPT="$2" ;;
      esac
      shift 2 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) die 2 "unknown argument: $1" ;;
  esac
done

[ -n "$DEPLOY" ] || die 2 "--deploy <worktree> (or REFRESH_DEPLOY) is required"
case "$MODE" in
  full|verify|auto) ;;
  "") die 2 "--mode full|verify|auto (or REFRESH_MODE) is required" ;;
  *) die 2 "unknown mode '$MODE' (expected full, verify or auto)" ;;
esac
[ -d "$DEPLOY" ] || die 2 "deploy worktree not found: $DEPLOY"
git -C "$DEPLOY" rev-parse --git-dir >/dev/null 2>&1 || die 2 "not a git worktree: $DEPLOY"
DEPLOY="$(cd "$DEPLOY" && pwd)"

# Test seams, honoured only when REFRESH_TEST_MODE=1; production always runs the real commands.
UPDATE_CMD='bash scripts/update-skill-pack.sh --force'
INSTALL_CMD='bash scripts/install-binaries.sh'
KICKSTART_CMD='launchctl kickstart -k "gui/$(id -u)/$1"'
TEST_MODE=0
if [ "${REFRESH_TEST_MODE:-}" = "1" ]; then
  TEST_MODE=1
  UPDATE_CMD="${REFRESH_UPDATE_CMD:-$UPDATE_CMD}"
  INSTALL_CMD="${REFRESH_INSTALL_CMD:-$INSTALL_CMD}"
  KICKSTART_CMD="${REFRESH_KICKSTART_CMD:-$KICKSTART_CMD}"
fi

# --- iteration parity (reads state.json directly; the cadence CLI holds its lock inside a checkpoint)
ITERATION=""
if [ "$MODE" = "auto" ]; then
  [ -n "$STATE" ] || die 2 "--mode auto needs --state <state.json> (or REFRESH_STATE)"
  [ -f "$STATE" ] && [ -r "$STATE" ] || die 2 "cannot read cadence state: $STATE"
  ITERATION="$(python3 - "$STATE" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception as e:
    sys.stderr.write("state.json is not readable JSON: %s\n" % e); sys.exit(1)
def num(v):
    return v if isinstance(v, int) and not isinstance(v, bool) and v > 0 else None
n = None
if isinstance(d, dict):
    active = d.get("activeIterationId")
    for it in (d.get("iterations") or []):
        if isinstance(it, dict) and active is not None and it.get("id") == active:
            n = num(it.get("index")); break
    if n is None and active is None:
        n = num(d.get("iteration"))
if n is None:
    sys.stderr.write("no numeric iteration for the active iteration in state.json\n"); sys.exit(1)
print(n)
PY
  )" || die 2 "cannot determine the cadence iteration from $STATE"
  if [ $((ITERATION % 2)) -eq 1 ]; then MODE=full; else MODE=verify; fi
  echo "cadence iteration $ITERATION: $MODE" >&2
fi

# --- full refresh
if [ "$MODE" = "full" ]; then
  [ -z "$(git -C "$DEPLOY" status --porcelain)" ] \
    || die 1 "refusing to refresh a dirty deploy worktree: $DEPLOY"
  git -C "$DEPLOY" fetch --quiet origin main >&2 || die 1 "git fetch origin main failed in $DEPLOY"
  git -C "$DEPLOY" merge-base --is-ancestor HEAD origin/main \
    || die 1 "deploy worktree has diverged from origin/main: $DEPLOY"
  git -C "$DEPLOY" merge --ff-only --quiet origin/main >&2 || die 1 "fast-forward to origin/main failed"
  # The pin may have moved: sync submodules before any installer reads them.
  git -C "$DEPLOY" submodule update --init --recursive >&2 || die 1 "git submodule update failed"

  if [ "$TEST_MODE" -eq 0 ]; then
    while pgrep -x cargo >/dev/null 2>&1 || pgrep -x rustc >/dev/null 2>&1; do
      echo "waiting for running cargo build" >&2; sleep 20
    done
    # Reuse a certified prometheus-exec build when its hash matches the pinned one.
    CERT="${CERT_EXEC:-}"
    PIN="$DEPLOY/config/prometheus-exec-binary.json"
    if [ -n "$CERT" ] && [ -f "$CERT" ] && [ -f "$PIN" ]; then
      EXPECTED="$(awk -F'"' '/"expectedBuildSha256"/{print $4;exit}' "$PIN")"
      if [ -n "$EXPECTED" ] && [ "$(shasum -a 256 "$CERT" | awk '{print $1}')" = "$EXPECTED" ]; then
        export PROMETHEUS_EXEC_SOURCE_BIN="$CERT"
      else
        echo "certified prometheus-exec build does not match the pin; installer will build from source" >&2
      fi
    fi
  fi

  ( cd "$DEPLOY" && bash -c "$UPDATE_CMD" refresh ) >&2 || die 1 "update step failed"
  ( cd "$DEPLOY" && bash -c "$INSTALL_CMD" refresh ) >&2 || die 1 "install step failed"

  OLDIFS="$IFS"; IFS=','
  for label in $SERVICES; do
    IFS="$OLDIFS"
    [ -n "$label" ] || continue
    ( cd "$DEPLOY" && bash -c "$KICKSTART_CMD" refresh "$label" ) >&2 || die 1 "kickstart failed for $label"
    IFS=','
  done
  IFS="$OLDIFS"
fi

# --- JSON summary (verify and full share it; verify changes nothing)
SUMMARY="$(python3 - "$DEPLOY" "$MODE" "$ITERATION" <<'PY'
import json, os, subprocess, sys, urllib.request
deploy, mode, iteration = sys.argv[1:4]
def run(cmd, cwd=None):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=10, cwd=cwd)
        return (r.stdout or r.stderr).strip() or None
    except Exception as e:
        return "unavailable: %s" % e
health = None
url = os.environ.get("REFRESH_HEALTH_URL", "http://127.0.0.1:23001/health")
try:
    health = json.load(urllib.request.urlopen(url, timeout=5))
except Exception as e:
    health = {"error": str(e)}
manifest = {}
try:
    manifest = json.load(open(os.path.expanduser("~/.prometheus/plugins/prometheus-skill-pack/current/manifest.json")))
except Exception as e:
    manifest = {"error": str(e)}
print(json.dumps({
    "mode": mode,
    "iteration": int(iteration) if iteration else None,
    "sourceCommit": run(["git", "-C", deploy, "rev-parse", "HEAD"]),
    "versions": {
        "pk": run(["pk", "--version"]),
        "learningWorker": run(["prometheus-learning-worker", "--version"]),
        "surrealMemory": run(["surreal-memory-server", "--version"]),
    },
    "health": health,
    "pluginGeneration": manifest.get("generation"),
    "pluginSourceCommit": (manifest.get("sourceProvenance") or {}).get("sourceCommit"),
}, indent=2))
PY
)" || die 1 "could not build the JSON summary"
printf '%s\n' "$SUMMARY"
if [ -n "$RECEIPT" ]; then
  mkdir -p "$(dirname "$RECEIPT")" && printf '%s\n' "$SUMMARY" > "$RECEIPT" || die 1 "could not write receipt $RECEIPT"
fi
