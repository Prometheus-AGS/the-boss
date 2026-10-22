
## Scenario contract fields (adopted-contract.schema.json)

| Field | Required declaration |
|---|---|
| Stable scenario ID | <immutable ID matching ^[A-Z]+-[0-9]+$, frozen before implementation> |
| Fixture/permission readiness | <scratch roots (HOME/XDG/canonical project/store/hook/memory), fixture content digests, OR the named boundary prerequisite that is NOT_EXERCISED> |
| Owner task | <owning task ID from tasks.json> |
| Evidence invalidation keys | <source digest / plan revision / fixture identity that invalidate THIS scenario's evidence> |

Status vocabulary (exactly four): PASS / FAIL (product: real oracle unmet) /
BLOCKED (verification: validator/env/fixture unavailable) / NOT_EXERCISED.
Record attempted/observed/evidence per run. Unknown is not success; unknown is
not observed failure. Delivery/packaging-only checks (e.g. strict skill
validation) must be marked as such; their failure never cascades into
product-failure claims for product scenarios.
