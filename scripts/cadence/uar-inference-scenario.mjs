import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

async function ipc(evaluate, route, input) {
  const result = await evaluate(`window.api.ipcApi.request(${JSON.stringify(route)}, ${JSON.stringify(input)})`)
  if (!result?.ok) throw new Error(`${route} failed; inspect the isolated application logs`)
  return result.data
}

async function data(evaluate, method, resource, body) {
  const result = await evaluate(`window.api.dataApi.request({
    id: crypto.randomUUID(), method: ${JSON.stringify(method)}, path: ${JSON.stringify(resource)},
    ${body === undefined ? '' : `body: ${JSON.stringify(body)},`}
  })`)
  if (result?.error) throw new Error(`${method} ${resource} failed; inspect the isolated application logs`)
  return result?.data
}

export default async function run({ evaluate, signal }) {
  signal.throwIfAborted()
  const sidecar = await ipc(evaluate, 'prometheus.uar.admin.snapshot', {})
  if (!sidecar?.uarVersion || !sidecar?.generation) throw new Error('Packaged UAR sidecar did not initialize')

  const credential = process.env.BOSS_CADENCE_LITER_KEY ?? process.env.LITER_LLM_MASTER_KEY
  if (!credential) throw new Error('Set BOSS_CADENCE_LITER_KEY or LITER_LLM_MASTER_KEY for isolated UAR inference')
  const endpoint = process.env.BOSS_CADENCE_LITER_ENDPOINT ?? 'http://127.0.0.1:4000'
  const configured = await ipc(evaluate, 'prometheus.integration.snapshot', {})
  const services = configured.config.services
  await ipc(evaluate, 'prometheus.integration.configure', {
    updates: [
      {
        feature: 'services',
        expectedRevision: configured.revisions.services,
        value: { ...services, liter: { ownership: 'external', source: 'manual', endpoint } }
      }
    ],
    secrets: { literKey: { operation: 'set', value: credential } }
  })

  const sources = await ipc(evaluate, 'prometheus.uar.models.sources', {})
  const gateway = sources.sources.find((source) => source.source === 'gateway')
  if (!gateway?.operational) throw new Error(`liter-llm model discovery failed: ${gateway?.error ?? 'unavailable'}`)
  const aliases = gateway.providers.flatMap((provider) => provider.models.filter((model) => model.enabled))
  const preferred = process.env.BOSS_CADENCE_LITER_ALIAS ?? 'kimi-for-coding'
  const alias =
    aliases.find((model) => model.id === preferred) ?? (!process.env.BOSS_CADENCE_LITER_ALIAS ? aliases[0] : undefined)
  if (!alias) throw new Error(`liter-llm does not serve the requested alias ${preferred}`)

  const models = await data(evaluate, 'GET', '/models')
  const compatibilityModel = models?.find((model) => model.isEnabled)?.id
  if (!compatibilityModel) throw new Error('The isolated Boss profile has no enabled compatibility model')
  const agent = await ipc(evaluate, 'ai.agent.create', {
    type: 'uar',
    name: 'Cadence UAR inference',
    instructions: 'Reply only with the exact text requested by the user.',
    model: compatibilityModel,
    mcps: [],
    configuration: {
      permission_mode: 'plan',
      uar_model_assignment: { source: 'gateway', modelId: alias.id }
    }
  })
  const directory = mkdtempSync(path.join(os.tmpdir(), 'boss-cadence-uar-'))
  const workspace = await data(evaluate, 'POST', '/agent-workspaces', { path: directory })
  const created = await ipc(evaluate, 'ai.agent.session.reuse_or_create', {
    agentId: agent.id,
    workspace: { type: 'user', workspaceId: workspace.id }
  })
  const sessionId = created.session.id
  const topicId = `agent-session:${sessionId}`
  const marker = `CADENCE_UAR_${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
  const stream = await evaluate(`(async () => {
    const topicId = ${JSON.stringify(topicId)};
    window.__cadenceUarInference = { done: false, error: false };
    window.api.ipcApi.on('ai.stream.done', (event) => {
      if (event.topicId === topicId && event.isTopicDone) window.__cadenceUarInference.done = true;
    });
    window.api.ipcApi.on('ai.stream.error', (event) => {
      if (event.topicId === topicId && event.isTopicDone) window.__cadenceUarInference.error = true;
    });
    const opened = await window.api.ipcApi.request('ai.stream.open', {
      trigger: 'submit-message', topicId,
      mentionedModelIds: [${JSON.stringify(compatibilityModel)}],
      userMessageParts: [{ type: 'text', text: ${JSON.stringify(`Reply with exactly ${marker}.`)} }]
    });
    return { ok: opened.ok, error: opened.error?.message };
  })()`)
  if (!stream?.ok) throw new Error('UAR conversation was not admitted; inspect the isolated application logs')

  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    const state = await evaluate('window.__cadenceUarInference')
    if (state?.error) throw new Error('UAR conversation failed; inspect the isolated application logs')
    if (state?.done) break
    await delay(250, undefined, { signal })
  }
  if (!(await evaluate('window.__cadenceUarInference.done'))) {
    throw new Error('UAR conversation did not complete within two minutes')
  }
  const page = await data(evaluate, 'GET', `/agent-sessions/${sessionId}/messages`)
  const reply = page?.items?.find((message) => message.role === 'assistant')
  if (reply?.status !== 'success' || reply.searchableText?.trim() !== marker) {
    throw new Error('UAR conversation completed without the requested assistant reply')
  }
  if (reply.messageSnapshot?.model?.id !== alias.id || reply.messageSnapshot?.model?.provider !== 'the-boss-gateway') {
    throw new Error('The persisted assistant reply does not identify the selected liter-llm alias')
  }
  return {
    passed: true,
    observedBehavior: `Packaged The Boss started UAR ${sidecar.uarVersion}, created a UAR-owned session, routed a fresh turn through liter-llm alias ${alias.id}, and persisted the exact assistant reply ${marker}.`
  }
}
