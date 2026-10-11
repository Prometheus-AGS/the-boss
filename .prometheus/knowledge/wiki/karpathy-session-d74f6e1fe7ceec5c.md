---
type: SessionRecord
id: karpathy-session-d74f6e1fe7ceec5c
title: Karpathy session d74f6e1fe7ce
tags:
- karpathy
- session-learning
sources:
- session:4141ece4-2ce1-4151-8def-3102b43ff3fd
timestamp: 2026-09-21T18:28:55.109041+00:00
created_at: 2026-09-21T18:28:55.109041+00:00
updated_at: 2026-09-21T18:28:55.109041+00:00
revision: 0
---

## Delta

Yes — this project has substantial artifact support, though not for React specifically.

## What's supported

**HTML artifacts — full-featured.** A dedicated subsystem: `remarkHtmlArtifact` detects complete HTML documents in chat responses and promotes them into a live preview surface (`HtmlArtifactView`, `HtmlArtifactsPopup`, `HtmlPreviewFrame`), with an `ArtifactPane` that includes a file tree, editing, and screenshot capture.

**Rendered code-block languages** — 7 special views, each lazy-loaded:

| Language | Renderer | Image export |
|---|---|---|
| `svg` | SvgPreview | ✅ |
| `mermaid` | MermaidPreview | ✅ |
| `plantuml` | PlantUmlPreview | ✅ |
| `dot` / `graphviz` | GraphvizPreview | ✅ |
| `echarts` | EChartsPreview | ✅ |
| `latex` | LatexPreview | — |

So **HTML and SVG are both first-class**, as are the diagram formats.

## React is *not* supported

I checked specifically: there's **no browser-side JSX transpiler** in the dependency tree — no `@babel/standalone`, `sucrase`, `esbuild-wasm`, or `swc/wasm`. Without one, a `jsx`/`tsx` code block can't be compiled and executed at runtime, so it renders as syntax-highlighted code rather than a live component.

React artifacts would need a transpiler added plus a component host. Achievable — the HTML sandbox already exists to render into — but it's a feature, not a config flag.

## Worth knowing about the sandbox

`HtmlPreviewFrame` has **two** modes, and the comments are emphatic about why:

- **Restricted** (the default) — empty `sandbox`, fully locked down
- **Interactive** — scripts run **same-origin with the app**, explicitly noted as reachable to `parent.api` and the legacy `fs.read*` bridge

That second mode is intended only for content whose scripts the user has accepted. If React artifact support gets built, that boundary is the thing to get right — arbitrary model-generated code running same-origin with filesystem bridge access is a meaningful risk surface.

Want me to trace how the interactive/restricted decision is actually made, or scope what React support would take?

## Root Cause

No explicit root-cause section was captured; preserve this as a session record, not an inferred diagnosis.

## Corrective Actions

Review and promote only reusable findings.

## Session Metadata

- Harness: claude-code
- Session: 4141ece4-2ce1-4151-8def-3102b43ff3fd
- Captured: 2026-09-21T18:28:40.877456Z
- Project: /Users/gqadonis/Projects/prometheus/the-boss

## Changed Paths

- No changed paths detected.
