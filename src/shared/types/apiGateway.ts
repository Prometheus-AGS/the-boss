export type ApiGatewayConfig = {
  enabled: boolean
  host: string
  port: number
  apiKey: string | null
}

export const API_GATEWAY_REQUIRED_I18N_KEY = 'api_gateway_required'

/** Result of an API-gateway start/restart IPC call. */
export type ApiGatewayStatusResult = { success: true } | { success: false; error: string }

export type ApiGatewayStopOutcome = 'stopped'
export type ApiGatewayStopResult = { success: true; outcome: ApiGatewayStopOutcome } | { success: false; error: string }
