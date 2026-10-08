import * as z from 'zod'

const text = z.string().min(1)
const role = z
  .object({
    id: text,
    description: text,
    prompt: text,
    skills: z.array(text),
    owns: z.array(text),
    inputs: z.array(text),
    outputs: z.array(text),
    dependsOn: z.array(text),
    modelPolicy: z.record(z.string(), z.json()).optional()
  })
  .catchall(z.json())

// Keep the complete guide result; these fields only identify its role proposals.
export const uarGuideResultSchema = z
  .object({
    operation: z.literal('create'),
    questions: z.array(z.record(z.string(), z.json())),
    ready: z.boolean().optional(),
    team: z.object({ roles: z.array(role) }).catchall(z.json()).optional(),
    proposedRoles: z.array(role).optional(),
    reasons: z.array(text).optional(),
    missing: z.array(text).optional(),
    alternatives: z.array(text).optional(),
    skillDiscovery: text.optional()
  })
  .catchall(z.json())
  .superRefine((value, context) => {
    if (value.ready && !value.team)
      context.addIssue({ code: 'custom', path: ['team'], message: 'A ready guide result requires its team' })
  })

export const uarReviewedGuidanceSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.literal('agent-team-creator/guide'),
    sourceJson: z.string().min(1).max(8 * 1024 * 1024),
    sourceDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    result: uarGuideResultSchema
  })
  .strict()

export const uarGuidanceMappingSchema = z
  .object({
    sourceRole: text,
    memberRole: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)
  })
  .strict()

export type UarReviewedGuidance = z.infer<typeof uarReviewedGuidanceSchema>
export type UarGuidanceMapping = z.infer<typeof uarGuidanceMappingSchema>
export function uarGuidanceRoles(value: UarReviewedGuidance) {
  return value.result.team?.roles ?? value.result.proposedRoles ?? []
}
