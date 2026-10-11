import { AsyncLocalStorage } from 'node:async_hooks'

import type { UarPreparedInvocation } from './UarHostToolAdmission'

/** Request-local identity from a consumed host admission; never model-supplied scope. */
export const admittedHostInvocation = new AsyncLocalStorage<UarPreparedInvocation | undefined>()
