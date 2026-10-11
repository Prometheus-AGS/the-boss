# Research plan: resilient CI/CD for The Boss

Scope: research and documentation only. No source/configuration edits, installations, builds, billing changes, workflow dispatches, purchases, commits or deployments.

## Questions

1. Which current release dependencies require GitHub Actions, and which merely require GitHub Git/API/artifact access?
2. What is the fastest practical way to resume four-platform Mac/Windows releases while Actions refuses jobs?
3. Which alternative control planes support independent manual/API/scheduled triggers and native workers for all four targets?
4. How should signing, native runtime operation, immutable payloads, resumability, publication and website updates work across providers?
5. What are the costs, operational burdens, limitations and reasons to reject alternatives?

## Method

Use Firecrawl web search and primary-source retrieval, Context7 where relevant, source inspection at recorded commits, claim labels and contradiction resolution. Compare Buildkite, self-managed Jenkins, GitLab, TeamCity, Azure Pipelines, CircleCI, Codemagic and hosted-runner substitutions. Separate immediate recovery from complete GitHub independence. Do not treat marketing claims as deployed proof. Use one independent adversarial review after source verification, resolve its findings, then export the report and evidence package. No arbitrary source-count target; stop when the decision questions have primary evidence and remaining unknowns are explicit.

## Task ledger

- 01 Planner: complete; bounded question and comparison criteria defined.
- 02 Search: complete; Firecrawl discovery recorded.
- 03 Retrieve: complete; primary pages retrieved, review-requested pricing sources added.
- 04 Collect: complete; local source registry and chunks are persistence fallback.
- 05 Verify: complete; primary-source credibility recorded before review; recommendations and account access remain qualified.
- 06 Resolve: complete; four distinctions resolved and two uncertainties retained.
- 07 Graph: complete; labelled claims and evidence relationships saved.
- 08 Cite: complete; primary citations saved.
- 09 Report and independent review: complete; initial independent review BLOCK, corrections made, bounded confirmation PASS with no remaining findings. Automated Feynman gate skipped; package remains partial.
- 10 Export: complete; report, provenance, sources, claim graph and review receipts exported. Final document consistency receipt accompanies the package.

## Verification log

No new CI deployment or provider trials are authorized. Documented capability is not operational certification.

## Decision log

Research only; implementation choices remain proposals. Existing two-hour cadence, local Mac ARM64 build per delivery, four-platform publication and exclusion of Linux remain requirements.

## Bounded review correction

Initial reviewer found two critical issues: publication eligibility before expensive builds, and unsupported provider ranking without comparable costs. Added an admission gate, explicit alternate-origin decision, wider cost/ownership comparison and conditional pilot language. Added exact external entrypoint mapping, partial-effect/dispatch/clobber hazards, all-four-platform acceptance and explicit confidence definition. No changes to production code.
