import * as z from 'zod'

import { application } from '@application'
import {
  uarTeamSkillRefSchema,
  type UarAuthoredTeam,
  type UarTeamSkillCatalog,
  type UarTeamSkillRef
} from '@shared/types/uarTeams'

export const UAR_REVIEWED_SKILL_COVERAGE_EXTENSION = 'urn:prometheus:uar:reviewed-skill-coverage:1'

const reviewedCoverageSchema = z
  .object({
    status: z.enum(['reviewed', 'unreviewed', 'blocked']),
    reason: z.enum([
      'verified-current-closure',
      'trusted-source-unavailable',
      'reviewed-closure-verification-failed'
    ]),
    coverage: z
      .object({
        source: z.enum(['boss-packaged-mini', 'signed-full-generation']),
        closureDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        inventoryDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        locationDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        generationDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
        signerKeyId: z.string().min(1).optional(),
        trustRootDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional()
      })
      .optional()
  })
  .superRefine((value, context) => {
    if (value.status === 'reviewed' && !value.coverage)
      context.addIssue({ code: 'custom', message: 'Reviewed coverage must include an attested closure' })
  })

const reviewedCoverageExtensionSchema = z
  .object({
    required: z.literal(true),
    value: z
      .object({
        schemaVersion: z.literal(1),
        entries: z.array(
          z.object({
            skillRef: uarTeamSkillRefSchema,
            source: z.enum(['boss-packaged-mini', 'signed-full-generation']),
            closureDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            inventoryDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            locationDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            generationDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
            signerKeyId: z.string().min(1).optional(),
            trustRootDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional()
          })
        )
      })
      .strict()
  })
  .strict()

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
      privateBinding: z.object({ installedLocation: z.string().min(1) }).nullable(),
      reviewedCoverage: reviewedCoverageSchema.optional()
    })
  )
})

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)])
    )
  return value
}

export function sameUarTeamSkillRef(left: UarTeamSkillRef, right: UarTeamSkillRef): boolean {
  return (
    left.id === right.id &&
    left.version === right.version &&
    left.digest === right.digest &&
    left.entrypoint === right.entrypoint &&
    JSON.stringify(canonical(left.config)) === JSON.stringify(canonical(right.config)) &&
    JSON.stringify([...left.requiredTools].sort()) === JSON.stringify([...right.requiredTools].sort()) &&
    left.required === right.required
  )
}

function sameCatalogSkillRef(left: UarTeamSkillRef, right: UarTeamSkillRef): boolean {
  return (
    left.id === right.id &&
    left.version === right.version &&
    left.digest === right.digest &&
    left.entrypoint === right.entrypoint &&
    JSON.stringify(canonical(left.config)) === JSON.stringify(canonical(right.config)) &&
    JSON.stringify([...left.requiredTools].sort()) === JSON.stringify([...right.requiredTools].sort())
  )
}

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
    entries: catalog.entries.map(({ privateBinding: _binding, enabled: _enabled, tombstoned: _tombstoned, ...entry }) => ({
      ...entry,
      reviewedCoverage: entry.reviewedCoverage
        ? { status: entry.reviewedCoverage.status, reason: entry.reviewedCoverage.reason }
        : { status: 'unreviewed', reason: 'trusted-source-unavailable' }
    }))
  }
}

export async function resolveAuthoredTeamSkills(team: UarAuthoredTeam, generation: number) {
  const requested = team.members.flatMap((member) => member.skills)
  if (!requested.length) return { skillBindings: [], coverage: [] }
  const catalog = await deploymentCatalog(generation)
  const bindings = requested.map((skill) => {
    const entry = catalog.entries.find((item) => item.skillRef && sameCatalogSkillRef(item.skillRef, skill))
    if (
      !entry ||
      entry.availability !== 'available' ||
      !entry.enabled ||
      entry.tombstoned ||
      !entry.privateBinding
    )
      throw new Error('UAR_TEAM_SKILL_STALE: ' + skill.id)
    if (skill.required && entry.reviewedCoverage?.status !== 'reviewed')
      throw new Error('UAR_TEAM_SKILL_REVIEW_REQUIRED: ' + skill.id)
    return { skillRef: skill, installedLocation: entry.privateBinding.installedLocation, coverage: entry.reviewedCoverage }
  })
  const skillBindings = bindings.map(({ skillRef, installedLocation }) => ({ ...skillRef, installedLocation }))
  const distinctSkillBindings = new Map(skillBindings.map((entry) => [JSON.stringify(canonical(entry)), entry]))
  const coverage = bindings.flatMap(({ skillRef, coverage }) =>
    coverage?.status === 'reviewed' && coverage.coverage ? [{ skillRef, ...coverage.coverage }] : []
  )
  const distinctCoverage = new Map(coverage.map((entry) => [JSON.stringify(canonical(entry.skillRef)), entry]))
  return { skillBindings: [...distinctSkillBindings.values()], coverage: [...distinctCoverage.values()] }
}

export function reviewedSkillCoverageExtension(coverage: Awaited<ReturnType<typeof resolveAuthoredTeamSkills>>['coverage']) {
  return reviewedCoverageExtensionSchema.parse({ required: true, value: { schemaVersion: 1, entries: coverage } })
}

export function reviewedSkillCoverageEntries(value: unknown) {
  return reviewedCoverageExtensionSchema.parse(value).value.entries
}
