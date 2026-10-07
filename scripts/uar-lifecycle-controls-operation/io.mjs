export { digest, write, same, gatewayEnvironment, waitFor } from '../approval-lifecycle-operation/io.mjs'

export function requireFact(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code })
}

const publicCode = (value) => typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(value)
  ? value : undefined

/** Retain transport facts, never arbitrary native/IPC messages, bodies or credential-bearing URLs. */
export function failure(error, stage, signal) {
  const message = typeof error?.message === 'string' ? error.message : ''
  const http = /UAR request (GET|POST|PUT|DELETE) (\/api\/[A-Za-z0-9_/:.%+-]+) failed with HTTP (\d{3})(?: \(([A-Za-z_][A-Za-z0-9_-]{0,127})\))?/.exec(message)
  const status = http ? Number(http[3]) : Number(error?.status)
  const nativeCode = publicCode(http?.[4] ?? error?.nativeCode)
  return {
    stage,
    code: signal?.aborted ? 'C14C_OPERATION_CANCELLED_OR_TIMED_OUT'
      : publicCode(error?.code) ?? 'C14C_APPLICATION_OR_PREREQUISITE_FAILURE',
    ...(publicCode(error?.name) ? { errorType: error.name } : {}),
    ...(error?.channel ? { channel: error.channel } : {}),
    ...(http ? { method: http[1], path: http[2] } : {}),
    ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {}),
    ...(nativeCode ? { nativeCode } : {})
  }
}
