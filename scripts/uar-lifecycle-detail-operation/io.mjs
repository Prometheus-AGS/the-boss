export { digest, write, same, gatewayEnvironment } from '../approval-lifecycle-operation/io.mjs'

export function requireFact(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code })
}
