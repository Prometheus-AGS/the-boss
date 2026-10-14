# Completed-source boundary review

The independent read-only review traced the native and host memory contracts against the actual Surreal Memory API. It found one concrete defect: applying a different workspace automatically restarted BossFang and revoked authority needed by active delegated executions.

Resolution: configuration application now checks retained delegated executions and native in-flight session snapshots before mutating settings or restarting the process. Unresolved cancellation, active work, or unavailable activity evidence leaves the draft unapplied with a translated recovery message. Memory callbacks retain their original selected connection and rotate when its endpoint changes.

This is source-review evidence only. Installed operation, restart persistence, isolation, and publication remain pending the new 2.2.35 package. No unit or partial verification suite was run.
