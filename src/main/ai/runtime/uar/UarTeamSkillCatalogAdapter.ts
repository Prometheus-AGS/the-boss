import * as z from 'zod'

import { application } from '@application'
import { uarTeamSkillRefSchema, type UarTeamSkillCatalog, type UarAuthoredTeam } from '@shared/types/uarTeams'

const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(
    z.object({
      skillId: z.string(),
      title: z.string(),
      description: z.string(),
      enabled: z.boolean(),
      tombstoned: z.boolean(),
      availability: z.enum(['available', 'unavailable']),
      reasons: z.array(z.string()),
      skillRef: uarTeamSkillRefSchema.nullable(),
      privateBinding: z.object({ installedLocation: z.string().min(1) }).nullable()
    })
  )
})

async function deploymentCatalog(generation?: number) {
  const sidecar = application.get('UarSidecarService')
  const endpoint = await sidecar.resolveSelected()
  if (generation !== undefined && endpoint.generation !== generation) throw new Error('TEAM_SCOPE_DENIED')
  const response = await sidecar.adminRequestInstance(endpoint, '/api/uar/skills/deployment-catalog')
  if (!response.ok) throw new Error('UAR_SKILL_DEPLOYMENT_CATALOG_UNAVAILABLE (HTTP ' + response.status + ')')
  return catalogSchema.parse(await response.json())
}

export async function readUarTeamSkillCatalog(): Promise<UarTeamSkillCatalog> {
  const catalog = await deploymentCatalog()
  return {
    schemaVersion: 1,
    entries: catalog.entries.map(
      ({ privateBinding: _binding, enabled: _enabled, tombstoned: _tombstoned, ...entry }) => entry
    )
  }
}

export async function resolveAuthoredTeamSkills(team: UarAuthoredTeam, generation: number) {
  const requested = team.members.flatMap((member) => member.skills)
  if (!requested.length) return []
  const catalog = await deploymentCatalog(generation)
  const bindings = requested.map((skill) => {
    const entry = catalog.entries.find(
      (item) =>
        item.skillRef?.id === skill.id &&
        item.skillRef.version === skill.version &&
        item.skillRef.digest === skill.digest
    )
    if (
      !entry ||
      entry.availability !== 'available' ||
      !entry.enabled ||
      entry.tombstoned ||
      !entry.privateBinding ||
      entry.skillRef?.entrypoint !== skill.entrypoint ||
      JSON.stringify([...entry.skillRef.requiredTools].sort()) !== JSON.stringify([...skill.requiredTools].sort())
    )
      throw new Error('UAR_TEAM_SKILL_STALE: ' + skill.id)
    return { ...skill, installedLocation: entry.privateBinding.installedLocation }
  })
  const distinct = new Map<string, (typeof bindings)[number]>()
  for (const binding of bindings) {
    const previous = distinct.get(binding.id)
    if (previous && JSON.stringify(previous) !== JSON.stringify(binding))
      throw new Error('UAR_TEAM_SKILL_SCOPE_CONFLICT: ' + binding.id)
    distinct.set(binding.id, binding)
  }
  return [...distinct.values()]
}
