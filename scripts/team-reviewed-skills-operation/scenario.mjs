import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'

import { mixedTeamApprovalOperator } from '../reusable-team-operation/approvals.mjs'
import { attemptFailureEvidence } from '../reusable-team-operation/attempt-diagnostics.mjs'
import { digest, requireFact, route, same, waitFor, write } from '../reusable-team-operation/io.mjs'
import { click, fill, choose, ipc, openAuthoring, openWork, selectTeam, setup } from '../reusable-team-operation/scenario.mjs'
import { runCoverageScenarios } from './runtime-scenarios.mjs'

const roles = ['coordinator', 'worker', 'reviewer']
const readOnly = ['filesystem__glob', 'filesystem__ls', 'filesystem__grep', 'filesystem__read']
const memberSelector = (role) => '[data-ui~="team-authoring-member"][data-role="' + role + '"]'

function prepareIsolatedKeychain(home, evidence) {
  const env = { ...process.env, HOME: home }
  fs.mkdirSync(path.join(home, 'Library', 'Preferences'), { recursive: true, mode: 0o700 })
  const keychain = path.join(home, 'c15-' + randomUUID() + '.keychain-db')
  const password = randomBytes(32).toString('hex')
  const invoke = (args) => spawnSync('/usr/bin/security', args, { env, encoding: 'utf8', shell: false })
  const remove = () => invoke(['delete-keychain', keychain])
  try {
    for (const args of [
      ['create-keychain', '-p', password, keychain],
      ['unlock-keychain', '-p', password, keychain],
      ['set-keychain-settings', '-lut', '1800', keychain],
      ['default-keychain', '-d', 'user', '-s', keychain],
      ['list-keychains', '-d', 'user', '-s', keychain]
    ]) requireFact(invoke(args).status === 0, 'C15_ISOLATED_NATIVE_KEYCHAIN_UNAVAILABLE')
    const selected = invoke(['default-keychain', '-d', 'user'])
    requireFact(selected.status === 0 && selected.stdout.includes(keychain), 'C15_ISOLATED_NATIVE_KEYCHAIN_NOT_SELECTED')
    evidence.credentialStorage = 'disposable-native-macos-keychain-in-isolated-home'
    return remove
  } catch (error) {
    remove()
    throw error
  }
}

async function setReadOnlyTools(evaluate, signal, role) {
  for (const tool of ['filesystem__edit', 'filesystem__write']) {
    const selector = memberSelector(role) + ' [data-ui~="team-authoring-tool"][data-tool-name="' + tool + '"]'
    const selected = await waitFor(signal, () => evaluate('(()=>{const node=document.querySelector(' +
      JSON.stringify(selector) + ');return node?.getAttribute("aria-checked")})()'), 'C15_REVIEWED_SKILL_TOOL_CONTROL_UNAVAILABLE')
    if (selected === 'true') await click(evaluate, signal, selector)
    requireFact(await evaluate('document.querySelector(' + JSON.stringify(selector) +
      ')?.getAttribute("aria-checked")==="false"'), 'C15_REVIEWED_SKILL_READ_ONLY_TOOLS_REQUIRED')
  }
}

async function selectMemberModel(evaluate, signal, role, model) {
  const trigger = memberSelector(role) + ' [data-ui~="teams-model"]'
  await waitFor(signal, () => evaluate('(()=>{const node=document.querySelector(' + JSON.stringify(trigger) +
    ');return Boolean(node&&!node.disabled)})()'), 'C15_REVIEWED_SKILL_MODEL_CONTROL_NOT_READY')
  await click(evaluate, signal, trigger)
  const menu = await waitFor(signal, () => evaluate('document.querySelector(' + JSON.stringify(trigger) +
    ')?.getAttribute("aria-controls")'), 'C15_REVIEWED_SKILL_MODEL_MENU_UNAVAILABLE')
  const option = '[role="option"][data-model-source="gateway"][data-provider-id="' + model.providerId +
    '"][data-model-id="' + model.modelId + '"]'
  await waitFor(signal, () => evaluate('(()=>{const node=document.getElementById(' + JSON.stringify(menu) +
    ')?.querySelector(' + JSON.stringify(option) + ');if(!node||!node.getClientRects().length)return false;' +
    'node.focus();node.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));return true})()'),
  'C15_REVIEWED_SKILL_MEMBER_MODEL_OPTION_UNAVAILABLE')
  await waitFor(signal, () => evaluate('(()=>{const node=document.querySelector(' +
    JSON.stringify(memberSelector(role) + ' [data-ui~="uar-team-model-picker"]') +
    ');return node?.getAttribute("data-selected-model")===' + JSON.stringify(model.modelId) +
    '&&node?.getAttribute("data-selected-source")==="gateway"})()'), 'C15_REVIEWED_SKILL_MEMBER_MODEL_NOT_SELECTED')
}

function disposablePackRoot(appDataPath) {
  const isolatedUserData = fs.realpathSync(appDataPath)
  requireFact(/^cadence-boss-[A-Za-z0-9_-]+$/.test(path.basename(isolatedUserData)),
    'C15_ISOLATED_CADENCE_BOSS_USER_DATA_REQUIRED')
  const packRoot = path.join(isolatedUserData, 'Data', 'PrometheusPack')
  requireFact(fs.existsSync(packRoot), 'C15_ISOLATED_REVIEWED_PACK_UNAVAILABLE')
  return { isolatedUserData, packRoot }
}

function reviewedMiniSkill(catalog, packRoot) {
  const inventory = JSON.parse(fs.readFileSync(path.join(packRoot, 'reviewed-skill-closures.json'), 'utf8'))
  requireFact(inventory.schemaVersion === 'prometheus-reviewed-skill-closures-v1', 'C15_REVIEWED_INVENTORY_UNAVAILABLE')
  const skill = catalog.entries.find((entry) => {
    const ref = entry.skillRef
    const closure = inventory.skills.find((item) => item.identity.artifactDigest === ref?.digest)
    return ref?.id.startsWith('builtin::') && entry.availability === 'available' &&
      entry.reviewedCoverage?.status === 'reviewed' && ref?.required === true &&
      ref.requiredTools.every((tool) => readOnly.includes(tool)) && closure?.closure.paths.some((file) => file !== closure.entrypoint)
  })
  requireFact(skill, 'C15_REQUIRED_REVIEWED_READ_ONLY_MINI_SKILL_UNAVAILABLE')
  return skill
}

function signedGenerationRoot(home) {
  const pluginRoot = path.join(home, '.prometheus', 'plugins', 'prometheus-skill-pack')
  const pointer = fs.readFileSync(path.join(pluginRoot, 'pointers', 'current'), 'utf8').trim()
  requireFact(/^generations\/[a-f0-9]{64}$/.test(pointer), 'C15_FULL_GENERATION_POINTER_UNAVAILABLE')
  const root = path.join(pluginRoot, pointer)
  requireFact(fs.statSync(root).isDirectory(), 'C15_FULL_GENERATION_UNAVAILABLE')
  return root
}

function reviewedFullSkill(catalog, miniRoot, fullRoot) {
  const mini = JSON.parse(fs.readFileSync(path.join(miniRoot, 'reviewed-skill-closures.json'), 'utf8'))
  const full = JSON.parse(fs.readFileSync(path.join(fullRoot, 'reviewed-skill-closures.json'), 'utf8'))
  requireFact(full.schemaVersion === 'prometheus-reviewed-skill-closures-v1' &&
    full.inventoryDigest !== mini.inventoryDigest, 'C15_DISTINCT_FULL_SKILL_INVENTORY_UNAVAILABLE')
  const miniArtifacts = new Set(mini.skills.map((item) => item.identity.artifactDigest))
  const skill = catalog.entries.find((entry) => {
    const ref = entry.skillRef
    return entry.availability === 'available' && entry.reviewedCoverage?.status === 'reviewed' && ref?.required === true &&
      ref.requiredTools.every((tool) => readOnly.includes(tool)) &&
      full.skills.some((item) => item.identity.artifactDigest === ref.digest) && !miniArtifacts.has(ref.digest)
  })
  requireFact(skill, 'C15_REQUIRED_REVIEWED_FULL_READ_ONLY_SKILL_UNAVAILABLE')
  return { skill, inventoryDigest: full.inventoryDigest }
}

function artifactFor(attempt, artifacts, marker) {
  return artifacts.find((artifact) => artifact.attemptId === attempt.id && artifact.memberId === attempt.memberId &&
    artifact.taskId === attempt.taskId && JSON.stringify(artifact.content).includes(marker))
}

export async function scenario({ evaluate, signal, targets, trustedRequest }, configuration) {
  const evidence = {
    schemaVersion: 1,
    kind: 'reviewed-skill-coverage-packaged-operation',
    creationTaskRef: 'C15.3',
    complete: false,
    startedAt: new Date().toISOString(),
    sourceRefs: configuration.sourceRefs,
    operationDriverSources: configuration.operationDriverSources,
    checks: [],
    modelChoice: 'explicit-manual-configured-gateway',
    teamMutationSurface: 'visible existing coding Team editor and Work controls',
    credentialValueRecorded: false,
    handoffOperation: 'reused Delivery10 evidence; not rerun'
  }
  const evaluateApplication = evaluate
  evaluate = async (expression) => {
    const applicationExpression = /^window\.api\.ipcApi\.request\(/.test(expression)
      ? '(async()=>{const result=await ' + expression + ';return result?.ok===false?{ok:false,error:{code:result.error?.code,message:result.error?.message}}:result})()'
      : expression
    const result = await evaluateApplication(applicationExpression)
    const channel = expression.match(/^window\.api\.ipcApi\.request\("([a-z0-9_.]+)"/)?.[1]
    if (channel && result?.ok === false) {
      evidence.failedApplicationRequest = {
        channel,
        code: /^[A-Z0-9_]+$/.test(result.error?.code ?? '') ? result.error.code : 'UNCLASSIFIED',
        redactedMessage: (() => {
          let message = String(result.error?.message ?? '')
          for (const [name, value] of Object.entries(process.env))
            if (/TOKEN|SECRET|PASSWORD|KEY/i.test(name) && value?.length >= 6)
              message = message.split(value).join('[credential]')
          return message.replace(/https?:\/\/[^\s"']+/g, '[endpoint]')
            .replace(/Bearer\s+\S+/gi, 'Bearer [credential]').slice(0, 500)
        })(),
        messageKey: result.error?.message?.match(/^prometheus\.error\.[A-Za-z]+$/)?.[0],
        methodFailure: result.error?.message?.match(/(?:safeStorage\.)?[A-Za-z]+(?:Async)? is not a function/)?.[0],
        validationIssues: (() => {
          try {
            const issues = JSON.parse(result.error?.message ?? 'null')
            return Array.isArray(issues) ? issues.map(({ code, path }) => ({ code, path })) : undefined
          } catch { return undefined }
        })()
      }
    }
    return result
  }
  let stage = 'packaged-target'
  let removeKeychain
  try {
    requireFact(targets.some((target) => target.type === 'page' && target.url.includes('/windows/main/index.html') &&
      !/^https?:/i.test(target.url)), 'C15_PACKAGED_MAIN_TARGET_UNAVAILABLE')
    const app = await ipc(evaluate, 'app.get_info')
    const { isolatedUserData, packRoot } = disposablePackRoot(app.appDataPath)
    requireFact(app.resourcesPath === path.join(configuration.appResources, 'app.asar', 'resources'),
      'C15_REVIEWED_SKILL_APP_RESOURCE_IDENTITY_MISMATCH')
    requireFact(app.homePath === configuration.fullHome && configuration.preparedFullGeneration?.complete === true,
      'C15_PREPARED_FULL_HOME_NOT_USED_BY_PACKAGED_APP')
    removeKeychain = prepareIsolatedKeychain(app.homePath, evidence)
    stage = 'onboarding-and-configured-gateway'
    await openWork(evaluate, signal)
    const selected = await setup(evaluate, configuration)
    const fullGenerationRoot = signedGenerationRoot(app.homePath)
    const snapshot = () => ipc(evaluate, route('snapshot'), { workspaceId: selected.workspaceId })
    const authoring = () => ipc(evaluate, route('authoring'), {})
    const initial = await snapshot()
    requireFact(initial.executionProfileStage === 'qualified' && initial.capabilities.execution && initial.capabilities.coding,
      'C15_REVIEWED_SKILL_QUALIFIED_EXECUTION_REQUIRED')
    evidence.workspaceId = selected.workspaceId
    evidence.selectedModel = selected.model
    evidence.credentialReference = configuration.gateway.credentialEnv
    evidence.isolatedUserData = isolatedUserData
    evidence.packRoot = packRoot
    evidence.fullGeneration = configuration.preparedFullGeneration
    evidence.fullGenerationRoot = fullGenerationRoot
    evidence.checks.push('prelaunch-isolated-signed-full-generation-used-as-packaged-application-home')

    stage = 'author-required-reviewed-mini-skill'
    await openAuthoring(evaluate, signal, selected.workspaceId)
    await click(evaluate, signal, '[data-ui~="team-authoring-new-coding"]')
    await fill(evaluate, signal, '[data-ui~="team-authoring-name"]', configuration.marker)
    await fill(evaluate, signal, '[data-ui~="team-authoring-purpose"]',
      'Read and independently review the delivery marker using a reviewed skill.')
    await fill(evaluate, signal, '[data-ui~="team-authoring-shared"]',
      'Read only README.md. Return its exact delivery marker. Never write files or perform external effects.')
    for (const role of roles) {
      await selectMemberModel(evaluate, signal, role, selected.model)
      if (role !== 'coordinator') await setReadOnlyTools(evaluate, signal, role)
    }
    const catalog = await ipc(evaluate, route('skills'), {})
    evidence.miniCatalog = catalog.entries.filter((entry) => entry.skillRef?.id.startsWith('builtin::'))
      .map(({ availability, reviewedCoverage, skillRef }) => ({ availability, reviewedCoverage, skillRef }))
    const miniSkill = reviewedMiniSkill(catalog, packRoot)
    const fullSkill = reviewedFullSkill(catalog, packRoot, fullGenerationRoot)
    await click(evaluate, signal, memberSelector('reviewer') + ' [data-ui~="team-authoring-skill"][data-skill-digest="' +
      miniSkill.skillRef.digest + '"] [role="checkbox"]')
    await click(evaluate, signal, memberSelector('worker') + ' [data-ui~="team-authoring-skill"][data-skill-digest="' +
      fullSkill.skill.skillRef.digest + '"] [role="checkbox"]')
    await click(evaluate, signal, '[data-ui~="team-authoring-save"]')
    const revision = await waitFor(signal, async () => (await authoring()).revisions.find((item) =>
      item.team.title === configuration.marker), 'C15_REVIEWED_SKILL_REVISION_UNAVAILABLE')
    const reviewer = revision.team.members.find((member) => member.role === 'reviewer')
    const worker = revision.team.members.find((member) => member.role === 'worker')
    requireFact(reviewer?.skills.some((item) => item.required && same(item, miniSkill.skillRef)) &&
      worker?.skills.some((item) => item.required && same(item, fullSkill.skill.skillRef)) &&
      revision.team.members.every((member) => same(member.model, selected.model)) &&
      reviewer.tools.every((tool) => readOnly.includes(tool)) && worker.tools.every((tool) => readOnly.includes(tool)),
    'C15_REQUIRED_REVIEWED_SKILLS_NOT_PERSISTED')
    evidence.selectedSkills = { mini: miniSkill.skillRef, full: fullSkill.skill.skillRef,
      fullInventoryDigest: fullSkill.inventoryDigest }
    evidence.savedRevision = { teamId: revision.team.id, revision: revision.revision, definition: revision.definition,
      package: revision.package }

    stage = 'deploy-exact-reviewed-revision'
    await click(evaluate, signal, '[data-ui~="team-authoring-deploy"]')
    const binding = await waitFor(signal, async () => (await snapshot()).bindings.find((item) =>
      item.activationSupported && same(item.package, revision.package)), 'C15_REVIEWED_SKILL_DEPLOYMENT_UNAVAILABLE', 60000)
    evidence.binding = binding
    evidence.checks.push('required-reviewed-mini-and-full-skills-selected-for-read-only-members-and-exact-revision-deployed')

    stage = 'reviewed-closure-and-host-scope-refusals'
    const authoringRead = 'window.api.ipcApi.request(' + JSON.stringify(route('authoring')) + ','
    const evaluateCoverage = async (expression) => {
      const result = await evaluate(expression)
      // Refusal must preserve saved revisions; unsaved templates receive fresh draft IDs on every read.
      return expression.startsWith(authoringRead) && result?.ok
        ? { ...result, data: { schemaVersion: result.data.schemaVersion, revisions: result.data.revisions } }
        : result
    }
    await runCoverageScenarios({ evaluate: evaluateCoverage, signal, workspaceId: selected.workspaceId, revision, binding, packRoot,
      isolatedUserData, evidence, trustedRequest })
    requireFact(evidence.coverageCoreComplete === true, 'C15_REVIEWED_SKILL_CORE_COVERAGE_INCOMPLETE')
    evidence.privatePreflight = evidence.coverageScenarios?.find((record) => record.scenario === 'private-coverage-claim') ??
      { status: 'not-exercised', reason: 'trusted-native-request-unavailable' }
    evidence.checks.push('closure-tampering-and-required-tool-scope-refused-without-changing-installed-binding')

    stage = 'normal-work-run-with-read-only-approval'
    await click(evaluate, signal, '[data-ui~="team-authoring-work"]')
    await openWork(evaluate, signal)
    await choose(evaluate, signal, '[data-ui~="teams-workspace"]', '[data-option-id="' + selected.workspaceId + '"]')
    await selectTeam(evaluate, signal, revision, binding)
    const before = new Set((await snapshot()).instances.map((item) => item.id))
    await fill(evaluate, signal, '[data-ui~="teams-prompt"]',
      'Read README.md directly with filesystem__read. Delegate a direct read to worker and reviewer. Both return the exact marker ' +
      configuration.marker + '. Do not list directories, write, commit, publish, install dependencies, or run tests.')
    await click(evaluate, signal, '[data-ui~="teams-start"]')
    const instance = await waitFor(signal, async () => (await snapshot()).instances.find((item) =>
      !before.has(item.id) && same(item.definition, revision.definition)), 'C15_REVIEWED_SKILL_WORK_RUN_UNAVAILABLE', 60000)
    const selector = { workspaceId: selected.workspaceId, teamInstanceId: instance.id }
    const execution = () => ipc(evaluate, route('execution'), selector)
    const memberRoles = Object.fromEntries(instance.members.map((member) => [member.id, member.role]))
    const approvals = mixedTeamApprovalOperator({ evaluate, signal, selector, instance, instructions: revision.team.instructions,
      workspaceDirectory: configuration.workspaceDirectory, template: 'coding' })
    evidence.approvals = approvals.evidence
    const completed = await waitFor(signal, async () => {
      const value = await execution()
      if (value.attempts.some((item) => ['failed', 'cancelled', 'uncertain'].includes(item.status))) {
        evidence.failedExecution = value.attempts.map(attemptFailureEvidence)
        requireFact(false, 'C15_REVIEWED_SKILL_ATTEMPT_FAILED')
      }
      await approvals.handle()
      const current = (await snapshot()).instances.find((item) => item.id === instance.id)
      const successful = value.attempts.filter((item) => item.status === 'succeeded' || item.executionOutcome === 'succeeded')
      return current?.tasks.some((item) => item.role === 'coordinator' && item.status === 'succeeded') &&
        !value.attempts.some((item) => ['queued', 'running', 'cancellation_requested'].includes(item.status)) &&
        ['worker', 'reviewer'].every((role) => successful.some((item) => memberRoles[item.memberId] === role)) ? value : false
    }, 'C15_REVIEWED_SKILL_WORK_OR_APPROVAL_UNAVAILABLE', 900000, 3000)
    const artifacts = (await ipc(evaluate, route('artifacts'), selector)).artifacts
    const attempts = completed.attempts.filter((item) => ['worker', 'reviewer'].includes(memberRoles[item.memberId]) &&
      (item.status === 'succeeded' || item.executionOutcome === 'succeeded'))
    requireFact(attempts.every((item) => artifactFor(item, artifacts, configuration.marker)),
      'C15_REVIEWED_SKILL_MARKER_ARTIFACT_UNAVAILABLE')
    requireFact(evidence.approvals.approvals.some((item) => item.toolName === 'filesystem__read' && item.decision === 'allow'),
      'C15_REVIEWED_SKILL_FILESYSTEM_APPROVAL_UNAVAILABLE')
    requireFact(digest(fs.readFileSync(path.join(configuration.workspaceDirectory, 'README.md'))) === configuration.workspaceSha256 &&
      fs.readdirSync(configuration.workspaceDirectory).every((name) => ['README.md', '.git'].includes(name)),
    'C15_REVIEWED_SKILL_READ_ONLY_SCOPE_EXCEEDED')
    evidence.attempts = attempts.map((item) => ({ id: item.id, memberId: item.memberId,
      outputSha256: digest(JSON.stringify(item.output)), deliveryMarkerReturned: JSON.stringify(item.output).includes(configuration.marker) }))
    evidence.checks.push('normal-coding-team-work-returns-marker-through-existing-read-only-filesystem-approval')
    evidence.complete = true
  } catch (error) {
    evidence.failureStage = stage
    evidence.memberModelControls = await evaluate('Array.from(document.querySelectorAll("[data-ui~=team-authoring-member]")).map(node=>({role:node.getAttribute("data-role"),model:node.querySelector("[data-ui~=uar-team-model-picker]")?.getAttribute("data-selected-model"),source:node.querySelector("[data-ui~=uar-team-model-picker]")?.getAttribute("data-selected-source")}))')
    if (error.approvalIpcFailure) evidence.approvalIpcFailure = error.approvalIpcFailure
    if (error.approvalScopeFailure) evidence.approvalScopeFailure = error.approvalScopeFailure
    evidence.failureCode = signal.aborted ? 'C15_OPERATION_CANCELLED_OR_TIMED_OUT' :
      /^C15_[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'C15_REVIEWED_SKILL_OPERATION_UNAVAILABLE'
  } finally {
    if (removeKeychain) evidence.isolatedKeychainRemoved = removeKeychain().status === 0
    evidence.finishedAt = new Date().toISOString()
    write(configuration.evidence, evidence)
  }
  return { passed: evidence.complete, observedBehavior: JSON.stringify({ complete: evidence.complete,
    checks: evidence.checks, failureCode: evidence.failureCode, coverageCoreComplete: evidence.coverageCoreComplete,
    coverageComplete: evidence.coverageComplete, evidencePath: configuration.evidence,
    evidenceSha256: digest(fs.readFileSync(configuration.evidence)) }) }
}
