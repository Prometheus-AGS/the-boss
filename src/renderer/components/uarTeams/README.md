# Team authoring guidance

Settings → Universal Agent Runtime → Teams uses the existing private revision,
catalog deployment and Work execution contracts. C16.3 adds guidance to those
controls; it does not create another executor or permission system.

1. Describe one useful outcome and the evidence needed to show completion.
2. Choose the smallest set of roles with distinct outputs. Sequential work can
   use the **Open single-agent Work** action instead. Teams retain their existing
   minimum of two members.
3. Give every member a project-relative scope, output and evidence instructions.
   Combine research and implementation only when one owner can do them in order;
   describe both responsibilities and outputs in that member's instructions.
   Keep an independent evaluator separate when independent review is required.
4. Select models, reviewed skills, tools and knowledge explicitly. Creator guide
   skills are suggestions, not installation evidence or resource grants. Imported
   roles remain proposals until explicitly mapped and applied. Applying them
   copies responsibility/instructions, preserving existing resource selections.
5. Save an immutable revision, then deploy it to the intended workspace. Existing
   runs keep their original definitions; reopening does not execute them again.

## Price and strength guidance

Reviewed model results show their strength class and known input/output rates per
million tokens. A missing class or rate remains **Unknown**, never zero. Source
units, currency, provenance and freshness remain inspectable. Operator strength
annotations are selection guidance, not price measurements or a promise that a
model satisfies a particular task. Budget ceilings limit execution; they do not
forecast its cost. Comparing measured team cost against one agent remains a
separate acceptance scenario and is not claimed by this authoring surface.

## Regulated work

Before delegation, identify applicable policy, data restrictions, allowed tools
and required human review in the shared instructions. Instructions cannot expand
resource grants or bypass approvals. Presets and guidance do not certify
compliance, authorize publishing or replace the operator's domain review.

## Component ownership

- `UarTeamAuthoringGuide.tsx`: novice sequence and single-agent alternative.
- `UarTeamGuidance.tsx`: creator receipt, readable alternatives/discovery and
  explicit proposal mapping.
- `UarTeamModelCost.tsx`: nullable price/class display and original provenance.
- `UarTeamReviewedModelPolicy.tsx`: existing import/accept/manual-choice lifecycle.

The completed delivery procedure is `scripts/operate-team-guidance.mjs`. It must
run only after the real Mac package is built. It operates real settings controls,
actual packaged creator code, existing IPC/private revision storage and UAR
deployment, then reopens the revision and follows ordinary Work navigation.
Its authoring-only result does not claim new inference, measured savings,
certification, process-restart recovery or installed Windows acceptance.
