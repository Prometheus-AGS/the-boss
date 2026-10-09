import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

export const digest = (value) => createHash('sha256').update(value).digest('hex')
export const write = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
export const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
export const route = (name) => 'prometheus.uar.teams.' + name
export function requireFact(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code })
}
export function nativeIpcFailure(channel, error) {
  let message = String(error?.message ?? '')
  const credentialNames = [process.env.BOSS_C15_GATEWAY_CREDENTIAL_ENV,
    process.env.BOSS_C10_GITHUB_CREDENTIAL_ENV,
    ...Object.keys(process.env).filter((name) => /TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL/i.test(name))].filter(Boolean)
  const values = [...new Set(credentialNames.map((name) => process.env[name]).filter(Boolean))]
    .sort((left, right) => right.length - left.length)
  for (const value of values) message = message.split(value).join('[credential redacted]')
  message = message.replace(/Bearer\s+[^\s"',;]+/gi, 'Bearer [redacted]')
    .replace(/((?:token|password|secret|api[_-]?key|authorization)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, (value) => value
      .replace(/(https?:\/\/)[^/]*@/i, '$1[redacted]@').replace(/[?#].*/, '?[redacted]'))
  return { channel,
    code: /^[A-Z][A-Z0-9_]{0,100}$/.test(error?.code ?? '') ? error.code : 'UNAVAILABLE',
    message: message.slice(0,500) || '[no native message]' }
}
export async function waitFor(signal, read, code, timeout = 30000, interval = 250) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    const value = await read()
    if (value) return value
    await delay(interval, undefined, { signal })
  }
  requireFact(false, code)
}
export function gatewayEnvironment() {
  const credentialEnv = process.env.BOSS_C15_GATEWAY_CREDENTIAL_ENV
  requireFact(/^[A-Za-z_][A-Za-z0-9_]*$/.test(credentialEnv ?? ''), 'C15_CREDENTIAL_REFERENCE_REQUIRED')
  requireFact(process.env[credentialEnv]?.trim(), 'C15_CREDENTIAL_UNAVAILABLE')
  const value = {
    credentialEnv,
    endpoint: process.env.BOSS_C15_GATEWAY_ENDPOINT,
    alias: process.env.BOSS_C15_GATEWAY_ALIAS,
    providerId: process.env.BOSS_C15_GATEWAY_PROVIDER_ID,
    modelId: process.env.BOSS_C15_GATEWAY_MODEL_ID,
    ...(process.env.BOSS_C15_GATEWAY_PROVIDER_BASE_URL
      ? { providerBaseUrl: process.env.BOSS_C15_GATEWAY_PROVIDER_BASE_URL }
      : {})
  }
  requireFact(
    Object.values(value).every((item) => typeof item === 'string' && item.trim()),
    'C15_MODEL_IDENTITY_REQUIRED'
  )
  for (const endpoint of [value.endpoint, value.providerBaseUrl].filter(Boolean)) {
    const url = new URL(endpoint)
    requireFact(
      ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash,
      'C15_ENDPOINT_CREDENTIALS_FORBIDDEN'
    )
  }
  return value
}
