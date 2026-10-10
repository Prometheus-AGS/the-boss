import { randomUUID } from 'node:crypto'

import type { ProjectionCatalogProfile, ProjectionToolMode } from './bauar-secret-projection-mcp'

type ProviderFailure = 'invalid_request_shape' | 'discovery_not_advertised' | 'target_not_advertised' |
  'unexpected_tool_history' | 'missing_call_history' | 'missing_tool_result' | 'duplicate_tool_history' |
  'tool_identity_mismatch' | 'result_before_call' | 'conversation_already_complete'
type ProposedCall = { id: string; name: string; arguments: string }
export type ProjectionResultDiagnostic = {
  redacted: boolean; canaryAbsent: boolean; redactionMarkerPresent: boolean; uarRedactionMarkerPresent: boolean;
  genericMcpFailure: boolean | null; failureProvenanceMatches: boolean | null
}
type ProviderStep = { kind: 'call'; call: ProposedCall } |
  ({ kind: 'complete' } & ProjectionResultDiagnostic) |
  { kind: 'failure'; category: ProviderFailure }
export type ProjectionProviderDriver = {
  next(value: unknown): Exclude<ProviderStep, { kind: 'failure' }> | { kind: 'failure'; category: string }
  diagnostic(): Record<string, unknown>
}
type HistoryCall = { index: number; id: unknown; name: unknown }
type HistoryResult = { index: number; id: unknown; message: Record<string, unknown> }

export class ProjectionProviderConversation {
  private state: 'initial' | 'discovery' | 'target' | 'complete' | 'failed' = 'initial'
  private readonly calls: ProposedCall[] = []
  private failure?: ProviderFailure
  private requestCount = 0
  private discoveryProposals = 0
  private targetProposals = 0
  private discoveryCorrelated = false
  private targetCorrelated = false
  private initiallyAdvertised = false
  private advertisedAfterDiscovery = false

  constructor(readonly mode: ProjectionToolMode, private readonly target: string, private readonly canary: string,
    readonly profile: ProjectionCatalogProfile | 'event' = 'event', private readonly serverId?: string) {}

  next(value: unknown): ProviderStep {
    this.requestCount += 1
    if (this.failure) return { kind: 'failure', category: this.failure }
    if (this.state === 'complete') return this.fail('conversation_already_complete')
    if (!isRecord(value) || !Array.isArray(value.messages) || !Array.isArray(value.tools)) {
      return this.fail('invalid_request_shape')
    }
    const names = value.tools.flatMap((tool) => isRecord(tool) && isRecord(tool.function) &&
      typeof tool.function.name === 'string' ? [tool.function.name] : [])
    const turnStart = value.messages.findLastIndex((message) => isRecord(message) && message.role === 'user')
    if (turnStart < 0) return this.fail('invalid_request_shape')
    const historyCalls: HistoryCall[] = []
    const results: HistoryResult[] = []
    for (const [index, message] of value.messages.slice(turnStart + 1).entries()) {
      if (!isRecord(message)) return this.fail('invalid_request_shape')
      if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
        for (const call of message.tool_calls) {
          if (!isRecord(call) || !isRecord(call.function)) return this.fail('invalid_request_shape')
          historyCalls.push({ index, id: call.id, name: call.function.name })
        }
      }
      if (message.role === 'tool') results.push({ index, id: message.tool_call_id, message })
    }
    if (historyCalls.some((call) => !this.calls.some((expected) => expected.id === call.id)) ||
      results.some((result) => !this.calls.some((expected) => expected.id === result.id))) {
      return this.fail('unexpected_tool_history')
    }
    for (const expected of this.calls) {
      const matches = historyCalls.filter((call) => call.id === expected.id)
      const matchingResults = results.filter((result) => result.id === expected.id)
      if (matches.length === 0) return this.fail('missing_call_history')
      if (matchingResults.length === 0) return this.fail('missing_tool_result')
      if (matches.length !== 1 || matchingResults.length !== 1) return this.fail('duplicate_tool_history')
      if (matches[0].name !== expected.name) return this.fail('tool_identity_mismatch')
      if (matchingResults[0].index <= matches[0].index) return this.fail('result_before_call')
    }
    const targetNames = names.filter((name) => name === this.target)
    if (targetNames.length > 1) return this.fail('invalid_request_shape')
    if (this.state === 'initial') {
      this.initiallyAdvertised = targetNames.length === 1
      if (this.initiallyAdvertised) return this.proposeTarget(targetNames[0])
      const discoveryNames = names.filter((name) => name === 'search_tools')
      if (discoveryNames.length !== 1) return this.fail('discovery_not_advertised')
      this.state = 'discovery'
      this.discoveryProposals += 1
      return this.propose(discoveryNames[0], { query: this.target })
    }
    if (this.state === 'discovery') {
      this.discoveryCorrelated = true
      this.advertisedAfterDiscovery = targetNames.length === 1
      if (!this.advertisedAfterDiscovery) return this.fail('target_not_advertised')
      return this.proposeTarget(targetNames[0])
    }
    this.targetCorrelated = true
    this.state = 'complete'
    const expected = this.calls.at(-1)!
    const message = results.find((entry) => entry.id === expected.id)!.message
    const result = JSON.stringify(message)
    const canaryAbsent = !result.includes(this.canary)
    const redactionMarkerPresent = result.includes('<redacted>')
    let failure: unknown
    if (this.mode === 'error' && typeof message.content === 'string') {
      try { failure = JSON.parse(message.content) } catch { failure = undefined }
    }
    const genericMcpFailure = this.mode !== 'error' || this.serverId === undefined ? null
      : isRecord(failure) && failure.message === `MCP tool ${JSON.stringify(this.target)} failed on server ${JSON.stringify(this.serverId)}`
    const failureProvenanceMatches = this.mode !== 'error' ? null
      : isRecord(failure) && failure.status === 'error' && failure.tool_call_id === expected.id && failure.tool === expected.name
        && isRecord(failure.provenance) && failure.provenance.source === 'mcp'
        && failure.provenance.terminal_state === 'failed' && failure.provenance.observed_by === 'trusted_host'
    return { kind: 'complete', redacted: canaryAbsent && redactionMarkerPresent, canaryAbsent, redactionMarkerPresent,
      uarRedactionMarkerPresent: result.includes('[REDACTED]'), genericMcpFailure, failureProvenanceMatches }
  }

  diagnostic() {
    return { mode: this.mode, state: this.state, failure: this.failure ?? null, requestCount: this.requestCount,
      discoveryProposals: this.discoveryProposals, targetProposals: this.targetProposals,
      discoveryCorrelated: this.discoveryCorrelated, targetCorrelated: this.targetCorrelated,
      initiallyAdvertised: this.initiallyAdvertised, advertisedAfterDiscovery: this.advertisedAfterDiscovery }
  }

  private proposeTarget(name: string): ProviderStep {
    this.state = 'target'
    this.targetProposals += 1
    return this.propose(name, { echo: this.canary, mode: this.mode })
  }

  private propose(name: string, args: Record<string, string>): ProviderStep {
    const call = { id: randomUUID(), name, arguments: JSON.stringify(args) }
    this.calls.push(call)
    return { kind: 'call', call }
  }

  private fail(category: ProviderFailure): ProviderStep {
    this.state = 'failed'
    this.failure = category
    return { kind: 'failure', category }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
