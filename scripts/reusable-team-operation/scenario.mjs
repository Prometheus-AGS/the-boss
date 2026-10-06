import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { digest, write, same, route, requireFact, waitFor } from './io.mjs'
import { liveOutputObserver } from './live-output.mjs'
import { attemptFailureEvidence } from './attempt-diagnostics.mjs'

const visible = (selector) =>
  `[...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.getClientRects().length)`
async function click(evaluate, signal, selector) {
  await waitFor(
    signal,
    () =>
      evaluate(`(() => { const node=${visible(selector)};
    if(!node || node.disabled || node.getAttribute('aria-disabled')==='true')return false;
    node.scrollIntoView({block:'center'});node.focus();
    if(node.getAttribute('role')==='combobox')node.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
    else if(node.getAttribute('data-slot')==='select-item')node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    else node.click();return true;})()`),
    'C15_VISIBLE_CONTROL_UNAVAILABLE'
  )
}
async function fill(evaluate, signal, selector, value) {
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {const node=${visible(selector)};if(!node || node.disabled)return false;
    Object.getOwnPropertyDescriptor(node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(node,${JSON.stringify(value)});
    node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`),
    'C15_VISIBLE_INPUT_UNAVAILABLE'
  )
}
async function choose(evaluate, signal, selector, option) {
  await click(evaluate, signal, selector)
  await click(evaluate, signal, option)
}
async function ipc(evaluate, name, input) {
  const result = await evaluate(`window.api.ipcApi.request(${JSON.stringify(name)},${JSON.stringify(input)})`)
  requireFact(result?.ok, 'C15_SUPPORTED_APPLICATION_API_UNAVAILABLE')
  return result.data
}
async function openWork(evaluate, signal) {
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {
    const later=[...document.querySelectorAll('button')].find(node=>node.getClientRects().length&&node.innerText.trim()==='Set up later');
    if(later)later.click();return Boolean(document.querySelector('#app-sidebar'));})()`),
    'C15_ONBOARDING_UNAVAILABLE'
  )
  const visibleWork = await evaluate(
    `[...document.querySelectorAll('[data-ui~="work-mode-teams"]')].some(node=>node.getClientRects().length)`
  )
  if (!visibleWork) await ipc(evaluate, 'navigation.open_route_in_main', { path: '/app/agents' })
  await click(evaluate, signal, '[data-ui~="work-mode-teams"]')
}
async function openAuthoring(evaluate, signal, workspaceId) {
  await ipc(evaluate, 'navigation.open_route_in_main', { path: '/settings/uar?panel=teams' })
  await choose(
    evaluate,
    signal,
    '[data-ui~="uar-teams-workspace"]',
    `[role="option"][data-workspace-id="${workspaceId}"]`
  )
  await waitFor(
    signal,
    () => evaluate(`Boolean(${visible('[data-ui~="team-authoring"]')})`),
    'C15_AUTHORING_UNAVAILABLE'
  )
}
async function setup(evaluate, configuration) {
  const registered = await evaluate(
    `window.api.dataApi.request(${JSON.stringify({
      id: randomUUID(),
      method: 'POST',
      path: '/agent-workspaces',
      body: { path: configuration.workspaceDirectory, name: configuration.marker }
    })})`
  )
  requireFact(!registered?.error && registered?.data?.id, 'C15_WORKSPACE_REGISTRATION_UNAVAILABLE')
  const gateway = configuration.gateway
  const initial = await ipc(evaluate, 'prometheus.integration.snapshot', {})
  await ipc(evaluate, 'prometheus.integration.configure', {
    updates: [
      {
        feature: 'services',
        expectedRevision: initial.revisions.services,
        value: {
          ...initial.config.services,
          liter: { ownership: 'external', source: 'manual', endpoint: gateway.endpoint }
        }
      }
    ],
    secrets: { literKey: { operation: 'set', value: process.env[gateway.credentialEnv] } }
  })
  const catalog = await ipc(evaluate, 'prometheus.liter.catalog.read', {})
  const gatewayConnectionId = catalog.gateway?.identity?.gatewayConnectionId
  requireFact(catalog.gateway?.operational && gatewayConnectionId, 'C15_SELECTED_GATEWAY_UNAVAILABLE')
  const current = await ipc(evaluate, 'prometheus.integration.snapshot', {})
  const providerConnectionId = 'c15-selected-source'
  await ipc(evaluate, 'prometheus.integration.configure', {
    updates: [
      {
        feature: 'services',
        expectedRevision: current.revisions.services,
        value: {
          ...current.config.services,
          literConnections: [
            ...current.config.services.literConnections.filter(
              (item) => item.providerConnectionId !== providerConnectionId
            ),
            {
              providerConnectionId,
              providerId: gateway.providerId,
              displayName: 'C15 selected configured source',
              ...(gateway.providerBaseUrl ? { baseUrl: gateway.providerBaseUrl } : {}),
              enabled: true,
              timeoutMs: 90000
            }
          ],
          literAliases: [
            ...current.config.services.literAliases.filter(
              (item) => item.gatewayConnectionId !== gatewayConnectionId || item.alias !== gateway.alias
            ),
            {
              gatewayConnectionId,
              alias: gateway.alias,
              target: { providerConnectionId, providerId: gateway.providerId, modelId: gateway.modelId },
              enabled: true,
              custom: false
            }
          ]
        }
      }
    ],
    secrets: {}
  })
  const sources = await ipc(evaluate, 'prometheus.uar.models.sources', {})
  const provider = sources.sources
    .find((item) => item.source === 'gateway' && item.operational)
    ?.providers.find((item) => item.enabled && item.models.some((model) => model.enabled && model.id === gateway.alias))
  requireFact(provider, 'C15_ADVERTISED_MODEL_UNAVAILABLE')
  return {
    workspaceId: registered.data.id,
    model: { source: 'gateway', providerId: provider.id, modelId: gateway.alias }
  }
}
async function selectTeam(evaluate, signal, revision, binding) {
  await choose(
    evaluate,
    signal,
    '[data-ui~="teams-definition"]',
    `[role="option"][data-definition-id="${revision.definition.id}"][data-definition-digest="${revision.definition.digest}"]`
  )
  await click(evaluate, signal, '[data-ui~="teams-binding"]')
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {const node=[...document.querySelectorAll('[role="option"]')]
    .find(node=>node.getClientRects().length&&node.innerText.startsWith(${JSON.stringify(binding.id)}+' ·'));
    if(!node)return false;node.focus();node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return true;})()`),
    'C15_EXACT_BINDING_OPTION_UNAVAILABLE'
  )
}

export async function scenario({ evaluate, signal, targets }, configuration) {
  const evidence = {
    schemaVersion: 1,
    kind: 'reusable-team-packaged-operation',
    creationTaskRef: 'C15.1',
    complete: false,
    startedAt: new Date().toISOString(),
    sourceRefs: configuration.sourceRefs,
    checks: [],
    teamMutationSurface: 'visible Settings authoring and Work DOM controls',
    prerequisiteSurface: 'ordinary configuration and workspace APIs',
    restartScope: 'renderer reload; application process restart not claimed',
    credentialValueRecorded: false
  }
  let stage = 'packaged-target'
  try {
    requireFact(
      targets.some(
        (target) =>
          target.type === 'page' && target.url.includes('/windows/main/index.html') && !/^https?:/i.test(target.url)
      ),
      'C15_PACKAGED_MAIN_TARGET_UNAVAILABLE'
    )
    await openWork(evaluate, signal)
    const selected = await setup(evaluate, configuration)
    const snapshot = () => ipc(evaluate, route('snapshot'), { workspaceId: selected.workspaceId })
    const authoring = () => ipc(evaluate, route('authoring'), {})
    const initial = await snapshot()
    requireFact(
      initial.executionProfileStage === 'qualified' && initial.capabilities.execution && initial.capabilities.coding,
      'C15_NORMAL_PACKAGED_PROFILE_UNQUALIFIED'
    )
    evidence.workspaceId = selected.workspaceId
    evidence.selectedModel = selected.model
    evidence.credentialReference = configuration.gateway.credentialEnv
    stage = 'create-named-mixed-team'
    await openAuthoring(evaluate, signal, selected.workspaceId)
    await click(evaluate, signal, '[data-ui~="team-authoring-new-product-design"]')
    await fill(evaluate, signal, '[data-ui~="team-authoring-name"]', configuration.marker)
    await fill(
      evaluate,
      signal,
      '[data-ui~="team-authoring-purpose"]',
      'Develop and independently review a product brief from the scoped repository.'
    )
    await fill(
      evaluate,
      signal,
      '[data-ui~="team-authoring-shared"]',
      'Read only README.md. Return its exact delivery marker. Never write files or perform external effects.'
    )
    const roles = ['coordinator', 'product', 'designer', 'reviewer']
    for (const role of roles) {
      const member = `[data-ui~="team-authoring-member"][data-role="${role}"]`
      await choose(
        evaluate,
        signal,
        member + ' [data-ui~="teams-model"]',
        `[role="option"][data-model-source="gateway"][data-provider-id="${selected.model.providerId}"][data-model-id="${selected.model.modelId}"]`
      )
    }
    const skills = await ipc(evaluate, route('skills'), {})
    const tools = ['filesystem__glob', 'filesystem__ls', 'filesystem__grep', 'filesystem__read']
    const skill = skills.entries.find(
      (entry) =>
        entry.availability === 'available' &&
        entry.skillRef &&
        entry.skillRef.requiredTools.every((tool) => tools.includes(tool))
    )
    if (!skill)
      evidence.requiredAction = {
        code: 'C15_EXACT_INSTALLED_READ_ONLY_SKILL_UNAVAILABLE',
        action:
          'Install and load an actual builtin skill artifact, then refresh the registered skills. The import endpoint only previews; copying files does not prove registration.',
        refreshInterface: 'prometheus.uar.catalog.refresh_skills -> POST /api/uar/skills/refresh',
        unavailableEntries: skills.entries.map((entry) => ({ skillId: entry.skillId, reasons: entry.reasons }))
      }
    requireFact(skill, 'C15_EXACT_INSTALLED_READ_ONLY_SKILL_UNAVAILABLE')
    const skillSelector = `[data-ui~="team-authoring-member"][data-role="reviewer"] [data-ui~="team-authoring-skill"][data-skill-digest="${skill.skillRef.digest}"] [role="checkbox"]`
    await click(evaluate, signal, skillSelector)
    await click(evaluate, signal, '[data-ui~="team-authoring-save"]')
    const first = await waitFor(
      signal,
      async () => (await authoring()).revisions.find((item) => item.team.title === configuration.marker),
      'C15_PERSISTED_AUTHORING_UNAVAILABLE'
    )
    requireFact(
      first.team.members.find((member) => member.role === 'reviewer').skills.some((item) => same(item, skill.skillRef)),
      'C15_EXACT_SELECTED_SKILL_NOT_PERSISTED'
    )
    evidence.skill = skill.skillRef
    stage = 'deploy-immutable-package-and-private-binding'
    await click(evaluate, signal, '[data-ui~="team-authoring-deploy"]')
    const binding = await waitFor(
      signal,
      async () =>
        (await snapshot()).bindings.find((item) => item.activationSupported && same(item.package, first.package)),
      'C15_EXACT_PACKAGE_DEPLOYMENT_UNAVAILABLE',
      60000
    )
    await click(evaluate, signal, '[data-ui~="team-authoring-work"]')
    await openWork(evaluate, signal)
    await click(evaluate, signal, '[data-ui~="teams-workspace"]')
    await click(evaluate, signal, `[data-option-id="${selected.workspaceId}"]`)
    await selectTeam(evaluate, signal, first, binding)
    evidence.first = { definition: first.definition, package: first.package, binding }
    evidence.checks.push(
      'named-product-design-team-with-per-role-models-and-exact-scoped-skill',
      'immutable-package-and-private-scoped-binding-deployed'
    )
    stage = 'run-real-mixed-team'
    const before = new Set((await snapshot()).instances.map((item) => item.id))
    await fill(
      evaluate,
      signal,
      '[data-ui~="teams-prompt"]',
      `Read README.md using scoped repository tools. Have product define user acceptance criteria, designer propose the interaction, and reviewer independently assess their outputs. Each role must return the exact marker ${configuration.marker}. Do not write, commit, publish, install dependencies, or run tests.`
    )
    await click(evaluate, signal, '[data-ui~="teams-start"]')
    const instance = await waitFor(
      signal,
      async () =>
        (await snapshot()).instances.find((item) => !before.has(item.id) && same(item.definition, first.definition)),
      'C15_DURABLE_MIXED_TEAM_RUN_UNAVAILABLE',
      60000
    )
    const selector = { workspaceId: selected.workspaceId, teamInstanceId: instance.id }
    const execution = () => ipc(evaluate, route('execution'), selector)
    const memberRoles = Object.fromEntries(instance.members.map((member) => [member.id, member.role]))
    const live = liveOutputObserver(evaluate, selector, memberRoles)
    evidence.liveOutput = live.evidence
    const completed = await waitFor(
      signal,
      async () => {
        const value = await execution()
        if (value.attempts.some((item) => ['failed', 'cancelled', 'uncertain'].includes(item.status))) {
          evidence.failedExecution = { ...selector, attempts: value.attempts.map(attemptFailureEvidence) }
          write(configuration.evidence + '.attempt-failure.json', evidence.failedExecution)
          requireFact(false, 'C15_REAL_ATTEMPT_FAILED')
        }
        await live.capture(value.attempts)
        const current = (await snapshot()).instances.find((item) => item.id === instance.id)
        const finished = value.attempts.filter(
          (item) => item.status === 'succeeded' || item.executionOutcome === 'succeeded'
        )
        return current?.tasks.some((item) => item.role === 'coordinator' && item.status === 'succeeded') &&
          !value.attempts.some((item) => ['queued', 'running', 'cancellation_requested'].includes(item.status)) &&
          roles.slice(1).every((role) => finished.some((item) => memberRoles[item.memberId] === role))
          ? value
          : false
      },
      'C15_REAL_MIXED_TEAM_OR_REQUIRED_OPERATOR_APPROVAL_UNAVAILABLE',
      900000,
      3000
    )
    const artifacts = (await ipc(evaluate, route('artifacts'), selector)).artifacts
    const attempts = completed.attempts.filter(
      (item) =>
        roles.slice(1).includes(memberRoles[item.memberId]) &&
        (item.status === 'succeeded' || item.executionOutcome === 'succeeded')
    )
    requireFact(
      attempts.every((attempt) =>
        artifacts.some(
          (item) =>
            item.attemptId === attempt.id &&
            item.memberId === attempt.memberId &&
            item.taskId === attempt.taskId &&
            JSON.stringify(item.content).includes(configuration.marker)
        )
      ),
      'C15_CORRELATED_ROLE_ARTIFACTS_UNAVAILABLE'
    )
    requireFact(
      attempts.every(
        (item) =>
          item.effectiveModels?.length &&
          item.effectiveModels.every(
            (model) =>
              model.support === 'validated' &&
              model.supportEvidenceRef &&
              model.wireModelAlias === configuration.gateway.alias &&
              model.profile?.id &&
              model.pricingIdentity?.catalogRevision
          )
      ),
      'C15_REAL_MODEL_PROVENANCE_UNAVAILABLE'
    )
    evidence.attempts = attempts.map((item) => ({
      id: item.id,
      taskId: item.taskId,
      memberId: item.memberId,
      effectiveModels: item.effectiveModels,
      outputSha256: digest(JSON.stringify(item.output)),
      usage: item.usage
    }))
    evidence.artifacts = artifacts.map((item) => ({
      id: item.id,
      attemptId: item.attemptId,
      contentSha256: digest(JSON.stringify(item.content))
    }))
    evidence.teamInstanceId = instance.id
    evidence.checks.push('real-product-designer-reviewer-model-attempts-and-correlated-artifacts')
    stage = 'revise-without-changing-existing-run'
    await openAuthoring(evaluate, signal, selected.workspaceId)
    await choose(
      evaluate,
      signal,
      '[data-ui~="team-authoring-select"]',
      `[role="option"][data-authored-team-id="${first.team.id}"][data-authored-revision="${first.revision}"]`
    )
    await fill(
      evaluate,
      signal,
      '[data-ui~="team-authoring-shared"]',
      first.team.instructions + '\nRevision 2: keep acceptance criteria concise.'
    )
    await click(evaluate, signal, '[data-ui~="team-authoring-save"]')
    const second = await waitFor(
      signal,
      async () =>
        (await authoring()).revisions.find(
          (item) => item.team.id === first.team.id && item.revision === first.revision + 1
        ),
      'C15_IMMUTABLE_REVISION_UNAVAILABLE'
    )
    requireFact(
      second.definition.digest !== first.definition.digest && second.package.digest !== first.package.digest,
      'C15_REVISION_IDENTITY_UNCHANGED'
    )
    await click(evaluate, signal, '[data-ui~="team-authoring-deploy"]')
    const revisedBinding = await waitFor(
      signal,
      async () =>
        (await snapshot()).bindings.find((item) => item.activationSupported && same(item.package, second.package)),
      'C15_REVISED_DEPLOYMENT_UNAVAILABLE',
      60000
    )
    const preserved = (await snapshot()).instances.find((item) => item.id === instance.id)
    requireFact(
      same(preserved.definition, instance.definition) &&
        same(preserved.package, instance.package) &&
        same(preserved.binding, instance.binding),
      'C15_REVISION_MUTATED_EXISTING_RUN'
    )
    evidence.second = { definition: second.definition, package: second.package, binding: revisedBinding }
    stage = 'reopen-persisted-authoring-and-run'
    await evaluate('setTimeout(()=>location.reload(),50);true')
    await delay(750, undefined, { signal })
    await openAuthoring(evaluate, signal, selected.workspaceId)
    const reopened = await authoring()
    requireFact(
      [first, second].every((revision) => reopened.revisions.some((item) => same(item, revision))),
      'C15_REOPEN_CHANGED_AUTHORED_REVISIONS'
    )
    await openWork(evaluate, signal)
    await click(evaluate, signal, '[data-ui~="teams-workspace"]')
    await click(evaluate, signal, `[data-option-id="${selected.workspaceId}"]`)
    await choose(evaluate, signal, '[data-ui~="teams-instance"]', `[role="option"][data-team-id="${instance.id}"]`)
    await waitFor(
      signal,
      () =>
        evaluate(`(() => {const node=${visible('[data-ui~="teams-run"]')};return node?.getAttribute('data-team-id')===${JSON.stringify(instance.id)}&&
      node.getAttribute('data-definition-digest')===${JSON.stringify(first.definition.digest)};})()`),
      'C15_REOPEN_PINNED_RUN_NOT_VISIBLE'
    )
    requireFact(
      same(
        (await execution()).attempts.map((item) => item.id),
        completed.attempts.map((item) => item.id)
      ),
      'C15_REOPEN_REPEATED_MODEL_WORK'
    )
    const reopenedArtifacts = (await ipc(evaluate, route('artifacts'), selector)).artifacts
    requireFact(
      evidence.artifacts.every((item) =>
        reopenedArtifacts.some(
          (value) => value.id === item.id && digest(JSON.stringify(value.content)) === item.contentSha256
        )
      ),
      'C15_REOPEN_CHANGED_ARTIFACTS'
    )
    await live.finish(attempts, signal)
    requireFact(
      digest(fs.readFileSync(path.join(configuration.workspaceDirectory, 'README.md'))) ===
        configuration.workspaceSha256 &&
        fs.readdirSync(configuration.workspaceDirectory).every((name) => ['README.md', '.git'].includes(name)),
      'C15_RUN_EXCEEDED_READ_ONLY_SCOPE'
    )
    evidence.checks.push(
      'revision-preserves-running-definition-package-binding',
      'renderer-reopen-preserves-authoring-identities-attempts-and-artifacts',
      'pre-terminal-public-member-model-output-visible',
      'renderer-reopen-shows-correlated-saved-final-output'
    )
    evidence.complete = true
  } catch (error) {
    evidence.failureStage = stage
    evidence.failureCode = signal.aborted
      ? 'C15_OPERATION_CANCELLED_OR_TIMED_OUT'
      : /^C15_[A-Z0-9_]+$/.test(error.code ?? '')
        ? error.code
        : 'C15_APPLICATION_OPERATION_UNAVAILABLE'
    evidence.visibleFailureCodes = await evaluate(`Array.from(new Set([...document.querySelectorAll('[role="alert"]')]
      .filter(node=>node.getClientRects().length).flatMap(node=>node.innerText.match(/\\b(?:UAR_|TEAM_)[A-Z0-9_]+\\b/g)??[])))`)
  } finally {
    evidence.finishedAt = new Date().toISOString()
    write(configuration.evidence, evidence)
  }
  return {
    passed: evidence.complete,
    observedBehavior: JSON.stringify({
      complete: evidence.complete,
      checks: evidence.checks,
      failureCode: evidence.failureCode,
      evidencePath: configuration.evidence,
      evidenceSha256: digest(fs.readFileSync(configuration.evidence))
    })
  }
}
