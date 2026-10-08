import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

import { click, fill, choose, ipc, openAuthoring, openWork, setup } from './scenario.mjs'
import { digest, requireFact, route, waitFor, write } from './io.mjs'

const memberSelector = (role) => '[data-ui~="team-authoring-member"][data-role="' + role + '"]'

async function refused(evaluate, channel, input, expected, evidence) {
  const result = await evaluate(`window.api.ipcApi.request(${JSON.stringify(channel)},${JSON.stringify(input)})`)
  const reason = result?.error?.message?.match(/\bUAR_TEAM_MODEL_POLICY_[A-Z0-9_]+\b/)?.[0]
  const observed = { channel, ipcCode: result?.error?.code ?? null, reason: reason ?? null }
  evidence.refusals.push(observed)
  requireFact(result?.ok === false && reason === expected, 'C15_ISSUANCE_EXPECTED_REFUSAL_UNAVAILABLE')
}

async function actualSelection(configuration) {
  const { discoverModels } = await import(pathToFileURL(path.join(configuration.creatorScripts, 'models.mjs')).href)
  const { assertNoCredentials } = await import(pathToFileURL(path.join(configuration.creatorScripts, 'models-http.mjs')).href)
  const catalog = await discoverModels({ kind: 'openai', baseUrl: configuration.gateway.endpoint,
    auth: { env: configuration.gateway.credentialEnv } })
  const team = {
    schemaVersion: 1, id: 'c15-issuance-provenance', scope: 'project', harness: 'codex',
    outcome: 'Check reviewed selection provenance only; role strength is unknown.',
    roles: [{ id: 'provenance', description: 'Inspect issuance provenance.', prompt: 'Inspect provenance only.',
      skills: [], owns: [], inputs: [], outputs: [], dependsOn: [] }]
  }
  const request = { team, roleId: 'provenance', skills: [], taskPolicy: { model: configuration.gateway.alias }, catalog }
  assertNoCredentials(request)
  const requestFile = configuration.evidence + '.selector-request.json'
  write(requestFile, request)
  let source
  try {
    source = execFileSync(process.execPath, [path.join(configuration.creatorScripts, 'cli.mjs'),
      'models-select', '--input', requestFile], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 8 * 1024 * 1024, timeout: 60000 })
  } catch {
    requireFact(false, 'C15_BUNDLED_MODEL_SELECTOR_UNAVAILABLE')
  }
  const result = JSON.parse(source)
  assertNoCredentials(result)
  requireFact(!source.includes(process.env[configuration.gateway.credentialEnv]), 'C15_SELECTOR_CREDENTIALS_FORBIDDEN')
  requireFact(result.selected?.id === configuration.gateway.alias && result.selected.available === true &&
    result.selected.provider === null && result.selected.catalogId === null && result.selected.tier === null &&
    result.selected.pricing.inputPerMillion === null && result.selected.pricing.outputPerMillion === null &&
    Object.keys(result.selected.capabilities).length === 0 &&
    isDeepStrictEqual(result.policy, { model: configuration.gateway.alias, capabilities: [] }),
  'C15_REAL_UNCONSTRAINED_UNKNOWN_SELECTION_REQUIRED')
  return { source, result, requestDigest: 'sha256:' + digest(JSON.stringify(request)) }
}

export async function scenario({ evaluate, signal, targets }, configuration) {
  const rendererEvaluate = evaluate
  evaluate = async (expression) => {
    try {
      return await rendererEvaluate(expression)
    } catch (error) {
      const code = {
        'Renderer evaluation failed.': 'C15_RENDERER_EVALUATION_FAILED',
        'Renderer connection failed.': 'C15_RENDERER_CONNECTION_FAILED',
        'Renderer connection closed.': 'C15_RENDERER_CONNECTION_CLOSED'
      }[error.message]
      if (code) throw Object.assign(new Error(code), { code })
      throw error
    }
  }
  const evidence = {
    schemaVersion: 1, kind: 'issued-team-model-provenance-packaged-operation', creationTaskRef: 'C15.1',
    complete: false, startedAt: new Date().toISOString(), sourceRefs: configuration.sourceRefs,
    operationDriverSources: configuration.operationDriverSources,
    bundledSelectorSources: configuration.bundledSelectorSources, checks: [], refusals: [],
    declaredPolicy: 'separate provenance-only policy: exact configured alias; no strength/capability/price constraint',
    requestedRoleStrengthCompliance: 'unknown', wholeC15_1Status: 'pending', fullC15_1CompletionClaimed: false,
    realInference: 'not-exercised; this procedure covers issuance/save/deployment provenance',
    restartScope: 'renderer reload; application process restart not claimed',
    installedWindowsAcceptance: 'pending', credentialValueRecorded: false
  }
  let stage = 'packaged-target'
  let restoreServices
  try {
    requireFact(targets.some((target) => target.type === 'page' && target.url.includes('/windows/main/index.html') && !/^https?:/i.test(target.url)), 'C15_PACKAGED_MAIN_TARGET_UNAVAILABLE')
    await openWork(evaluate, signal)
    stage = 'private-configured-target-a'
    const selected = await setup(evaluate, configuration)
    const authoring = () => ipc(evaluate, route('authoring'), {})
    const snapshot = () => ipc(evaluate, route('snapshot'), { workspaceId: selected.workspaceId })
    const configured = await ipc(evaluate, 'prometheus.integration.snapshot', {})
    const catalog = await ipc(evaluate, 'prometheus.liter.catalog.read', {})
    const alias = configured.config.services.literAliases.find((item) => item.enabled &&
      item.gatewayConnectionId === catalog.gateway.identity.gatewayConnectionId && item.alias === configuration.gateway.alias)
    requireFact(alias && alias.target.providerId === configuration.gateway.providerId && alias.target.modelId === configuration.gateway.modelId, 'C15_ISSUANCE_CONFIGURED_TARGET_A_REQUIRED')
    const alternate = catalog.providers.find((provider) => provider.identity.providerId === alias.target.providerId)
      ?.models.find((model) => model.identity.modelId !== alias.target.modelId)
    requireFact(alternate, 'C15_ISSUANCE_REAL_CATALOG_DRIFT_TARGET_REQUIRED')
    const targetA = alias.target
    const targetB = { ...targetA, modelId: alternate.identity.modelId }
    evidence.targets = { issued: targetA, drift: targetB, driftBasis: 'actual bundled catalog identity; no inference or provider availability for B claimed' }
    stage = 'real-bundled-unconstrained-model-selection'
    const selection = await actualSelection(configuration)
    evidence.selector = { command: 'models-select', requestDigest: selection.requestDigest,
      sourceDigest: 'sha256:' + digest(selection.source), policy: selection.result.policy,
      selected: { id: selection.result.selected.id, provider: null, catalogId: null, tier: null,
        capabilities: selection.result.selected.capabilities, pricing: selection.result.selected.pricing } }
    await openAuthoring(evaluate, signal, selected.workspaceId)
    await click(evaluate, signal, '[data-ui~="team-authoring-new-product-design"]')
    await fill(evaluate, signal, '[data-ui~="team-authoring-name"]', configuration.marker)
    await fill(evaluate, signal, '[data-ui~="team-authoring-purpose"]', 'Check issued model-selection provenance; strength compliance remains unknown.')
    const roles = ['coordinator', 'product', 'designer', 'reviewer']
    for (const role of roles) {
      const member = memberSelector(role)
      await fill(evaluate, signal, member + ' [data-ui~="team-authoring-model-policy-source"]', selection.source)
      await click(evaluate, signal, member + ' [data-ui~="team-authoring-model-policy-import"]')
      await waitFor(signal, () => evaluate('document.querySelector(' + JSON.stringify(member + ' [data-ui~="team-authoring-model-policy-receipt"]') + ')?.getAttribute("data-policy-mode")==="pending"'), 'C15_ISSUANCE_PENDING_IMPORT_UNAVAILABLE')
      await click(evaluate, signal, member + ' [data-ui~="team-authoring-model-policy-accept"]')
    }
    stage = 'save-and-reopen-issued-receipt'
    await click(evaluate, signal, '[data-ui~="team-authoring-save"]')
    const first = await waitFor(signal, async () => (await authoring()).revisions.find((item) => item.team.title === configuration.marker), 'C15_ISSUANCE_SAVE_UNAVAILABLE')
    requireFact(first.team.members.every((member) => member.modelPolicyMode === 'reviewed' &&
      isDeepStrictEqual(member.model, selected.model) && /^[a-f0-9-]{36}$/.test(member.reviewedModelPolicy?.issuanceId ?? '') &&
      member.reviewedModelPolicy.sourceJson === selection.source && member.reviewedModelPolicy.sourceDigest === evidence.selector.sourceDigest &&
      isDeepStrictEqual(member.reviewedModelPolicy.result, selection.result) &&
      member.reviewedModelPolicy.bindingTarget.providerId === targetA.providerId && member.reviewedModelPolicy.bindingTarget.modelId === targetA.modelId), 'C15_ISSUED_RECEIPT_NOT_PERSISTED')
    evidence.issued = first.team.members.map((member) => ({ role: member.role, issuanceId: member.reviewedModelPolicy.issuanceId,
      digest: member.reviewedModelPolicy.digest, sourceDigest: member.reviewedModelPolicy.sourceDigest }))
    stage = 'issued-receipt-renderer-reload'
    const previousDocument = await evaluate('performance.timeOrigin')
    evidence.rendererReload = { previousTimeOrigin: previousDocument, transientEvaluationRefusals: 0 }
    await evaluate('setTimeout(()=>location.reload(),50);true')
    stage = 'issued-receipt-reloaded-preload-readiness'
    const reloaded = await waitFor(signal, async () => {
      try {
        return await evaluate(`(() => {if(performance.timeOrigin===${JSON.stringify(previousDocument)} ||
          document.readyState!=='complete' || typeof window.api?.ipcApi?.request!=='function')return false;
          return {timeOrigin:performance.timeOrigin};})()`)
      } catch (error) {
        if (error.code !== 'C15_RENDERER_EVALUATION_FAILED') throw error
        evidence.rendererReload.transientEvaluationRefusals++
        return false
      }
    }, 'C15_RELOADED_RENDERER_PRELOAD_UNAVAILABLE')
    evidence.rendererReload.timeOrigin = reloaded.timeOrigin
    stage = 'issued-receipt-reopen-authoring'
    await openAuthoring(evaluate, signal, selected.workspaceId)
    stage = 'issued-receipt-reopen-persisted-identity'
    requireFact((await authoring()).revisions.some((item) => isDeepStrictEqual(item, first)), 'C15_REOPEN_CHANGED_ISSUANCE_IDENTITY')
    stage = 'issued-receipt-reopen-visible-revision'
    await choose(evaluate, signal, '[data-ui~="team-authoring-select"]', '[role="option"][data-authored-team-id="' + first.team.id + '"][data-authored-revision="' + first.revision + '"]')
    evidence.checks.push('real-bundled-unknown-metadata-selection-import-save-reopen-retains-main-issuance')
    stage = 'forged-renderer-target-and-issued-fields-refused'
    const before = (await authoring()).revisions
    const forgedTarget = structuredClone(first.team)
    forgedTarget.members[0].reviewedModelPolicy.bindingTarget.modelId = targetB.modelId
    await refused(evaluate, route('save_authoring'), { team: forgedTarget, expectedRevision: first.revision }, 'UAR_TEAM_MODEL_POLICY_ISSUANCE_MISMATCH', evidence)
    const forgedSource = structuredClone(first.team)
    const policy = forgedSource.members[0].reviewedModelPolicy
    policy.result.explanation += ' Renderer-altered issued field.'
    policy.sourceJson = JSON.stringify(policy.result)
    policy.sourceDigest = 'sha256:' + digest(policy.sourceJson)
    policy.digest = 'sha256:' + digest(JSON.stringify(policy.result))
    await refused(evaluate, route('save_authoring'), { team: forgedSource, expectedRevision: first.revision }, 'UAR_TEAM_MODEL_POLICY_ISSUANCE_MISMATCH', evidence)
    const after = (await authoring()).revisions
    const revisionIdentities = (revisions) => revisions.map((item) => ({ teamId: item.team.id,
      revision: item.revision, definition: item.definition, package: item.package }))
    evidence.refusedSaveRevisions = { beforeCount: before.length, afterCount: after.length,
      before: revisionIdentities(before), after: revisionIdentities(after) }
    requireFact(isDeepStrictEqual(after, before), 'C15_REFUSED_ISSUANCE_CREATED_REVISION')
    evidence.checks.push('renderer-target-and-internally-consistent-issued-field-rewrites-refused-without-revision')
    stage = 'configuration-drift-refuses-reviewed-deployment'
    const bindingsBefore = (await snapshot()).bindings
    restoreServices = configured.config.services
    const driftServices = { ...restoreServices, literAliases: restoreServices.literAliases.map((item) =>
      item === alias ? { ...item, target: targetB } : item) }
    await ipc(evaluate, 'prometheus.integration.configure', { updates: [{ feature: 'services',
      expectedRevision: configured.revisions.services, value: driftServices }], secrets: {} })
    await refused(evaluate, route('deploy_authored'), { workspaceId: selected.workspaceId, teamId: first.team.id,
      revision: first.revision }, 'UAR_TEAM_MODEL_POLICY_TARGET_MISMATCH', evidence)
    requireFact(isDeepStrictEqual((await snapshot()).bindings, bindingsBefore), 'C15_REFUSED_DRIFT_DEPLOYMENT_CREATED_BINDING')
    const drift = await ipc(evaluate, 'prometheus.integration.snapshot', {})
    await ipc(evaluate, 'prometheus.integration.configure', { updates: [{ feature: 'services',
      expectedRevision: drift.revisions.services, value: restoreServices }], secrets: {} })
    restoreServices = undefined
    evidence.checks.push('actual-catalog-target-drift-refuses-reviewed-deployment-before-binding-install')
    stage = 'restored-target-a-reviewed-deployment'
    await click(evaluate, signal, '[data-ui~="team-authoring-deploy"]')
    const reviewedBinding = await waitFor(signal, async () => (await snapshot()).bindings.find((item) =>
      item.activationSupported && isDeepStrictEqual(item.package, first.package)), 'C15_RESTORED_REVIEWED_DEPLOYMENT_UNAVAILABLE', 60000)
    evidence.reviewed = { revision: first.revision, definition: first.definition, package: first.package, binding: reviewedBinding }
    evidence.checks.push('restored-target-a-issued-reviewed-deployment-succeeds')
    stage = 'restored-target-a-explicit-manual-choice'
    for (const role of roles) {
      const picker = memberSelector(role) + ' [data-ui~="teams-model"]'
      await choose(evaluate, signal, picker, '[role="option"][data-ui~="teams-model-planning"]')
      await choose(evaluate, signal, picker, '[role="option"][data-model-source="gateway"][data-provider-id="' + selected.model.providerId + '"][data-model-id="' + selected.model.modelId + '"]')
    }
    await click(evaluate, signal, '[data-ui~="team-authoring-save"]')
    const manual = await waitFor(signal, async () => (await authoring()).revisions.find((item) => item.team.id === first.team.id && item.revision === first.revision + 1), 'C15_ISSUANCE_MANUAL_SAVE_UNAVAILABLE')
    requireFact(manual.team.members.every((member) => member.modelPolicyMode === 'manual' &&
      isDeepStrictEqual(member.model, selected.model) && isDeepStrictEqual(member.reviewedModelPolicy,
        first.team.members.find((item) => item.role === member.role).reviewedModelPolicy)), 'C15_MANUAL_OVERRIDE_CHANGED_ISSUED_RECEIPT')
    await click(evaluate, signal, '[data-ui~="team-authoring-deploy"]')
    const binding = await waitFor(signal, async () => (await snapshot()).bindings.find((item) => item.activationSupported &&
      isDeepStrictEqual(item.package, manual.package)), 'C15_ISSUANCE_MANUAL_DEPLOYMENT_UNAVAILABLE', 60000)
    requireFact((await authoring()).revisions.some((item) => isDeepStrictEqual(item, first)), 'C15_MANUAL_CHANGED_PRIOR_REVIEWED_REVISION')
    evidence.manual = { revision: manual.revision, definition: manual.definition, package: manual.package, binding }
    evidence.checks.push('restored-target-a-manual-override-deploys-and-preserves-original-issued-revision')
    evidence.complete = true
  } catch (error) {
    evidence.failureStage = stage
    evidence.failureCode = signal.aborted ? 'C15_OPERATION_CANCELLED_OR_TIMED_OUT' :
      /^C15_[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'C15_MODEL_ISSUANCE_OPERATION_UNAVAILABLE'
  } finally {
    if (restoreServices) {
      try {
        const current = await ipc(evaluate, 'prometheus.integration.snapshot', {})
        await ipc(evaluate, 'prometheus.integration.configure', { updates: [{ feature: 'services',
          expectedRevision: current.revisions.services, value: restoreServices }], secrets: {} })
        evidence.targetRestoration = 'restored'
      } catch {
        evidence.targetRestoration = 'unavailable; isolated launcher configuration only'
        evidence.complete = false
      }
    }
    evidence.finishedAt = new Date().toISOString()
    write(configuration.evidence, evidence)
  }
  return { passed: evidence.complete, observedBehavior: JSON.stringify({ complete: evidence.complete,
    checks: evidence.checks, failureCode: evidence.failureCode, requestedRoleStrengthCompliance: 'unknown',
    fullC15_1CompletionClaimed: false, evidencePath: configuration.evidence,
    evidenceSha256: digest(fs.readFileSync(configuration.evidence)) }) }
}
