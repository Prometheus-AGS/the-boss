import { createHash, randomUUID } from 'node:crypto'
import * as z from 'zod'
import { uarRepresentationGrantSchema, uarRepresentationInstallSchema,
  type UarRepresentationSaveInput, type UarRepresentationRevokeInput } from '@shared/types/uarRepresentation'
import { feedbackScope, feedbackRequest } from './uarFeedbackBoundary'
import { readUarDurableWorkspace } from './UarDurableAdministrationAdapter'
import { uarPrincipalForSession } from './uarPrincipal'

const path = '/representation-grants'
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]))
  return value
}
export async function readUarRepresentation(workspaceId: string) {
  const scope = await feedbackScope(workspaceId)
  const [raw, durable] = await Promise.all([feedbackRequest(scope, path), readUarDurableWorkspace(scope.workspaceId)])
  return { workspaceId: scope.workspaceId, issuerPrincipalId: uarPrincipalForSession('durable-administration'),
    grants: z.array(uarRepresentationGrantSchema).parse(raw), instances: durable.instances }
}
export async function readUarRepresentationHistory(input: { workspaceId: string; grantId: string }) {
  const scope = await feedbackScope(input.workspaceId)
  return z.array(uarRepresentationGrantSchema).parse(await feedbackRequest(scope,
    `${path}/${encodeURIComponent(input.grantId)}/history`))
}
export async function saveUarRepresentation(input: UarRepresentationSaveInput) {
  return installRepresentation(input, false)
}
async function installRepresentation(input: UarRepresentationSaveInput, revokingExisting: boolean) {
  const scope = await feedbackScope(input.workspaceId)
  const issuerPrincipalId = uarPrincipalForSession('durable-administration')
  const { instances } = await readUarDurableWorkspace(scope.workspaceId)
  if (!revokingExisting && !instances.some((instance) => instance.instanceId === input.grant.granteeAgentInstanceId)) {
    throw new Error('REPRESENTATION_INSTANCE_SCOPE_DENIED')
  }
  const content = { ...input.grant, issuerPrincipalId }
  const constraintDigest = 'sha256:' + createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex')
  const result = uarRepresentationInstallSchema.parse(await feedbackRequest(scope, path, {
    commandId: input.commandId, expectedRevision: input.expectedRevision ?? null,
    grant: { ...content, constraintDigest }
  }))
  if (result.grant.issuerPrincipalId !== issuerPrincipalId || result.grant.grantId !== content.grantId) {
    throw new Error('REPRESENTATION_ISSUER_PRINCIPAL_MISMATCH')
  }
  return result
}
export async function revokeUarRepresentation(input: UarRepresentationRevokeInput) {
  const scope = await feedbackScope(input.workspaceId)
  const current = uarRepresentationGrantSchema.parse(await feedbackRequest(scope,
    `${path}/${encodeURIComponent(input.grantId)}`))
  if (current.revision !== input.expectedRevision) throw new Error('REPRESENTATION_REVISION_CONFLICT')
  const { issuerPrincipalId: _issuer, constraintDigest: _digest, ...grant } = current
  return installRepresentation({ workspaceId: scope.workspaceId, commandId: randomUUID(),
    expectedRevision: current.revision, grant: { ...grant, revision: current.revision + 1, status: 'revoked',
      revocation: { revision: current.revision + 1, revokedAt: new Date().toISOString(), reason: input.reason } } }, true)
}
