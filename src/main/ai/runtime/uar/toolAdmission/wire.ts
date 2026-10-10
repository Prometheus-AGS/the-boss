import { createHash } from 'node:crypto'

export const UAR_TOOL_ADMISSION_VERSION = 2
export const UAR_TOOL_ADMISSION_PATH = '/uar/admission/v2'
export const UAR_TOOL_ADMISSION_META_KEY = 'tools.know-me.the-boss/admission'

export type UarHostToolDisposition = 'auto' | 'ask' | 'deny'

export type UarToolExecutionKind = 'runtime_native' | 'host_mcp'

export type PreparedInvocation = {
  version: number
  executionKind: UarToolExecutionKind
  invocationId: string
  modelToolCallId: string
  attempt: number
  rootRunId: string
  executingRunId: string
  ownerId: string
  workspace: string
  runtimeEpoch: string
  hostEpoch: string
  authorityRevision: string
  catalogRevision: string
  mountedServerId: string
  nativeToolName: string
  providerToolName: string
  runPolicyRevision: string
  toolPolicyRevision: string
  callIndex: number
  validatedArguments: Record<string, unknown>
}

export function isPreparedInvocation(value: unknown): value is PreparedInvocation {
  if (!isRecord(value) || !isRecord(value.validatedArguments)) return false
  const strings = [
    'invocationId',
    'modelToolCallId',
    'rootRunId',
    'executingRunId',
    'ownerId',
    'workspace',
    'runtimeEpoch',
    'hostEpoch',
    'catalogRevision',
    'mountedServerId',
    'nativeToolName',
    'providerToolName',
    'runPolicyRevision',
    'toolPolicyRevision'
  ]
  return (
    value.version === UAR_TOOL_ADMISSION_VERSION &&
    (value.executionKind === 'runtime_native' || value.executionKind === 'host_mcp') &&
    value.attempt === 1 &&
    typeof value.authorityRevision === 'string' &&
    value.authorityRevision.trim().length > 0 &&
    Number.isSafeInteger(value.callIndex) &&
    strings.every((key) => typeof value[key] === 'string' && value[key].length > 0)
  )
}

export function argumentDigest(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalize(entry)])
  )
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
