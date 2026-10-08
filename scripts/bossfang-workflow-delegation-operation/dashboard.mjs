import { ipc, requireFact, waitFor } from './io.mjs'

export async function click(evaluate, signal, selector) {
  return waitFor(signal, () => evaluate(`(() => {
    const node=[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>item.getClientRects().length);
    if(!node || node.disabled || node.getAttribute('aria-disabled')==='true')return false;
    node.scrollIntoView({block:'center'});node.focus();node.click();return true;
  })()`), 'C14W_VISIBLE_DASHBOARD_CONTROL_UNAVAILABLE')
}

export async function fill(evaluate, signal, selector, value) {
  return waitFor(signal, () => evaluate(`(() => {
    const node=[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>item.getClientRects().length);
    if(!node || node.disabled)return false;
    const prototype=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,${JSON.stringify(value)});
    node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));return true;
  })()`), 'C14W_VISIBLE_DASHBOARD_INPUT_UNAVAILABLE')
}

export function guestEvaluate(evaluate, origin) {
  return (expression) => evaluate(`(async()=>{
    const guest=[...document.querySelectorAll('webview[data-mini-app-id="bossfang-dashboard"]')]
      .find(node=>node.getClientRects().length);
    if(!guest || guest.getAttribute('partition')!=='persist:bossfang-dashboard' ||
      new URL(guest.getURL()).origin!==${JSON.stringify(origin)})throw new Error('C14W_ISOLATED_GUEST_UNAVAILABLE');
    return guest.executeJavaScript(${JSON.stringify(expression)});
  })()`)
}

export async function openDashboard(evaluate, signal) {
  await ipc(evaluate, 'navigation.open_route_in_main', { path: '/app/launchpad' })
  await click(evaluate, signal, '[data-ui~="bossfang-app"]')
  const registered = await evaluate("Boolean(customElements.get('webview'))")
  if (!registered) {
    await waitFor(signal, () => evaluate(`(() => {
      const button=[...document.querySelectorAll('[data-confirm-popup="true"] button')]
        .find(node=>node.getClientRects().length && node.innerText.trim()==='Reload window');
      if(!button || button.disabled)return false;button.click();return true;
    })()`), 'C14W_NATIVE_GUEST_RELOAD_RECOVERY_UNAVAILABLE')
    await waitFor(signal, () => evaluate("Boolean(customElements.get('webview'))").catch(() => false),
      'C14W_NATIVE_GUEST_REGISTRATION_UNAVAILABLE')
    await ipc(evaluate, 'navigation.open_route_in_main', { path: '/app/launchpad' })
    await click(evaluate, signal, '[data-ui~="bossfang-app"]')
  }
  const status = await ipc(evaluate, 'bossfang.status')
  requireFact(status.ownership === 'managed' && status.status === 'running' && status.effective?.origin,
    'C14W_OWNED_DASHBOARD_UNAVAILABLE')
  const ready = await waitFor(signal, () => evaluate(`(() => {
    const guest=[...document.querySelectorAll('webview[data-mini-app-id="bossfang-dashboard"]')]
      .find(node=>node.getClientRects().length);
    if(!guest)return false;
    if(guest.getAttribute('partition')!=='persist:bossfang-dashboard')return {isolated:false};
    let url;
    // Initial attachment has a visible element before Electron exposes its URL.
    try { url=guest.getURL();if(!url||guest.isLoading())return false; }
    catch { return false; }
    return {isolated:new URL(url).origin===${JSON.stringify(status.effective.origin)}};
  })()`), 'C14W_DASHBOARD_GUEST_ATTACHMENT_UNAVAILABLE', 60000)
  requireFact(ready.isolated, 'C14W_ISOLATED_GUEST_UNAVAILABLE')
  const guest = guestEvaluate(evaluate, status.effective.origin)
  const authenticated = await waitFor(signal, () => guest(`(async()=>{
    const response=await fetch('/api/authz/whoami',{credentials:'include',redirect:'error',
      headers:{Authorization:'Bearer '+(sessionStorage.getItem('bossfang-api-key')||'')}});
    return response.status===200 && !document.querySelector('#auth-dialog-title') &&
      Boolean(document.querySelector('nav')) && {status:response.status,hostIpcExposed:Boolean(window.api?.ipcApi)};
  })()`), 'C14W_AUTHENTICATED_COMPILED_DASHBOARD_UNAVAILABLE', 60000)
  requireFact(!authenticated.hostIpcExposed, 'C14W_GUEST_EXPOSED_HOST_IPC')
  return { guest, authentication: authenticated, registrationRecoveryRequired: !registered }
}

export async function request(guest, method, path, body) {
  const result = await guest(`(async()=>{
    const response=await fetch(${JSON.stringify(path)},{method:${JSON.stringify(method)},credentials:'include',
      redirect:'error',headers:{Authorization:'Bearer '+(sessionStorage.getItem('bossfang-api-key')||''),
      'Content-Type':'application/json'},${body === undefined ? '' : 'body:' + JSON.stringify(JSON.stringify(body)) + ','}});
    const value=await response.json();
    return response.ok?{ok:true,data:value}:{ok:false,status:response.status,
      code:typeof value.code==='string'&&/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(value.code)?value.code:null};
  })()`)
  if (!result.ok) throw Object.assign(new Error('C14W_NATIVE_DASHBOARD_REQUEST_REFUSED'), {
    code: 'C14W_NATIVE_DASHBOARD_REQUEST_REFUSED', method, path, status: result.status, nativeCode: result.code
  })
  return result.data
}
