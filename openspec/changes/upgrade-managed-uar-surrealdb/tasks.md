## 1. Implement

- [x] Detect and copy legacy embedded data on managed startup under the native database lock.
- [x] Keep the original and recover interrupted cutover.

## 2. Verify

- [x] Build the RC4 payload and the Apple Silicon installer.
- [x] Verify migration and relaunch using a copy of an existing database.

The local RC4 candidate was built from UAR commit `da5064cf626fb354e631417323e67d7e407ee3b4`. `pnpm build:mac:arm64` exited 0 and validated the `uar-enabled-local` image and installer. The installer SHA-256 is `5630cf2ededb42f15bfca0df1c256ce11f7c7ff9e3ba5ca5ce6291e991d154aa`.

The packaged converter retained the record IDs and counts of all 56 tables. Packaged startup retained a byte-for-byte legacy copy, and recovery succeeded after an interrupted cutover. A database lock held by another process prevented migration while preserving the legacy files. The isolated profile reopened both UAR chats, retained 23 app sessions, one binding context, and 263 stored messages, and reconnected BossFang to managed UAR 1.4.0-rc.4 automatically on relaunch. Mac Intel and Windows packaging and notarization remain pending.
