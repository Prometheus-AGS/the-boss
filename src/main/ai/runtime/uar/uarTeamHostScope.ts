import { realpath } from 'node:fs/promises'

import * as z from 'zod'

import { agentWorkspaceService } from '@data/services/AgentWorkspaceService'
import type { UarTeamInstance } from '@shared/types/uarTeams'

import {
  codingTeamPackage,
  codingReadTools,
  codingWriteTools,
  UAR_CODING_TEAM_ID,
  UAR_TEAM_HOST_EXTENSION
} from './uarCodingTeamPackage'
import { rawBinding, scopedRequest } from './UarDurableAdministrationAdapter'
import { readAuthoredTeamRecords } from './uarTeamAuthoringStore'

/** A discovered definition is not host authority. Resolve the exact installed private binding and authored bytes. */
export async function resolveTeamHostScope(team: UarTeamInstance, generation: number) {
  const directory = await realpath(agentWorkspaceService.getById(team.workspaceId).path)
  const bindings = z
    .array(rawBinding.extend({ document: z.record(z.string(), z.json()) }))
    .parse(await scopedRequest(team.workspaceId, '/api/v1/collaboration/deployment-bindings', generation))
  const binding = bindings.find((item) => item.id === team.binding.id && item.revision === team.binding.revision)
  if (
    !binding ||
    !binding.activationSupported ||
    binding.workspaceId !== team.workspaceId ||
    binding.document.ownerId !== team.ownerId ||
    binding.package.id !== team.package.id ||
    binding.package.version !== team.package.version ||
    binding.package.digest !== team.package.digest
  )
    throw new Error('TEAM_SCOPE_DENIED')
  z.object({
    required: z.literal(true),
    value: z
      .object({
        version: z.literal(1),
        workspacePath: z.literal(directory),
        servers: z.tuple([z.literal('filesystem')]),
        tools: z.tuple([])
      })
      .strict()
  })
    .strict()
    .parse((binding.document.extensions as Record<string, unknown> | undefined)?.[UAR_TEAM_HOST_EXTENSION])
  const same = (left: { id: string; version: string; digest: string }, right: typeof left) =>
    left.id === right.id && left.version === right.version && left.digest === right.digest
  if (team.definition.id === UAR_CODING_TEAM_ID) {
    const preset = codingTeamPackage()
    if (!same(team.definition, preset.definition) || !same(team.package, preset.identity))
      throw new Error('TEAM_SCOPE_DENIED')
    return {
      directory,
      memberTools: new Map([
        ['coordinator', []],
        ['worker', [...codingReadTools, ...codingWriteTools]],
        ['reviewer', codingReadTools]
      ])
    }
  }
  const record = readAuthoredTeamRecords().find(
    (item) => same(item.definition, team.definition) && same(item.package, team.package)
  )
  if (!record) throw new Error('TEAM_SCOPE_DENIED')
  for (const member of team.members) {
    const source = record.compiled.files['agents/' + member.role + '.json']
    if (!source) throw new Error('TEAM_SCOPE_DENIED')
    const definition = z
      .object({ id: z.string(), version: z.string(), contentDigest: z.string() })
      .parse(JSON.parse(source))
    if (!same(member.definition, { id: definition.id, version: definition.version, digest: definition.contentDigest }))
      throw new Error('TEAM_SCOPE_DENIED')
  }
  return { directory, memberTools: new Map(record.team.members.map((member) => [member.role, member.tools])) }
}
