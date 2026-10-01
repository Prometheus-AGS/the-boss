import { classifyErrorCategory, type ErrorCategory } from '../utils/errorCategory'

export interface GrokCliErrorDiagnosis {
  category: ErrorCategory
  i18nKey: string
}

/** Subscription failures must not send OAuth users looking for an API key. */
export function diagnoseGrokCliError(text: string, status?: number): GrokCliErrorDiagnosis | undefined {
  const message = text.toLowerCase()
  if (
    status === 426 ||
    /(?:client|cli)[_ -]?version.{0,80}(?:unsupported|outdated|too old|minimum|required)/.test(message) ||
    /(?:unsupported|outdated|minimum|required).{0,80}(?:client|cli)[_ -]?version/.test(message) ||
    /(?:upgrade|update).{0,40}(?:client|grok cli|grok build)/.test(message)
  ) {
    return { category: 'bad_request', i18nKey: 'error.diagnosis.grok_client_update' }
  }
  const category = classifyErrorCategory({ text, status })
  if (category === 'auth' || /not signed in|token.{0,30}expired/.test(message)) {
    return { category: 'auth', i18nKey: 'error.diagnosis.grok_auth' }
  }
  if (category === 'model') return { category, i18nKey: 'error.diagnosis.grok_model' }
  if (status === 402 || /subscription|entitlement|(?:supergrok|grok).{0,20}plan/.test(message)) {
    return { category: 'permission', i18nKey: 'error.diagnosis.grok_entitlement' }
  }
  return undefined
}
