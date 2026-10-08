## ADDED Requirements

### Requirement: The Boss administers scoped team assignments
The Boss SHALL expose fixed typed operations for a workspace's team task claim, reassignment and reviewer selection. It SHALL display the UAR-returned status, owner and fencing epoch and SHALL not infer that assignment starts execution.

#### Scenario: Reassign a task in the installed app
- **WHEN** an operator reassigns a ready task through Teams settings
- **THEN** the page shows the returned owner and newer epoch, and a stale revision is reported as a conflict

### Requirement: The Boss shows durable team communication truthfully
The Boss SHALL send an addressed team message through its trusted UAR adapter and show accepted, delivered and processed as separate states. It SHALL not represent `trigger-turn` intent as a running agent until UAR reports an admitted turn.

#### Scenario: Reopen after restart
- **WHEN** the installed app restarts after sending a message
- **THEN** the Teams page reads the same UAR message and displays its actual persisted receipt stage
