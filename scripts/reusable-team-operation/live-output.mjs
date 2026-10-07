import { digest, requireFact, waitFor } from './io.mjs'

const modelIdentity = (attempt) =>
  (attempt.effectiveModels ?? []).map((model) => ({
    providerId: model.route.providerId,
    modelId: model.route.modelId,
    wireModelAlias: model.wireModelAlias
  }))

export function liveOutputObserver(evaluate, selector, memberRoles) {
  const seen = {}
  const samples = []
  const evidence = {
    samples,
    retentionGapRecovery: {
      status: 'pending',
      reason: 'No real bounded-retention or reconnect gap induced by this operation.'
    },
    serialReaderAndTerminalStop: {
      status: 'pending',
      reason:
        'Existing IPC and DOM expose no successful-request concurrency or count telemetry; no bridge interception added.'
    }
  }
  return {
    evidence,
    async finish(attempts, signal) {
      evidence.savedAfterReload = await waitFor(
        signal,
        () => savedOutputVisible(evaluate, selector, attempts, memberRoles),
        'C15_REOPEN_SAVED_OUTPUT_NOT_VISIBLE'
      )
      requireFact(samples.length > 0, 'C15_PRETERMINAL_PUBLIC_MEMBER_OUTPUT_UNAVAILABLE')
      evidence.observedRoles = [...new Set(samples.map((sample) => sample.role))]
      evidence.preterminalRolesNotObserved = [...new Set(Object.values(memberRoles))].filter(
        (role) => role !== 'coordinator' && !evidence.observedRoles.includes(role)
      )
    },
    async capture(attempts) {
      const eligible = attempts
        .filter((attempt) => ['running', 'cancellation_requested'].includes(attempt.status) && attempt.output == null)
        .filter((attempt) => memberRoles[attempt.memberId] !== 'coordinator')
        .filter((attempt) => !samples.some((sample) => sample.attemptId === attempt.id))
        .map((attempt) => ({
          attemptId: attempt.id,
          runId: attempt.runId,
          memberId: attempt.memberId,
          role: memberRoles[attempt.memberId],
          models: modelIdentity(attempt)
        }))
      if (!eligible.length) return
      const observed = await evaluate(`(async () => {
        const scope=${JSON.stringify(selector)}, expected=${JSON.stringify(eligible)}, seen=${JSON.stringify(seen)};
        const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))))
          .map(byte=>byte.toString(16).padStart(2,'0')).join('');
        const run=[...document.querySelectorAll('[data-ui~="teams-run"]')]
          .find(node=>node.getClientRects().length&&node.getAttribute('data-team-id')===scope.teamInstanceId);
        if(!run)return [];
        const observed=[];
        for(const item of expected){
          const row=[...run.querySelectorAll('[data-ui~="teams-attempt"]')]
            .find(node=>node.getAttribute('data-attempt-id')===item.attemptId&&node.getAttribute('data-run-id')===item.runId&&
              node.getAttribute('data-member-id')===item.memberId&&['running','cancellation_requested'].includes(node.getAttribute('data-status')));
          const output=row?.querySelector('[data-ui~="teams-member-output"]');
          const text=output?.querySelector('[data-ui~="teams-output-text"][aria-live="polite"]');
          if(!text?.getClientRects().length||!text.textContent)continue;
          const displayed=text.textContent, textSha256=await sha(displayed);
          if(seen[item.attemptId]===textSha256)continue;
          const attributed=output.textContent.includes(item.role)&&output.textContent.includes(item.memberId)&&
            item.models.length>0&&item.models.every(model=>output.textContent.includes(model.providerId)&&output.textContent.includes(model.wireModelAlias));
          const observedAt=new Date().toISOString();
          const response=await window.api.ipcApi.request('prometheus.uar.teams.events',{...scope,attemptId:item.attemptId,after:0});
          const page=response?.ok?response.data:null;
          const correlated=page?.attemptId===item.attemptId&&page?.runId===item.runId&&page?.teamInstanceId===scope.teamInstanceId;
          const publicText=correlated?page.events.filter(event=>event.eventName==='agui.message.delta'&&event.data?.request_id===item.runId)
            .map(event=>typeof event.data?.delta?.text==='string'?event.data.delta.text:'').join(''):'';
          observed.push({...item,observedAt,textSha256,textBytes:new TextEncoder().encode(displayed).length,attributed,correlated,
            publicChatMatches:publicText.length>0&&publicText.startsWith(displayed),cursor:page?.cursor??null,gapReason:page?.gapReason??null});
        }
        return observed;
      })()`)
      for (const observation of observed) {
        seen[observation.attemptId] = observation.textSha256
        if (!observation.publicChatMatches) continue
        requireFact(observation.attributed && observation.correlated, 'C15_LIVE_OUTPUT_ATTRIBUTION_MISMATCH')
        samples.push(observation)
      }
    }
  }
}

async function savedOutputVisible(evaluate, selector, attempts, memberRoles) {
  const expected = attempts.map((attempt) => ({
    attemptId: attempt.id,
    runId: attempt.runId,
    memberId: attempt.memberId,
    role: memberRoles[attempt.memberId],
    models: modelIdentity(attempt),
    displaySha256: digest(typeof attempt.output === 'string' ? attempt.output : JSON.stringify(attempt.output, null, 2))
  }))
  return evaluate(`(async () => {
    const scope=${JSON.stringify(selector)},expected=${JSON.stringify(expected)};
    const run=[...document.querySelectorAll('[data-ui~="teams-run"]')]
      .find(node=>node.getClientRects().length&&node.getAttribute('data-team-id')===scope.teamInstanceId);
    if(!run)return false;
    const observed=[];
    for(const item of expected){
      const row=[...run.querySelectorAll('[data-ui~="teams-attempt"]')]
        .find(node=>node.getAttribute('data-attempt-id')===item.attemptId&&node.getAttribute('data-run-id')===item.runId&&node.getAttribute('data-member-id')===item.memberId);
      const output=row?.querySelector('[data-ui~="teams-member-output"]');
      const text=output?.querySelector('[data-ui~="teams-output-text"][aria-live="off"]');
      if(!text?.getClientRects().length)return false;
      const displaySha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text.textContent))))
        .map(byte=>byte.toString(16).padStart(2,'0')).join('');
      if(displaySha256!==item.displaySha256||!output.textContent.includes(item.role)||!output.textContent.includes(item.memberId)||
        !item.models.length||!item.models.every(model=>output.textContent.includes(model.providerId)&&output.textContent.includes(model.wireModelAlias)))return false;
      observed.push({...item,displaySha256,observedAt:new Date().toISOString()});
    }
    return observed;
  })()`)
}
