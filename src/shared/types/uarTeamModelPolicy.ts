import * as z from 'zod'

const text = z.string().min(1)
const price = z.number().nonnegative().nullable()
const model = z.object({ source: z.literal('gateway'), providerId: text, modelId: text }).strict()

// Preserve the supported skill result, including its provenance and unknown metadata.
export const uarReviewedModelResultSchema = z.object({
  selected: z.object({
    id: text,
    provider: text.nullable(),
    catalogId: text.nullable(),
    available: z.literal(true),
    tier: z.enum(['low', 'medium', 'hard']).nullable(),
    capabilities: z.record(z.string(), z.boolean()),
    pricing: z.object({ inputPerMillion: price, outputPerMillion: price }).catchall(z.json()),
    provenance: z.record(z.string(), z.json()),
    freshness: z.record(z.string(), z.json())
  }).catchall(z.json()),
  policy: z.object({
    model: text.optional(),
    tier: z.enum(['low', 'medium', 'hard']).optional(),
    capabilities: z.array(text).optional(),
    maxInputPerMillion: z.number().nonnegative().optional(),
    maxOutputPerMillion: z.number().nonnegative().optional()
  }).strict(),
  appliedLayers: z.array(text),
  rejected: z.array(z.object({ id: text, reasons: z.array(text) }).strict()),
  explanation: text,
  warnings: z.array(text),
  diagnostics: z.array(text),
  catalogProvenance: z.json(),
  catalogFreshness: z.json()
}).strict()

export const uarReviewedModelPolicySchema = z.object({
  schemaVersion: z.literal(1),
  source: z.literal('agent-team-creator/models-select'),
  sourceDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  sourceJson: z.string().min(1).max(8 * 1024 * 1024),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  result: uarReviewedModelResultSchema,
  issuanceId: z.uuid().optional(),
  bindingTarget: z.object({
    source: z.literal('enabled-configured-gateway-alias'),
    providerId: text,
    modelId: text
  }).strict().optional(),
  selection: model
}).strict()

export type UarReviewedModelPolicy = z.infer<typeof uarReviewedModelPolicySchema>
