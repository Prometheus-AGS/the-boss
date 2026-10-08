import fs from 'node:fs'
import { click, fill, choose, ipc, openAuthoring } from '../reusable-team-operation/scenario.mjs'
import { requireFact, route, same, waitFor } from '../reusable-team-operation/io.mjs'
import { fields, memberSelector, fieldSelector, readOnlyInstructions, readTools } from './contracts.mjs'

async function applyDeclaredContext({ evaluate, signal, selected, configuration, accepted, evidence }) {
  const declarationPath = process.env.BOSS_C16_MODEL_CONTEXT_DECLARATION
  if (!declarationPath) return
  const declaration = JSON.parse(fs.readFileSync(declarationPath, 'utf8'))
  requireFact(declaration.alias === configuration.gateway.alias &&
    declaration.modelId === configuration.gateway.modelId && declaration.providerId === configuration.gateway.providerId &&
    Number.isInteger(declaration.contextWindow) && declaration.contextWindow > 0,
  'C16_DECLARED_MODEL_CONTEXT_MISMATCH')
  await click(evaluate, signal, '[data-ui~="team-authoring-deploy"]')
  await waitFor(signal, async () => (await ipc(evaluate, route('snapshot'), { workspaceId: selected.workspaceId }))
    .bindings.some((item) => item.activationSupported && same(item.package, accepted.package)),
  'C16_PRACTICAL_DEPLOYMENT_UNAVAILABLE', 60000)
  const sources = await ipc(evaluate, 'prometheus.uar.models.sources', {})
  const provider = sources.sources.find((source) => source.source === 'uar')?.providers.find((item) =>
    item.name === 'liter-llm · ' + declaration.alias && item.models.some((model) => model.id === declaration.alias))
  requireFact(provider, 'C16_DECLARED_CONTEXT_PROVIDER_UNAVAILABLE')
  if (provider.models.find((model) => model.id === declaration.alias).contextWindow !== declaration.contextWindow) {
    await evaluate(`(()=>{const event=new CustomEvent('cherry:open-main-route',{cancelable:true,
      detail:{path:'/settings/uar?panel=providers-models'}});window.dispatchEvent(event);return event.defaultPrevented})()`)
    await click(evaluate, signal, '#uar-provider-select')
    await waitFor(signal, () => evaluate(`(()=>{const node=[...document.querySelectorAll('[role="option"]')]
      .find(n=>n.getClientRects().length&&n.innerText.trim()===${JSON.stringify(provider.name)});
      if(!node)return false;node.focus();node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return true})()`),
    'C16_DECLARED_CONTEXT_PROVIDER_OPTION_UNAVAILABLE')
    const models = await waitFor(signal, () => evaluate(`(()=>{try{const value=JSON.parse(document.querySelector('#uar-provider-models')?.value);
      return value.some(m=>m.id===${JSON.stringify(declaration.alias)})?value:false}catch{return false}})()`),
    'C16_DECLARED_CONTEXT_MODELS_UNAVAILABLE')
    await fill(evaluate, signal, '#uar-provider-models', JSON.stringify(models.map((model) =>
      model.id === declaration.alias ? { ...model, contextWindow: declaration.contextWindow } : model), null, 2))
    await waitFor(signal, () => evaluate(`(()=>{const button=[...document.querySelectorAll('button')]
      .find(n=>n.getClientRects().length&&!n.disabled&&n.innerText.trim()==='Save');if(!button)return false;button.click();return true})()`),
    'C16_DECLARED_CONTEXT_SAVE_UNAVAILABLE')
    await waitFor(signal, async () => (await ipc(evaluate, 'prometheus.uar.models.sources', {})).sources
      .find((source) => source.source === 'uar')?.providers.find((item) => item.id === provider.id)?.models
      .some((model) => model.id === declaration.alias && model.contextWindow === declaration.contextWindow),
    'C16_DECLARED_CONTEXT_NOT_PERSISTED')
    await openAuthoring(evaluate, signal, selected.workspaceId)
    await choose(evaluate, signal, '[data-ui~="team-authoring-select"]',
      '[role="option"][data-authored-team-id="' + accepted.team.id + '"][data-authored-revision="' + accepted.revision + '"]')
  }
  evidence.modelContextConfiguration = { ...declaration, configurationSurface: 'existing UAR provider settings', providerId: provider.id }
}

async function selectMemberModel(evaluate, signal, role, model) {
  const trigger = memberSelector(role) + ' [data-ui~="teams-model"]'
  await click(evaluate, signal, trigger)
  const menu = await waitFor(signal, () => evaluate('document.querySelector(' + JSON.stringify(trigger) +
    ')?.getAttribute("aria-controls")'), 'C16_PRACTICAL_MODEL_MENU_UNAVAILABLE')
  const option = '[role="option"][data-model-source="gateway"][data-provider-id="' + model.providerId +
    '"][data-model-id="' + model.modelId + '"]'
  await waitFor(signal, () => evaluate('(()=>{const node=document.getElementById(' + JSON.stringify(menu) +
    ')?.querySelector(' + JSON.stringify(option) + ');if(!node||!node.getClientRects().length)return false;' +
    'node.focus();node.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));return true})()'),
  'C16_PRACTICAL_MEMBER_MODEL_OPTION_UNAVAILABLE')
  await waitFor(signal, () => evaluate('(()=>{const node=document.querySelector(' +
    JSON.stringify(memberSelector(role) + ' [data-ui~="uar-team-model-picker"]') +
    ');return node?.getAttribute("data-selected-model")===' + JSON.stringify(model.modelId) +
    '&&node?.getAttribute("data-selected-source")==="gateway"})()'), 'C16_PRACTICAL_MEMBER_MODEL_NOT_SELECTED')
}

export async function authorPreset({ evaluate, signal, selected, configuration, preset, skill, evidence }) {
  const authoring = () => ipc(evaluate, route('authoring'), {})
  const title = configuration.marker + ' ' + preset.template
  await openAuthoring(evaluate, signal, selected.workspaceId)
  const templates = (await authoring()).templates
  const template = templates.find((item) => item.template === preset.template)
  requireFact(template && same(template.members.map((member) => member.role), preset.roles) &&
    template.members.every((member) => !member.model && !member.skills.length && !member.knowledge.length &&
      member.projectScope === '' && member.outputInstructions && member.evidenceInstructions &&
      member.tools.every((tool) => readTools.includes(tool))), 'C16_PRESET_DEFAULTS_OR_RESOURCE_CHOICES_CHANGED')
  await click(evaluate, signal, '[data-ui~="team-authoring-new-' + preset.template + '"]')
  const visibleRoles = await evaluate('[...document.querySelectorAll("[data-ui~=team-authoring-member]")].map(node=>node.dataset.role)')
  requireFact(same(visibleRoles, preset.roles), 'C16_PRACTICAL_PRESET_EDITOR_ROSTER_MISMATCH')
  requireFact(await evaluate('Boolean(document.querySelector("[data-ui~=team-authoring-preset-help]")?.textContent.trim())'),
    'C16_PRACTICAL_PRESET_GUIDANCE_UNAVAILABLE')
  await fill(evaluate, signal, '[data-ui~="team-authoring-name"]', title)
  await fill(evaluate, signal, '[data-ui~="team-authoring-purpose"]',
    'Prepare and independently review bounded ' + preset.template + ' artifacts from the supplied README.md brief.')
  await fill(evaluate, signal, '[data-ui~="team-authoring-shared"]', readOnlyInstructions)
  for (const role of preset.roles) {
    await selectMemberModel(evaluate, signal, role, selected.model)
    await fill(evaluate, signal, fieldSelector(role, 'projectScope'), 'README.md')
    const original = template.members.find((member) => member.role === role)
    const section = preset.sections?.[role] ?? (role === 'coordinator' ? 'TEAM_SYNTHESIS' : 'BOUNDED_ARTIFACT')
    await fill(evaluate, signal, fieldSelector(role, 'outputInstructions'), original.outputInstructions +
      '\nReturn text only under section ' + section + ' and include the exact delivery marker ' + configuration.marker + '.')
    await fill(evaluate, signal, fieldSelector(role, 'evidenceInstructions'), original.evidenceInstructions +
      '\nRead README.md directly with filesystem__read. Do not list directories or use glob or grep.')
  }
  await click(evaluate, signal, memberSelector('reviewer') +
    ' [data-ui~="team-authoring-skill"][data-skill-id="' + skill.skillId +
    '"][data-skill-digest="' + skill.skillRef.digest + '"] [role="checkbox"]')
  await click(evaluate, signal, '[data-ui~="team-authoring-save"]')
  const first = await waitFor(signal, async () => (await authoring()).revisions.find((item) => item.team.title === title),
    'C16_PRACTICAL_PRESET_SAVE_UNAVAILABLE')
  requireFact(first.team.template === preset.template && same(first.team.members.map((member) => member.role), preset.roles) &&
    first.team.members.every((member) => same(member.model, selected.model) && member.projectScope === 'README.md' &&
      !member.knowledge.length && member.tools.every((tool) => readTools.includes(tool))) &&
    first.team.members.find((member) => member.role === 'reviewer').skills.some((item) => same(item, skill.skillRef)),
  'C16_PRACTICAL_PRESET_SELECTIONS_NOT_PERSISTED')
  const reviewer = first.team.members.find((member) => member.role === 'reviewer')
  const nextValue = reviewer.evidenceInstructions + '\nSeparate evidence-backed findings from assumptions.'
  await fill(evaluate, signal, fieldSelector('reviewer', 'evidenceInstructions'), nextValue)
  await click(evaluate, signal, '[data-ui~="team-authoring-save"]')
  const accepted = await waitFor(signal, async () => (await authoring()).revisions.find((item) =>
    item.team.id === first.team.id && item.revision === first.revision + 1), 'C16_PRACTICAL_PRESET_REVISION_UNAVAILABLE')
  const expected = { ...first.team, members: first.team.members.map((member) =>
    member.role === 'reviewer' ? { ...member, evidenceInstructions: nextValue } : member) }
  requireFact(same(accepted.team, expected) && accepted.package.digest !== first.package.digest &&
    accepted.definition.digest !== first.definition.digest && (await authoring()).revisions.some((item) => same(item, first)),
  'C16_PRACTICAL_REVISION_MUTATED_RESOURCES_OR_PRIOR_IDENTITY')
  if (preset.template === 'customer-feedback') {
    const feedback = template.members.find((member) => member.role === 'documentation').outputInstructions
    requireFact(feedback.includes('GitHub connector') && feedback.includes('do not create issues'),
      'C16_FEEDBACK_CONNECTOR_BOUNDARY_UNAVAILABLE')
  }
  evidence.revisions = [first, accepted].map((item) => ({ teamId: item.team.id, revision: item.revision,
    definition: item.definition, package: item.package }))
  evidence.selectedSkill = skill.skillRef
  evidence.scope = 'README.md; readonly tools; output artifacts only'
  if (preset.run) await applyDeclaredContext({ evaluate, signal, selected, configuration, accepted, evidence })
  return { first, accepted }
}

export async function reopenPreset({ evaluate, signal, selected, revisions }) {
  await openAuthoring(evaluate, signal, selected.workspaceId)
  const reopened = await ipc(evaluate, route('authoring'), {})
  requireFact(revisions.every((revision) => reopened.revisions.some((item) => same(item, revision))),
    'C16_PRACTICAL_REOPEN_CHANGED_REVISIONS')
  const accepted = revisions.at(-1)
  await choose(evaluate, signal, '[data-ui~="team-authoring-select"]',
    '[role="option"][data-authored-team-id="' + accepted.team.id + '"][data-authored-revision="' + accepted.revision + '"]')
  for (const member of accepted.team.members) for (const field of fields) {
    const value = await waitFor(signal, () => evaluate('(()=>{const n=document.querySelector(' +
      JSON.stringify(fieldSelector(member.role, field)) + ');return n?.getClientRects().length?{value:n.value}:false})()'),
    'C16_PRACTICAL_REOPEN_FIELD_UNAVAILABLE')
    requireFact(value.value === member[field], 'C16_PRACTICAL_REOPEN_FIELD_MISMATCH')
  }
}
