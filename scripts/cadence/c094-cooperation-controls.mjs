import { ipc, waitFor } from './uar-team-operation-tools.mjs'

export async function controls(evaluate, signal, fixture, completed) {
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {
    const later=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Set up later');
    if(later)later.click();return Boolean(document.querySelector('#app-sidebar'));
  })()`),
    'C094 packaged onboarding'
  )
  await ipc(evaluate, 'navigation.open_route_in_main', { path: '/settings/uar?panel=teams' })
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {
    const button=document.querySelector('button[aria-label="Workspace"]');
    if(!button)return false;button.click();return true;
  })()`),
    'C094 workspace selector'
  )
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {
    const option=[...document.querySelectorAll('[role="option"]')].find(e=>e.innerText.includes('Cadence C094 success'));
    if(!option)return false;option.click();return true;
  })()`),
    'C094 operated workspace'
  )
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {
    const button=document.querySelector('button[aria-label="Choose a team instance"]');
    if(!button)return false;button.click();return true;
  })()`),
    'C094 team selector'
  )
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {
    const option=[...document.querySelectorAll('[role="option"]')].find(e=>e.innerText.includes(${JSON.stringify(fixture.teamInstanceId)}));
    if(!option)return false;option.click();return true;
  })()`),
    'C094 operated team'
  )
  await waitFor(
    signal,
    () =>
      evaluate(`['uar-team-context','uar-team-peer-messages','uar-team-waits']
    .every(id=>Boolean(document.querySelector('[data-ui="'+id+'"]')))`),
    'C094 context, messages and waits controls'
  )
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {
    const context=[...document.querySelectorAll('[data-ui="uar-team-context"]')]
      .find(node=>node.closest('li')?.innerText.includes(${JSON.stringify(completed.exact.resumed.runId)}));
    const button=context?.querySelector('button');
    if(!button||button.disabled)return false;button.click();return true;
  })()`),
    'C094 inspect actual resumed context'
  )
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {
    const context=[...document.querySelectorAll('[data-ui="uar-team-context"]')]
      .find(node=>node.closest('li')?.innerText.includes(${JSON.stringify(completed.exact.resumed.runId)}));
    return context?.innerText.includes(${JSON.stringify(completed.exact.resumed.rootId)}) &&
      context.innerText.includes(${JSON.stringify(fixture.instructions.digest)}) &&
      context.innerText.includes(${JSON.stringify(fixture.coordinatorId)});
  })()`),
    'C094 rendered immutable context provenance'
  )
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {
    const messages=document.querySelector('[data-ui="uar-team-peer-messages"]');
    const waits=document.querySelector('[data-ui="uar-team-waits"]');
    return messages?.innerText.includes('Consumed') &&
      waits?.innerText.includes(${JSON.stringify(completed.exact.wait.waitId)}) &&
      waits.innerText.includes(${JSON.stringify(completed.exact.resumed.rootId)});
  })()`),
    'C094 consumed messages and linked fresh continuation in UI'
  )
}
