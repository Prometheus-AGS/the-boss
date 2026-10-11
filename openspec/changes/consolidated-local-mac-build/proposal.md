# Consolidated local Mac build

Operator requested the frontend typing repair on main, a usable local Apple Silicon DMG, and retirement of other branches, worktrees and active Cadence state.

Use UAR main d4e819d1c0dfe9d12274299d52f1bd6c9c7cd95a for the local native sidecar. Build The Boss 2.2.33 through the existing build:mac:arm64 entrypoint, preserving published payload provenance for other tools. No native API or storage changes. The standalone UAR frontend is built separately; The Boss uses its existing administration UI.

Build the installer once after source wiring, use its existing package validation and launch the resulting application with an isolated profile. Fix observed build failures only. No public release publication or broad qualification is included.
