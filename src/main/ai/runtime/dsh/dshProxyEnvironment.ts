import { application } from '@application'
import { mergeAgentLoopbackProxyBypass } from '@main/services/proxy/agentProxyEnvironment'
import { getProxyEnvironment } from '@main/services/proxy/proxyEnv'
import type { Model } from '@shared/data/types/model'
import type { Provider } from '@shared/data/types/provider'

import { usesDshGateway } from './modelInjection'

/** Gateway bypass hostname for the internal loopback route used by Agent traffic. */
export function dshGatewayBypassRule(provider: Provider, model: Model): string | undefined {
  if (!usesDshGateway(provider, model)) return undefined
  const origin = application.get('ApiGatewayService').getInternalGatewayOrigin()
  try {
    return origin ? new URL(origin).hostname : '127.0.0.1'
  } catch {
    return undefined
  }
}

/**
 * Exact proxy env materialized for the dsh child: the applied Settings proxy
 * plus loopback defaults plus the actual local-gateway hostname when
 * gateway-routed. Snapshot fingerprint and spawn env share this path so the
 * fingerprinted material and the spread material cannot disagree.
 */
export function buildDshProxyEnvironment(
  provider: Provider,
  model: Model,
  env: NodeJS.ProcessEnv = process.env
): Record<string, string | undefined> {
  const rule = dshGatewayBypassRule(provider, model)
  return mergeAgentLoopbackProxyBypass(
    getProxyEnvironment(env),
    rule === undefined ? {} : { additionalBypassRule: rule }
  )
}
