# Explicit author-only BDD route

Invocation is a skill instruction, not a cucumber flag:

`/bdd-cucumber-js author-only <contract-reference> <scenario-IDs>`

1. Read the governing repository policy, the selected method and the latest
   non-superseded adopted contract. Reuse reviewed calibration and permissions;
   never repeat an approval already given for this scope. Scenario definitions
   precede generation. Where policy is production-first, wait for the complete
   agreed production implementation before writing these artifacts.
2. Resolve only adopted stable scenario IDs with their owner tasks, production
   entries, fixtures and required evidence. Refuse unknown IDs, stale identities
   or missing authoring authority without inventing scope.
3. Write declarative features tagged with the stable IDs, real assertions, steps
   and config per `SKILL.md`. Write `assertion-map.json` with contract digest,
   requirement source, expected-truth source, real boundary and the plausible
   false positive each assertion excludes. Steps must exercise the production
   operation; they must not merely return success or assert a process exit.
4. Stop after writing and statically inspecting the requested files. Do not
   execute, import or require support modules, compile, install dependencies, run
   lint or typecheck, invoke runner help or discovery, or dry-run. Cucumber
   dry-run loads support code and cannot establish this boundary. Do not modify
   protected scenarios without their existing signed approval.
5. Report exact files, the approved IDs mapped, assumptions and missing fixtures,
   and "authored only; NOT_EXERCISED". This is not behavioral acceptance.

Execution is a different invocation: `value-scenario-verify`, at the complete
authorized value-phase boundary. Missing prerequisites block; they never trigger
installation or an early diagnostic run.
