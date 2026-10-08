## ADDED Requirements

### Requirement: Bounded specialist delivery preset
The Boss SHALL offer a Specialist delivery preset with one coordinator and six specialists: product, UI/UX, mobile, security, documentation and separate code review. Authoring SHALL admit at most seven members using existing native team execution.

#### Scenario: Create the specialist team
- **WHEN** an operator selects Specialist delivery in the existing Settings authoring surface
- **THEN** seven editable members appear with explicit responsibilities and existing manual model/resource controls, and add-role is disabled at seven.

### Requirement: Inspectable member delivery instructions
The existing member editor SHALL accept project-relative scope, output instructions and evidence instructions as ordinary text. Absent fields in older authored teams SHALL behave as empty values without rewriting old revisions.

#### Scenario: Save and reopen scoped work
- **WHEN** the operator edits member delivery instructions, saves and reopens the named revision
- **THEN** all text remains visible and the existing models, tools, skills and knowledge selections remain intact.

### Requirement: Immutable instruction identity without new authority
Populated member delivery fields SHALL compile into existing agent instructions and source identity, changing new revision identity. They SHALL NOT grant tools, enforce ownership, install skills or claim model-policy compliance.

#### Scenario: Revise a specialist after deployment
- **WHEN** an operator changes a member's scope, output or evidence instructions and saves another revision
- **THEN** the new package/definition digests change while prior revisions and running instances retain their exact identities and authority.

### Requirement: Real packaged operation evidence
Completion SHALL require a normal-profile packaged application author/save/deploy/run/reopen operation against real UAR/gateway execution and a disposable workspace.

#### Scenario: Complete all specialist work
- **WHEN** the completed packaged operation runs at root's delivery boundary
- **THEN** real successful attempts and marker-bearing artifacts exist for all six specialists, manual model receipts remain inspectable, and reopen preserves revisions and attempts without repeating work.
