export { digest, write, same, waitFor, gatewayEnvironment } from '../approval-lifecycle-operation/io.mjs'

export function requireFact(value, code) {
  if (!value) throw Object.assign(new Error(code), { code })
}

const safeCode = (value) => typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(value)
  ? value : undefined

export function failure(error, stage, signal) {
  const status = Number(error?.status)
  return {
    stage,
    code: signal?.aborted ? 'C14W_OPERATION_CANCELLED_OR_TIMED_OUT'
      : safeCode(error?.code) ?? 'C14W_APPLICATION_OR_PREREQUISITE_UNAVAILABLE',
    ...(safeCode(error?.nativeCode) ? { nativeCode: error.nativeCode } : {}),
    ...(safeCode(error?.name) ? { errorType: error.name } : {}),
    ...(typeof error?.channel === 'string' && /^[a-zA-Z0-9_.]+$/.test(error.channel)
      ? { channel: error.channel } : {}),
    ...(['GET', 'POST', 'DELETE'].includes(error?.method) ? { method: error.method } : {}),
    ...(typeof error?.path === 'string' && /^\/api\/[a-zA-Z0-9_/.%+-]+$/.test(error.path)
      ? { path: error.path } : {}),
    ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {})
  }
}

export async function ipc(evaluate, channel, input) {
  const result = await evaluate(`window.api.ipcApi.request(${JSON.stringify(channel)},${JSON.stringify(input)})`)
  if (!result?.ok) throw Object.assign(new Error('C14W_APPLICATION_IPC_REFUSED'), {
    code: 'C14W_APPLICATION_IPC_REFUSED', channel, nativeCode: safeCode(result?.error?.code)
  })
  return result.data
}
