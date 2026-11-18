---
name: convert-htmx-react
description: >
  Convert an HTMX + Alpine.js HTML artifact into a React TSX component ready
  for the scaffold-react-vite pipeline. Mechanical transforms run via a Node
  script; HTMX/Alpine constructs requiring judgment are surfaced as a sidecar
  markdown for review.
license: MIT
metadata:
  version: '1.0.0-prometheus.1'
  tags: 'artifact-refiner, convert, htmx, react'
  version-origin: 'Prometheus packaging version; upstream did not declare a version'
---

# Convert HTMX ↔ React

Convert an HTMX + Alpine.js HTML artifact into a React TSX component.

## Setup

1. Set `artifact_type: html` (input) → `react` (output)
2. Set `content_type: direct:react`
3. Load domain adapter from `references/domain/ui.md`

## User Input

The user will provide: $ARGUMENTS

Parse the arguments for:
- `--source <path-to-html>` (required)
- `--feature-name <kebab-name>` (required) — used to name the component (PascalCase) and the hook
- `--output <path-to-tsx>` (required)
- `--ambiguous-sidecar <path>` (optional; default `<output>.ambiguous.md`)
- `--manifest <path-to-od-prototype.json>` (optional) — a KnowDesign prototype manifest (`htmx-alpine-prototype` template). With it, routes become typed TanStack Query hooks and matching `hx-*` calls name the hook to use (see below).

## Procedure

Dispatch to the orchestration script:

```bash
boss-mini convert-htmx-react.mjs \
  --source "${SOURCE}" \
  --feature-name "${FEATURE}" \
  --output "${OUTPUT}"
```

The script:

1. Parses the HTML via `parse5` (spec-conformant HTML5 parsing).
2. Walks the tree and emits JSX with mechanical transforms:
   - `class` → `className`, `for` → `htmlFor`
   - Inline `style="a: b"` → `style={{ a: "b" }}`
   - Self-closing tags closed
   - `data-*`, `aria-*`, `role`, `id`, `src`, `href`, etc. pass through unchanged
3. Lifts Alpine `x-data="{ count: 0 }"` into a named hook `use<Feature>State` exporting `useState` declarations.
4. Converts Alpine bindings:
   - `@click="count++"` → `onClick={() => setCount((v) => v + 1)}`
   - `@click="x = expr"` → `onClick={() => setX(expr)}`
   - `x-text="count"` → `{count}` JSX child
5. Surfaces to the sidecar (and leaves a marker comment in JSX):
   - HTMX `hx-*` behaviors (`hx-get`, `hx-post`, `hx-target`, `hx-swap`)
   - `x-show`, `x-model`, `x-if` (non-trivial Alpine constructs)
   - Complex Alpine expressions

## Manifest input (KnowDesign prototypes)

Prototypes from KnowDesign's `htmx-alpine-prototype` template ship `od-prototype.json` beside the page (routes, components, Alpine state, entities, token roles). Pass it with `--manifest`:

- The script also writes `<output>.api.ts`: one `<Entity>Item` interface per entity, plus one hook per route. GET routes become `useQuery` (`use<Entity>List`, `use<Entity>Detail(id)`); writes become `useMutation` with cache invalidation (`use<Entity>Create`, `Update`, `Delete`, `Toggle`). `form` routes are UI-only and get no hook.
- An `hx-get`/`hx-post`/`hx-put`/`hx-patch`/`hx-delete` whose method and path match a manifest route is reported as `htmx-manifest` in the sidecar, naming the exact hook. Unmatched `hx-*` calls keep the generic recommendation.
- Hooks call the routes as JSON endpoints (`Accept: application/json`) under `VITE_API_BASE`. KnowDesign's `od-axum-export` server answers them with fragments today; a JSON variant is the next step.
- Route fragments inside `<template data-od-route>` are not walked (parse5 keeps template content separate). Their actions are covered by the generated hooks, not by per-element sidecar entries.

## Reviewing Ambiguous Regions

The sidecar `<output>.ambiguous.md` lists each region the script couldn't auto-convert with confidence. For each region:

1. Source HTML/Alpine fragment
2. Recommended React equivalent
3. The reasoning (e.g., "hx-post + hx-target + hx-swap → useState + fetch + setState")

Review each region, accept the recommendation or propose an alternative, and apply the change manually before feeding the TSX into the scaffolder. The script's job is to do 90% mechanical work and document the remaining 10% clearly — not to guess.

## State Lift Threshold

When the source HTMX contains Alpine `x-data="{ ... }"`, the converter lifts
the state to React. The threshold determines the *shape* of the React state:

| Alpine x-data shape | React shape |
|---|---|
| Single boolean field (`{ open: false }`, `{ active: true }`) | Local `useState` hook |
| Multi-field (`{ count: 0, label: "idle" }`) | zustand+immer store + hook adapter |
| Single non-boolean field (`{ count: 0 }`) | zustand+immer store + hook adapter |

Rationale: per `references/scaffolds/state-architecture.md`, ephemeral
single-component state (e.g., dropdown open/closed) belongs in local `useState`;
anything that might be shared, persisted, or grow beyond a toggle belongs in
a store. The threshold catches counts, labels, and arrays at conversion time so
the scaffolder's `useXxxStore` routing picks them up correctly.

## Default Constraints

- v1 is **HTMX → React only**. Reverse direction (React → HTMX) is deferred.
- Source must be a single `.html` fragment or document.
- Output is a single `.tsx` file with a default-exported component named `<PascalFeature>` and (if Alpine state was present) a named hook `use<PascalFeature>State`.
- Output is scaffolder-ready — no further hand-editing needed for the scaffolder to consume it.

## Output Contract

```yaml
artifact_type: react
content_type: direct:react
outputs:
  - path: <output>.tsx
    description: Scaffolder-ready TSX with default component + optional named hook
  - path: <output>.ambiguous.md
    description: (only when ambiguous regions found) review-required transforms
constraints_satisfied:
  - mechanical_transforms_complete
  - alpine_state_lifted_to_useState
  - htmx_behaviors_documented_for_review
  - scaffolder_input_shape_matched
```

## Composition with Other Skills

Typical flow:

```
HTMX artifact → convert-htmx-react → TSX → scaffold-react-vite → built Vite project
                                                            ↓
                                          (optionally) → rebrand-artifact for brand swap
```

## References

- `scripts/convert-htmx-react.mjs` — the orchestration script
- `openspec/changes/phase-3-conversion-layer/` — design rationale
