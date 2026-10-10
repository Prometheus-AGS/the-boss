# Measurement and decisions

Keep production scope, build, launch, feature operation, publication and installed acceptance separate. Tasks, changes and phases are distinct dimensions, never a summed score. Canonical KBD owns completion; receipt references do not create certification.

## Report v3

Reports retain gross completed IDs, reopened IDs, current net-completed IDs and carryover. Parent and attached child events share canonical identities, so a child completion repeated in its parent is counted once. Explicit completion/reopen timestamps determine current state. Ambiguous legacy order is reported as uncertain rather than silently credited. Historical child links contribute no completion or delivery credit.

Record planning, implementation, rework, coordination and waiting with activity start/stop; build/run/hook spans are automatic. Import trustworthy feature/publication receipt intervals where available. Intervals are clipped to iteration bounds and unioned, so concurrent work is not added into fictitious elapsed time. Child duration is a separate envelope and is not itself evidence of observed activity.

Reports show elapsed, observed work, observed waiting, unattributed time and coverage. Missing timestamps/costs remain unknown. `active` is unknown unless coverage is complete. Open activities and invalid spans disqualify optimization. Publication intervals outside the delivery remain in receipts; do not force them into iteration wall time or infer end-to-end publication overhead from the clipped ratio.

## Optimization

Eligibility requires at least configured `minimumSamples` (minimum 3), successful comparable deliveries and at least 99% observed timing coverage with no open/invalid spans. Compare repositories, stable checkpoint command contracts, delivery class and relevant profile settings. Retry counts are observations, not separate comparison classes. Always supply a meaningful delivery class.

Thresholds are starting heuristics, not performance laws: repeated resource blocking above 20% suggests lowering implementation concurrency; build/operation share above 35% may suggest adding 30 minutes; measured publication share above 35% may suggest a less frequent optional publication. Use explicit bounds. Never weaken required gates, postpone existing publication debt, or optimize raw task counts.

Each recommendation records evidence, baseline, expected effect and a pending follow-up. One applied setting changes at a time. Subsequent comparable observed results are an association, not proof of causation. Missing or noncomparable evidence yields no recommendation. Keep the approved project duration/publication bounds fixed until the operator changes them.

## Learning and honesty

The finalized report summarizes delivered scope/carryover, child interruption time, repeated builds/reasons, resource and coordination observations, and one supported recommendation or insufficient-evidence statement. Configure the optional learning recorder through `learning.command`, string-array `learning.args`, and `learning.cwd`; `{report}` in an argument expands to the durable report path. The recorder emits a JSON receipt. Missing/offline recording is degraded evidence, not a failed delivery.

Report work-ahead firstWorkAt through promotion, queue/debt age, platform/site completion and separately pending installed acceptance. Union overlapping intervals rather than adding parallel wall time. Include repeated-build causes and external-receipt adoption so saved rebuilds are distinguishable from missing operation.

Team concurrency caps are harness instructions, not claims of machine-wide scheduling. Shared physical reservations coordinate cooperating local commands only. Native Windows/macOS execution evidence must identify the actual platform. Portable code alone cannot certify either; unavailable execution stays pending.

Research behind the process: [DORA small batches](https://dora.dev/capabilities/working-in-small-batches/), [DORA metrics](https://dora.dev/guides/dora-metrics/), [SPACE](https://www.microsoft.com/en-us/research/publication/the-space-of-developer-productivity-theres-more-to-it-than-you-think/), and [long-running harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents). These support usable increments and durable handoffs, not per-task test loops or throughput leaderboards. Whether one or two hours performs better remains a local empirical question.
