## ADDED Requirements

### Requirement: Persisted startup choice
The Boss SHALL retain the operator's startup choice between an identified existing local UAR and its managed UAR. Changes to this choice SHALL preserve existing session placement and SHALL NOT grant authority over an external process.

#### Scenario: Selection changes
- **WHEN** the operator changes the selected startup instance
- **THEN** new sessions use the verified choice and existing sessions remain bound to their original instance.
