# UAR workflow consumption and pending acceptance

UAR PR [#344](https://github.com/Prometheus-AGS/universal-agent-runtime/pull/344) was merged into `main` as `bb6ea8ba10378732db5647c6957ba88788626ff9` on 2026-10-04. The Boss release payload should use native sidecar archives built from that exact commit on each supported Mac and Windows architecture. Do not substitute the earlier `c906c24f` or pre-merge `1db1afb4` archives for this pin.

The PR recorded a packaged Mac ARM64 operation at `1db1afb4`: two real model attempts, a draft and wait surviving a UAR restart, acceptance of the exact draft, and idempotent repetition of the decision command. That evidence does not certify the merged commit or an installed Windows application.

**Pending delivery-boundary validation:** After The Boss is packaged with the `bb6ea8ba` sidecar, operate the classify → draft → human decision workflow in an installed Windows x64 application and a local Mac ARM64 application. Confirm the selected model responds, the draft and wait survive a UAR restart, the exact draft can be approved, and repeating the decision has no second effect. Record the installer commit, sidecar archive checksum, operating system, outcome, and any failure in the release acceptance record. Until then, report workflow runtime acceptance as pending even if the native binaries build and the source pin is updated.
