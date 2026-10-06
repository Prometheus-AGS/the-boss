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
