# Packaged approval/lifecycle operation

Source procedure only; it has not been executed. Run after the root declares the complete C14.2 delivery boundary and packages the matching UAR source.

```text
node scripts/operate-approval-lifecycle.mjs --boss <C14.2-worktree> --launcher <maintained-boss-launch.mjs> --output <receipt-directory>
```

The maintained launcher is `prometheus-skill-pack/skills/process/delivery-cadence/scripts/boss-launch.mjs`. The operation requires the matching macOS packaged app, local UAR source pin and payload marker, the normal qualified coding profile, and a durable UAR approval store. Memory-only history deliberately cannot pass the durable acceptance gate.

Supply model identity through `BOSS_C142_GATEWAY_ENDPOINT`, `BOSS_C142_GATEWAY_ALIAS`, `BOSS_C142_GATEWAY_PROVIDER_ID`, and `BOSS_C142_GATEWAY_MODEL_ID`. `BOSS_C142_GATEWAY_CREDENTIAL_ENV` names the environment variable holding the authorized gateway credential. `BOSS_C142_GATEWAY_PROVIDER_BASE_URL` is optional. Credential values are used through the ordinary application configuration API and excluded from receipts.

The operation registers an isolated workspace, uses the existing coding preset and ordinary task admission APIs, and requests one bounded filesystem write. It opens a second packaged renderer through the supported `tab.detach` window route. Both renderer clients must display the same UAR-issued challenge and persisted record. One window detaches only its local output polling; the other confirms the executor remains running. Competing allow/deny actions must yield one authenticated decision; replay from the stale client must be refused. The actual file effect is checked separately according to the recorded winner. Output reattachment preserves the cursor.

A second write waits for approval and is stopped through the visible executor-stop control, which uses the existing attempt-cancel endpoint. Its authoritative record must become cancelled with no human decision, and the file must remain absent. The procedure then restarts UAR through its existing integration operation, reloads both renderers, and rereads the same decision and cancellation without creating new attempts.

The receipt identifies two distinct renderer targets in one authenticated application, not two independent application processes. Reopen means renderer reload and runtime restart, not a full application relaunch. The maintained launcher always creates a fresh profile and offers no same-profile app relaunch. This procedure adds no launcher API.

Existing durable-instance drain controls remain untouched. Team attempts expose cancellation, not a drain endpoint; this increment makes no team-drain claim. Native Windows, screen-reader, theme, keyboard and runtime acceptance remain unverified until the corresponding complete-boundary operation/review is performed. No result is inferred from source.

## Corrective cancellation boundary

The first packaged operation reached executor-stop and failed with `C142_EXECUTOR_CANCELLATION_NOT_OBSERVED`: the attempt was cancelled, but its durable record remained pending/nonresolvable. Its earlier race, detach, reattach and effect checks remain recorded in that failed operation's evidence. UAR repair `36f096dbda0f17c6e15c71b284ce89cb04f04502` is selected in the local source pin. The corrective procedure has not been invoked and no passing corrective result is claimed.

```text
node scripts/approval-lifecycle-operation/resume-cancellation.mjs --boss <C14.2-worktree> --output <new-receipt-directory>
```

Run only after the root packages the matching corrective native payload and stops its previously owned application process group. This focused application launcher uses the exact preserved isolated profile `/var/folders/ln/0wnpd96j26z2qhvx9m6hwt2r0000gn/T/cadence-boss-b5vrdX` and existing workspace/team `ea9ede2f-0308-4980-a7ee-e4af3b1e3984` / `386e6e37-7411-47d1-9c6c-d085c2a8e09a`. It reads the original failed evidence from the recorded C142 artifact directory and adds one uniquely named pending filesystem-write request. It uses the visible stop control, requires a durable cancelled record without a human decision, restarts UAR, and checks retained cancellation and the unchanged earlier decision. The original approved file's content and modification time, absence of cancelled files, and unchanged attempt identifiers after restart bound the effect-replay check.

This procedure launches the actual packaged executable with Node argument arrays, minimal environment and a fresh loopback CDP endpoint; it stops only the child process group it created. It changes no maintained skill launcher. The existing configured model and credentials come from the retained profile; it performs no gateway reconfiguration, team creation, approval race, detach or reattach operation. It uses one renderer for corrective cancellation/persistence and relies on the original evidence for the two-client checks. It does not repair or retroactively relabel the old already-cancelled attempt's pending challenge. It retains both the profile and separate new evidence for inspection, including failure codes when prerequisites or the operation fail. Native Windows and wider acceptance remain outside this corrective boundary.

## Completed bounded operation — 2026-10-07

The corrective application build and operation subsequently succeeded. Local task 5 was completed through `kbd-apply`; local scope is 5/5, while parent C14.2 remains pending. The exact-source results, original failure, first corrective scope refusal and passing cancellation/restart receipt are preserved in [evidence/README.md](evidence/README.md). Earlier source-only statements above describe their recorded preparation time. No full-parent, native Windows or publication acceptance is implied.
