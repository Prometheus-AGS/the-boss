import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'

import * as z from 'zod'

import { application } from '@application'
import { uarReviewedModelPolicySchema, type UarReviewedModelPolicy } from '@shared/types/uarTeamModelPolicy'

const issuedPolicySchema = uarReviewedModelPolicySchema.extend({
  issuanceId: z.uuid(),
  bindingTarget: uarReviewedModelPolicySchema.shape.bindingTarget.unwrap()
})
const recordSchema = z.object({
  schemaVersion: z.literal(1),
  issuedAt: z.string(),
  policy: issuedPolicySchema
}).strict()
const root = () => application.getPath('feature.prometheus.state', 'reviewed-model-policies')
const filename = (name: string) => application.getPath('feature.prometheus.state', 'reviewed-model-policies/' + name)

export function issueReviewedModelPolicy(policy: UarReviewedModelPolicy): UarReviewedModelPolicy {
  const record = recordSchema.parse({
    schemaVersion: 1,
    issuedAt: new Date().toISOString(),
    policy: { ...policy, issuanceId: randomUUID() }
  })
  mkdirSync(root(), { recursive: true, mode: 0o700 })
  const pending = filename(randomUUID() + '.pending')
  writeFileSync(pending, JSON.stringify(record), { flag: 'wx', mode: 0o600 })
  renameSync(pending, filename(record.policy.issuanceId + '.json'))
  return record.policy
}

export function assertIssuedReviewedModelPolicy(policy: UarReviewedModelPolicy): UarReviewedModelPolicy | undefined {
  if (policy.issuanceId === undefined) return undefined
  const id = z.uuid().safeParse(policy.issuanceId)
  if (!id.success) throw new Error('UAR_TEAM_MODEL_POLICY_ISSUANCE_MISMATCH')
  const file = filename(id.data + '.json')
  if (!existsSync(file)) throw new Error('UAR_TEAM_MODEL_POLICY_REIMPORT_REQUIRED')
  const record = recordSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
  if (!isDeepStrictEqual(record.policy, policy)) throw new Error('UAR_TEAM_MODEL_POLICY_ISSUANCE_MISMATCH')
  return record.policy
}
