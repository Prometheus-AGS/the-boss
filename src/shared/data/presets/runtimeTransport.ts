import { OPENAI_CODEX_PROVIDER_ID } from './codex'
import { GROK_CLI_PROVIDER_ID } from './grokCli'

/** App-managed OAuth providers supported by the Boss runtime bridges. */
export const RUNTIME_TRANSPORT_ADAPTER_PROVIDER_IDS = [GROK_CLI_PROVIDER_ID, OPENAI_CODEX_PROVIDER_ID] as const

export function hasRuntimeTransportAdapter(providerId: string): boolean {
  return (RUNTIME_TRANSPORT_ADAPTER_PROVIDER_IDS as readonly string[]).includes(providerId)
}
