import { createHash, randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'

import { dialog } from 'electron'
import * as z from 'zod'

import { agentWorkspaceService } from '@data/services/AgentWorkspaceService'
import {
  uarAuthoredTeamSchema,
  type UarAuthoredTeam,
  type UarTeamAuthoringSnapshot,
  type UarTeamBinding
} from '@shared/types/uarTeams'

import { UAR_TEAM_HOST_CAPABILITY, UAR_TEAM_HOST_EXTENSION } from './uarCodingTeamPackage'
import { rawBinding, scopedRequest } from './UarDurableAdministrationAdapter'
import { document, starterBinding, revisedStarterBinding } from './uarStarterDocuments'
import { compileAuthoredTeam, teamAuthoringTemplates } from './uarTeamAuthoringPackage'
import { readAuthoredTeamRecords, projectAuthoredTeam, saveAuthoredTeamRecord } from './uarTeamAuthoringStore'
import { configureTeamModel } from './uarTeamModelSetup'
import { assertReviewedModelPolicy } from './uarTeamReviewedModelPolicy'
import { planningState } from './UarTeamsAdministrationAdapter'
import { resolveAuthoredTeamSkills } from './UarTeamSkillCatalogAdapter'

export function readUarTeamAuthoring(): UarTeamAuthoringSnapshot {
  return {
    schemaVersion: 1,
    revisions: readAuthoredTeamRecords().map(projectAuthoredTeam),
    templates: teamAuthoringTemplates()
  }
}

export async function selectUarTeamKnowledge(workspaceId: string): Promise<string[]> {
  const directory = await realpath(agentWorkspaceService.getById(workspaceId).path)
  const selected = await dialog.showOpenDialog({ defaultPath: directory, properties: ['openFile', 'multiSelections'] })
  if (selected.canceled) return []
  return Promise.all(
    selected.filePaths.map(async (file) => {
      const actual = await realpath(file)
      const relative = path.relative(directory, actual)
      if (relative.startsWith('..') || path.isAbsolute(relative) || !(await stat(actual)).isFile())
        throw new Error('TEAM_SCOPE_DENIED')
      return relative.split(path.sep).join('/')
    })
  )
}

export async function saveUarTeamAuthoring(input: { team: UarAuthoredTeam; expectedRevision: number }) {
  const team = uarAuthoredTeamSchema.parse(input.team)
  for (const member of team.members) {
    if (member.reviewedModelPolicy) await assertReviewedModelPolicy(member.reviewedModelPolicy)
    if (member.knowledge.length && !member.tools.includes('filesystem__read'))
      throw new Error('UAR_TEAM_KNOWLEDGE_READ_REQUIRED: ' + member.role)
    if (
      member.skills.some((skill) =>
        skill.requiredTools.some((tool) => !member.tools.includes(tool as (typeof member.tools)[number]))
      )
    )
      throw new Error('UAR_TEAM_SKILL_TOOLS_UNAVAILABLE: ' + member.role)
  }
  const revision = input.expectedRevision + 1
  const compiled = await compileAuthoredTeam(team, revision)
  const record = {
    schemaVersion: 1 as const,
    revision,
    savedAt: new Date().toISOString(),
    team,
    package: compiled.identity,
    definition: compiled.definition,
    compiled
  }
  saveAuthoredTeamRecord(record, input.expectedRevision)
  return projectAuthoredTeam(record)
}

export async function deployUarAuthoredTeam(input: {
  workspaceId: string
  teamId: string
  revision: number
}): Promise<UarTeamBinding> {
  const record = readAuthoredTeamRecords().find(
    (item) => item.team.id === input.teamId && item.revision === input.revision
  )
  if (!record) throw new Error('TEAM_SCOPE_DENIED')
  const state = await planningState(input.workspaceId)
  if (!state.coding) throw new Error('TEAM_CAPABILITY_UNSUPPORTED')
  const capabilities = z
    .object({
      bindingOwnerId: z.string(),
      instance: z.object({ id: z.string() }),
      catalogStorage: z.object({ backend: z.enum(['surrealdb', 'surrealkv', 'postgresql', 'memory']) })
    })
    .parse(await scopedRequest(state.workspaceId, '/api/v1/collaboration/capabilities', state.generation))
  const directory = await realpath(agentWorkspaceService.getById(state.workspaceId).path)
  for (const member of record.team.members)
    for (const knowledge of member.knowledge) {
      const selected = path.resolve(directory, knowledge.path)
      const relative = path.relative(directory, selected)
      if (path.isAbsolute(knowledge.path) || relative.startsWith('..') || !relative)
        throw new Error('TEAM_SCOPE_DENIED')
      try {
        const actual = await realpath(selected)
        const contained = path.relative(directory, actual)
        if (contained.startsWith('..') || path.isAbsolute(contained) || !(await stat(actual)).isFile())
          throw new Error('TEAM_SCOPE_DENIED')
      } catch (error) {
        if (knowledge.required || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  const skillBindings = await resolveAuthoredTeamSkills(record.team, state.generation)
  const modelBindings: Array<
    Awaited<ReturnType<typeof configureTeamModel>> & { requestedAlias: string; credentialRef: string }
  > = []
  for (const member of record.team.members) {
    if (!member.model) throw new Error('UAR_TEAM_MODEL_REQUIRED: ' + member.role)
    if (member.reviewedModelPolicy && !member.modelPolicyMode)
      throw new Error('UAR_TEAM_MODEL_POLICY_CHOICE_REQUIRED: ' + member.role)
    const selected = member.modelPolicyMode === 'reviewed' ? member.reviewedModelPolicy?.result.selected : undefined
    const model = await configureTeamModel(
      member.model,
      state.generation,
      selected ? { providerId: selected.provider, modelId: selected.catalogId } : undefined
    )
    modelBindings.push({
      requestedAlias: 'role:' + member.role,
      providerId: model.providerId,
      modelId: model.modelId,
      profile: model.profile,
      settingsRevision: model.settingsRevision,
      credentialRef: 'protected-credential://uar/provider/' + model.providerId
    })
  }
  const preset = record.compiled
  const packageRequest = { commandId: randomUUID(), manifest: preset.manifest, files: preset.files }
  await scopedRequest(
    state.workspaceId,
    '/api/v1/collaboration/packages:preflight',
    state.generation,
    'POST',
    packageRequest
  )
  const installed = z.object({
    preflight: z.object({
      package: z.object({
        id: z.literal(preset.identity.id),
        version: z.literal(preset.identity.version),
        digest: z.literal(preset.identity.digest)
      })
    })
  })
  installed.parse(
    await scopedRequest(
      state.workspaceId,
      '/api/v1/collaboration/packages:install',
      state.generation,
      'POST',
      packageRequest
    )
  )
  const modelKey = createHash('sha256')
    .update(JSON.stringify({ modelBindings, skillBindings, directory }))
    .digest('hex')
    .slice(0, 16)
  const bindingId =
    'urn:boss:authored:binding:' + record.team.id + ':' + record.revision + ':' + state.workspaceId + ':' + modelKey
  const limits = { concurrentTurns: 1, maxMembers: record.team.members.length, maxDepth: 0, maxPendingTasks: 16 }
  const base = starterBinding({
    ownerId: capabilities.bindingOwnerId,
    workspaceId: state.workspaceId,
    runtimeInstanceId: capabilities.instance.id,
    storageBackend: capabilities.catalogStorage.backend,
    packageIdentity: preset.identity,
    bindingId,
    effectiveLimits: limits
  })
  const { contentDigest: _digest, ...fields } = base
  const binding = document({
    ...fields,
    modelBindings,
    skillBindings,
    requiredCapabilities: [...fields.requiredCapabilities, UAR_TEAM_HOST_CAPABILITY],
    effectiveBudget: { maxTokens: 65536, maxCostMicrounits: 10000000, currency: 'USD', maxElapsedSeconds: 2400 },
    extensions: {
      [UAR_TEAM_HOST_EXTENSION]: {
        required: true,
        value: {
          version: 1,
          workspacePath: directory,
          servers: ['filesystem'],
          tools: []
        }
      }
    }
  })
  const bindingPath = '/api/v1/collaboration/deployment-bindings'
  const saved = z
    .array(rawBinding.extend({ document: z.record(z.string(), z.json()) }))
    .parse(await scopedRequest(state.workspaceId, bindingPath, state.generation))
    .find((item) => item.id === bindingId)
  if (
    saved &&
    (saved.workspaceId !== state.workspaceId ||
      saved.package.digest !== preset.identity.digest ||
      saved.document.ownerId !== capabilities.bindingOwnerId ||
      document({ extensions: saved.document.extensions ?? null }).contentDigest !==
        document({ extensions: binding.extensions }).contentDigest)
  )
    throw new Error('TEAM_SCOPE_DENIED')
  const request = {
    commandId: randomUUID(),
    expectedRevision: saved?.revision ?? 0,
    binding: saved ? revisedStarterBinding(saved.document, saved.revision + 1, capabilities.instance.id) : binding
  }
  const preflight = z
    .object({ activationSupported: z.boolean(), diagnostics: z.array(z.unknown()).optional() })
    .parse(await scopedRequest(state.workspaceId, bindingPath + ':preflight', state.generation, 'POST', request))
  if (!preflight.activationSupported)
    throw new Error('UAR_TEAM_BINDING_ACTIVATION_UNAVAILABLE: ' + JSON.stringify(preflight.diagnostics ?? []))
  if (saved?.activationSupported && saved.document.runtimeInstanceId === capabilities.instance.id)
    return rawBinding.parse(saved)
  const result = z
    .object({ binding: rawBinding, preflight: z.object({ activationSupported: z.literal(true) }) })
    .parse(await scopedRequest(state.workspaceId, bindingPath, state.generation, 'POST', request))
  if (
    result.binding.id !== bindingId ||
    result.binding.workspaceId !== state.workspaceId ||
    result.binding.package.digest !== preset.identity.digest ||
    result.binding.revision !== request.expectedRevision + 1
  )
    throw new Error('UAR_TEAM_BINDING_RESULT_MISMATCH')
  return result.binding
}
