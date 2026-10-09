import { ipc } from '../reusable-team-operation/scenario.mjs'
import { route } from '../reusable-team-operation/io.mjs'

const metadata = (entry) => ({
  skillId: entry.skillId,
  availability: entry.availability,
  reasons: entry.reasons,
  reviewedCoverage: { status: entry.reviewedCoverage.status, reason: entry.reviewedCoverage.reason },
  artifact: entry.skillRef && { id: entry.skillRef.id, version: entry.skillRef.version,
    digest: entry.skillRef.digest, entrypoint: entry.skillRef.entrypoint,
    requiredTools: entry.skillRef.requiredTools }
})

export async function skillSelectionEvidence(evaluate, skill, selector) {
  const dom = await evaluate(`(() => {
    const member=document.querySelector('[data-ui~="team-authoring-member"][data-role="reviewer"]');
    const matches=[...document.querySelectorAll(${JSON.stringify(selector)})];
    const control=node=>({tag:node.tagName,role:node.getAttribute('role'),type:node.getAttribute('type'),
      visible:Boolean(node.getClientRects().length),disabled:Boolean(node.disabled),
      effectivelyDisabled:node.matches(':disabled'),ariaDisabled:node.getAttribute('aria-disabled'),
      checked:node.getAttribute('aria-checked'),state:node.getAttribute('data-state'),
      fieldsetDisabled:Boolean(node.closest('fieldset[disabled]'))});
    return {memberExists:Boolean(member),memberVisible:Boolean(member?.getClientRects().length),
      matchingCheckboxes:matches.map(control),
      displayedSkills:[...(member?.querySelectorAll('[data-ui~="team-authoring-skill"]')??[])]
        .filter(node=>node.getAttribute('data-skill-id')===${JSON.stringify(skill.skillId)})
        .map(node=>({skillId:node.getAttribute('data-skill-id'),digest:node.getAttribute('data-skill-digest'),
          coverage:node.querySelector('[data-skill-coverage]')?.getAttribute('data-skill-coverage'),
          controls:[...node.querySelectorAll('button,input,[role="checkbox"]')].map(control)}))};
  })()`)
  const current = await ipc(evaluate, route('skills'), {})
  return { expected: metadata(skill), dom,
    currentCatalog: current.entries.filter((entry) => entry.skillId === skill.skillId).map(metadata) }
}
