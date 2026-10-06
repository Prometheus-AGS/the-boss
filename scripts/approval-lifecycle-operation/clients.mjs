import { randomUUID } from 'node:crypto'

import { requireFact, waitFor } from './io.mjs'

export async function ipc(evaluate, name, input) {
  const result = await evaluate(`window.api.ipcApi.request(${JSON.stringify(name)},${JSON.stringify(input)})`)
  requireFact(result?.ok, 'C142_APPLICATION_API_REFUSED')
  return result.data
}
export const workRoute = (selector) => '/app/agents?' + new URLSearchParams({ mode: 'teams', ...selector })
export async function click(evaluate, signal, selector) {
  await waitFor(signal, () => evaluate(`(() => {
    const node=[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>item.getClientRects().length);
    if(!node || node.disabled || node.getAttribute('aria-disabled')==='true')return false;
    node.scrollIntoView({block:'center'});node.focus();node.click();return true;
  })()`), 'C142_VISIBLE_CONTROL_UNAVAILABLE')
}
export async function fill(evaluate, signal, selector, value) {
  await waitFor(signal, () => evaluate(`(() => {
    const node=document.querySelector(${JSON.stringify(selector)});if(!node || node.disabled)return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,${JSON.stringify(value)});
    node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));return true;
  })()`), 'C142_VISIBLE_INPUT_UNAVAILABLE')
}
export async function visibleRecord(evaluate, signal, record) {
  return waitFor(signal, () => evaluate(`(() => {
    const node=[...document.querySelectorAll('[data-ui~="teams-approval-record"]')].find(item=>
      item.getClientRects().length&&item.dataset.issuerId===${JSON.stringify(record.issuerId)}&&
      item.dataset.challengeId===${JSON.stringify(record.challengeId)});
    return node ? {issuerId:node.dataset.issuerId,challengeId:node.dataset.challengeId,state:node.dataset.state,
      decisionId:node.dataset.decisionId,actor:node.dataset.decisionActor,durable:node.dataset.durable}:false;
  })()`), 'C142_CANONICAL_RECORD_NOT_VISIBLE')
}
function connect(url, signal) {
  const endpoint = new URL(url)
  requireFact(['127.0.0.1', 'localhost'].includes(endpoint.hostname), 'C142_LOCAL_CDP_REQUIRED')
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint)
    const pending = new Map()
    let sequence = 0
    const fail = () => {
      for (const request of pending.values()) request.reject(new Error('C142_CLIENT_DISCONNECTED'))
      pending.clear()
    }
    const abort = () => { fail(); socket.close(); reject(new Error('C142_CLIENT_CANCELLED')) }
    signal.addEventListener('abort', abort, { once: true })
    socket.addEventListener('error', () => { fail(); reject(new Error('C142_CLIENT_UNAVAILABLE')) })
    socket.addEventListener('close', () => { signal.removeEventListener('abort', abort); fail() })
    socket.addEventListener('message', (event) => {
      const value = JSON.parse(String(event.data))
      const request = pending.get(value.id)
      if (!request) return
      pending.delete(value.id)
      if (value.error || value.result?.exceptionDetails) request.reject(new Error('C142_CLIENT_EVALUATION_FAILED'))
      else request.resolve(value.result?.result?.value)
    })
    socket.addEventListener('open', () => resolve({
      evaluate(expression) {
        signal.throwIfAborted()
        const id = ++sequence
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject })
          socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
        })
      },
      close() { socket.close() }
    }))
  })
}
export async function secondClient(evaluate, signal, targets, selector) {
  const primary = targets.find((target) => target.type === 'page' && target.url.includes('/windows/main/index.html'))
  requireFact(primary?.webSocketDebuggerUrl && !/^https?:/i.test(primary.url), 'C142_PACKAGED_MAIN_REQUIRED')
  const endpoint = new URL(primary.webSocketDebuggerUrl)
  const origin = 'http://' + endpoint.host
  const clients = new Map()
  let chosen
  try {
    await ipc(evaluate, 'tab.detach', { id: randomUUID(), url: workRoute(selector), title: 'Approval lifecycle', type: 'route' })
    chosen = await waitFor(signal, async () => {
      const pages = await fetch(origin + '/json/list', { signal }).then((result) => result.json())
      for (const target of pages.filter((item) => item.type === 'page' && item.id !== primary.id && item.url.includes('/windows/subWindow/index.html'))) {
        let client = clients.get(target.id)
        if (!client) { client = await connect(target.webSocketDebuggerUrl, signal); clients.set(target.id, client) }
        const matched = await client.evaluate(`Boolean([...document.querySelectorAll('[data-ui~="teams-run"]')]
          .find(node=>node.getClientRects().length&&node.dataset.teamId===${JSON.stringify(selector.teamInstanceId)}))`)
        if (matched) return { ...client, targetId: target.id, primaryTargetId: primary.id }
      }
      return false
    }, 'C142_DISTINCT_PACKAGED_CLIENT_UNAVAILABLE')
    return chosen
  } finally {
    for (const [id, client] of clients) if (id !== chosen?.targetId) client.close()
  }
}
