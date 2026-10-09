import { click, ipc, openWork } from '../reusable-team-operation/scenario.mjs'
import { requireFact, waitFor } from '../reusable-team-operation/io.mjs'

export async function chooseText(evaluate, signal, selector, text) {
  await click(evaluate, signal, selector)
  await waitFor(signal, () => evaluate(`(() => {
    const nodes=[...document.querySelectorAll('[role="option"]')]
      .filter(node=>node.getClientRects().length&&node.innerText.trim()===${JSON.stringify(text)});
    if(nodes.length!==1)return false;
    nodes[0].focus();nodes[0].dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return true;
  })()`), 'C10_EXACT_VISIBLE_OPTION_REQUIRED')
}

export async function feedbackWork(evaluate, signal, workspaceId) {
  await openWork(evaluate, signal)
  await click(evaluate, signal, '[data-ui~="teams-workspace"]')
  await click(evaluate, signal, `[data-option-id="${workspaceId}"]`)
  const open = await evaluate('document.querySelector("[data-ui~=team-feedback-open]")?.getAttribute("aria-expanded")==="true"')
  if (!open) await click(evaluate, signal, '[data-ui~="team-feedback-open"]')
  await waitFor(signal, () => evaluate('Boolean(document.querySelector("[data-ui~=team-feedback-start]"))'),
    'C10_FEEDBACK_WORK_ENTRY_REQUIRED')
}

export async function selectIntake(evaluate, signal, workspaceId, intakeId) {
  await feedbackWork(evaluate, signal, workspaceId)
  const snapshot = await ipc(evaluate, 'prometheus.uar.feedback.snapshot', { workspaceId })
  const selected = snapshot.intakes.find((item) => item.id === intakeId)
  requireFact(selected, 'C10_PERSISTED_INTAKE_REQUIRED')
  const optionText = await evaluate(`${JSON.stringify(selected.feedback.slice(0, 80))}+' · '+new Date(${JSON.stringify(selected.createdAt)}).toLocaleString()`)
  await chooseText(evaluate, signal, '[data-ui~="team-feedback-intake"]', optionText)
  await waitFor(signal, () => evaluate('document.querySelector("[data-ui~=team-feedback-run]")?.getAttribute("data-intake-id")===' +
    JSON.stringify(intakeId)), 'C10_PERSISTED_INTAKE_NOT_VISIBLE')
}

export async function previewVisible(evaluate, signal, selector) {
  await click(evaluate, signal, '[data-ui~="team-feedback-preview"]')
  await waitFor(signal, () => evaluate('Boolean(document.querySelector("[data-ui~=team-feedback-preview-content]"))'),
    'C10_EXACT_DRAFT_PREVIEW_REQUIRED')
  const detail = await ipc(evaluate, 'prometheus.uar.feedback.preview', selector)
  const shown = await evaluate(`(() => {
    const root=document.querySelector('[data-ui~=team-feedback-preview-content]');
    return {artifactId:root?.dataset.artifactId,artifactDigest:root?.dataset.artifactDigest,
      payloadDigest:root?.dataset.payloadDigest,target:document.querySelector('[data-ui~=team-feedback-preview-target]')?.textContent,
      title:document.querySelector('[data-ui~=team-feedback-preview-title]')?.textContent,
      body:document.querySelector('[data-ui~=team-feedback-preview-body]')?.textContent};
  })()`)
  requireFact(detail.preview && ['artifactId', 'artifactDigest', 'payloadDigest', 'target', 'title', 'body']
    .every((key) => shown[key] === detail.preview[key]), 'C10_VISIBLE_PREVIEW_BYTES_MISMATCH')
  return detail
}
