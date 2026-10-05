import { createHash, randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'

import * as z from 'zod'

import { agentWorkspaceService } from '@data/services/AgentWorkspaceService'
import type { UarTeamBinding, UarTeamModelSelection } from '@shared/types/uarTeams'

import { codingTeamPackage, UAR_TEAM_HOST_EXTENSION, UAR_TEAM_HOST_CAPABILITY } from './uarCodingTeamPackage'
import { rawBinding, scopedRequest } from './UarDurableAdministrationAdapter'
import { document, starterBinding, revisedStarterBinding } from './uarStarterDocuments'
import { configureTeamModel } from './uarTeamModelSetup'
import { planningState } from './UarTeamsAdministrationAdapter'

const bindingPath = '/api/v1/collaboration/deployment-bindings'
const identity = z.object({ id: z.string(), version: z.string(), digest: z.string() })
const storedBinding = rawBinding.extend({ document: z.record(z.string(), z.json()) })

export async function setupUarCodingTeam(workspaceId: string, model: UarTeamModelSelection): Promise<UarTeamBinding> {
  const state = await planningState(workspaceId)
  if (!state.coding) throw new Error('TEAM_CAPABILITY_UNSUPPORTED')
  const capabilities = z
    .object({
      bindingOwnerId: z.string(),
      instance: z.object({ id: z.string() }),
      catalogStorage: z.object({ backend: z.enum(['surrealdb', 'surrealkv', 'postgresql', 'memory']) })
    })
    .parse(await scopedRequest(state.workspaceId, '/api/v1/collaboration/capabilities', state.generation))
  const selected = await configureTeamModel(model, state.generation)
  const preset = codingTeamPackage()
  const packages = z
    .array(z.object({ identity }))
    .parse(await scopedRequest(state.workspaceId, '/api/v1/collaboration/packages', state.generation))
  const installed = packages.find(
    ({ identity }) => identity.id === preset.identity.id && identity.version === preset.identity.version
  )
  if (installed && installed.identity.digest !== preset.identity.digest)
    throw new Error('UAR_TEAM_BINDING_PACKAGE_MISMATCH')
  if (!installed) {
    const request = { commandId: randomUUID(), manifest: preset.manifest, files: preset.files }
    await scopedRequest(
      state.workspaceId,
      '/api/v1/collaboration/packages:preflight',
      state.generation,
      'POST',
      request
    )
    const result = z
      .object({ preflight: z.object({ package: identity }) })
      .parse(
        await scopedRequest(
          state.workspaceId,
          '/api/v1/collaboration/packages:install',
          state.generation,
          'POST',
          request
        )
      )
    if (result.preflight.package.digest !== preset.identity.digest) throw new Error('UAR_TEAM_BINDING_PACKAGE_MISMATCH')
  }
  const directory = await realpath(agentWorkspaceService.getById(state.workspaceId).path)
  const modelKey = createHash('sha256')
    .update(
      selected.providerId +
        '\0' +
        selected.modelId +
        '\0' +
        selected.profile.id +
        ':' +
        selected.profile.revision +
        ':' +
        selected.settingsRevision
    )
    .digest('hex')
    .slice(0, 16)
  const base = starterBinding({
    ownerId: capabilities.bindingOwnerId,
    workspaceId: state.workspaceId,
    runtimeInstanceId: capabilities.instance.id,
    storageBackend: capabilities.catalogStorage.backend,
    packageIdentity: preset.identity,
    ...selected,
    bindingId: 'urn:boss:coding:binding:' + state.workspaceId + ':' + modelKey,
    effectiveLimits: { concurrentTurns: 1, maxMembers: 3, maxDepth: 0, maxPendingTasks: 8 }
  })
  const { contentDigest: _digest, ...fields } = base
  const binding = document({
    ...fields,
    requiredCapabilities: [...fields.requiredCapabilities, UAR_TEAM_HOST_CAPABILITY],
    extensions: {
      [UAR_TEAM_HOST_EXTENSION]: {
        required: true,
        value: {
          version: 1,
          workspacePath: directory,
          tools: [],
          servers: ['filesystem']
        }
      }
    },
    effectiveBudget: { maxTokens: 32768, maxCostMicrounits: 5000000, currency: 'USD', maxElapsedSeconds: 1200 }
  })
  const bindings = z.array(storedBinding).parse(await scopedRequest(state.workspaceId, bindingPath, state.generation))
  if (bindings.some((value) => value.workspaceId !== state.workspaceId)) throw new Error('TEAM_SCOPE_DENIED')
  const saved = bindings.find((value) => value.id === binding.id)
  if (
    saved &&
    (saved.package.digest !== preset.identity.digest ||
      saved.package.id !== preset.identity.id ||
      z
        .object({
          required: z.literal(true),
          value: z.object({
            workspacePath: z.literal(directory),
            version: z.literal(1),
            servers: z.tuple([z.literal('filesystem')]),
            tools: z.tuple([])
          })
        })
        .safeParse((saved.document.extensions as Record<string, unknown> | undefined)?.[UAR_TEAM_HOST_EXTENSION])
        .success === false)
  )
    throw new Error('TEAM_SCOPE_DENIED')
  if (saved?.activationSupported && saved.document.runtimeInstanceId === capabilities.instance.id)
    return rawBinding.parse(saved)
  const request = {
    commandId: randomUUID(),
    expectedRevision: saved?.revision ?? 0,
    binding: saved ? revisedStarterBinding(saved.document, saved.revision + 1, capabilities.instance.id) : binding
  }
  const preflight = z
    .object({ activationSupported: z.literal(true) })
    .parse(await scopedRequest(state.workspaceId, bindingPath + ':preflight', state.generation, 'POST', request))
  const result = z
    .object({ binding: rawBinding, preflight: z.object({ activationSupported: z.boolean() }) })
    .parse(await scopedRequest(state.workspaceId, bindingPath, state.generation, 'POST', request))
  if (
    !preflight.activationSupported ||
    !result.binding.activationSupported ||
    !result.preflight.activationSupported ||
    result.binding.id !== binding.id ||
    result.binding.workspaceId !== state.workspaceId ||
    result.binding.revision !== request.expectedRevision + 1
  )
    throw new Error('UAR_TEAM_BINDING_RESULT_MISMATCH')
  return result.binding
}
