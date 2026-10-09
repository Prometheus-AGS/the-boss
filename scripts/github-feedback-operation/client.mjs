import fs from 'node:fs'
import path from 'node:path'

import { requireFact } from '../reusable-team-operation/io.mjs'

export async function attach(launch, signal) {
  requireFact(launch.status === 'success' && launch.keptOpen && Number.isInteger(launch.pid),
    'C10_RETAINED_APP_REQUIRED')
  process.kill(launch.pid, 0)
  const port = Number(fs.readFileSync(path.join(launch.isolatedUserData, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0])
  requireFact(Number.isInteger(port) && port > 0 && port <= 65535, 'C10_RETAINED_DEBUG_PORT_REQUIRED')
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal })
  requireFact(response.ok, 'C10_RETAINED_TARGET_UNAVAILABLE')
  const targets = await response.json()
  const target = targets.find((item) => item.type === 'page' && item.url.includes('/windows/main/index.html') &&
    !/^https?:/i.test(item.url) && item.webSocketDebuggerUrl)
  requireFact(target, 'C10_PACKAGED_MAIN_TARGET_REQUIRED')
  const url = new URL(target.webSocketDebuggerUrl)
  requireFact(url.protocol === 'ws:' && ['127.0.0.1', 'localhost'].includes(url.hostname),
    'C10_LOCAL_DEBUG_BOUNDARY_REQUIRED')
  const socket = new WebSocket(url.href)
  const pending = new Map()
  let next = 1
  const fail = () => {
    for (const waiter of pending.values()) waiter.reject(Object.assign(new Error('C10_RENDERER_CONNECTION_UNAVAILABLE'),
      { code: 'C10_RENDERER_CONNECTION_UNAVAILABLE' }))
    pending.clear()
  }
  const abort = () => { fail(); socket.close() }
  signal.addEventListener('abort', abort, { once: true })
  socket.addEventListener('close', () => { fail(); signal.removeEventListener('abort', abort) })
  socket.addEventListener('error', fail)
  socket.addEventListener('message', (message) => {
    const value = JSON.parse(String(message.data))
    const waiter = pending.get(value.id)
    if (!waiter) return
    pending.delete(value.id)
    if (value.error || value.result?.exceptionDetails) waiter.reject(Object.assign(
      new Error('C10_RENDERER_EVALUATION_UNAVAILABLE'), { code: 'C10_RENDERER_EVALUATION_UNAVAILABLE' }))
    else waiter.resolve(value.result?.result?.value)
  })
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(Object.assign(new Error('C10_RENDERER_CONNECTION_UNAVAILABLE'),
      { code: 'C10_RENDERER_CONNECTION_UNAVAILABLE' })), { once: true })
    signal.addEventListener('abort', () => reject(Object.assign(new Error('C10_OPERATION_CANCELLED'),
      { code: 'C10_OPERATION_CANCELLED' })), { once: true })
  })
  return {
    targets,
    evaluate(expression) {
      signal.throwIfAborted()
      const id = next++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        socket.send(JSON.stringify({ id, method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true } }))
      })
    },
    close() { socket.close() }
  }
}
