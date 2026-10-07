import { digest, requireFact, route, waitFor } from './io.mjs'

const readOnlyInstructions =
  'Read only README.md. Return its exact delivery marker. Never write files or perform external effects.'
const roles = ['coordinator', 'product', 'designer', 'reviewer']
const id = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const keys = (value, required, optional = []) =>
  object(value) && required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every((key) => required.includes(key) || optional.includes(key))
const ids = (value, allowed) => Array.isArray(value) && value.length <= 16 &&
  new Set(value).size === value.length && value.every((item) => id(item) && allowed.has(item))
const identity = (left, right) => left?.id === right?.id && left?.version === right?.version && left?.digest === right?.digest

async function request(evaluate, name, input) {
  const result = await evaluate(`window.api.ipcApi.request(${JSON.stringify(route(name))},${JSON.stringify(input)})`)
  requireFact(result?.ok, 'C15_APPROVAL_SCOPE_READ_UNAVAILABLE')
  return result.data
}

function validate(approval, execution, team, initial, selector, artifacts) {
  requireFact(['team_delegate', 'team_send'].includes(approval.toolName), 'C15_APPROVAL_UNSUPPORTED_TOOL_REQUIRES_OPERATOR')
  requireFact(
    team && team.id === initial.id && team.workspaceId === selector.workspaceId && team.ownerId === initial.ownerId &&
    identity(team.definition, initial.definition) && identity(team.package, initial.package) &&
    team.binding.id === initial.binding.id && team.binding.revision === initial.binding.revision,
    'C15_APPROVAL_TEAM_SCOPE_CHANGED'
  )
  const members = new Map(team.members.filter((member) =>
    initial.members.some((prior) => prior.id === member.id && prior.role === member.role) &&
    roles.includes(member.role) && !['revoked', 'stopped', 'cancelled'].includes(member.status)
  ).map((member) => [member.id, member]))
  const attempt = execution.attempts.find((item) => item.id === approval.attemptId)
  requireFact(
    attempt && attempt.status === 'running' && attempt.runId === approval.runId &&
    attempt.ownerId === team.ownerId && attempt.workspaceId === team.workspaceId && attempt.teamId === team.id &&
    members.has(attempt.memberId) && team.tasks.some((task) => task.id === attempt.taskId) &&
    approval.admissionOwner === 'uar-runtime' &&
    [approval.approvalId, approval.attemptId, approval.runId, approval.toolCallId].every(id),
    'C15_APPROVAL_ATTEMPT_SCOPE_MISMATCH'
  )
  let envelope
  try { envelope = JSON.parse(approval.argumentsJson) } catch {
    requireFact(false, 'C15_APPROVAL_ARGUMENTS_INVALID')
  }
  requireFact(keys(envelope, ['operation', 'arguments']) && envelope.operation === approval.toolName,
    'C15_APPROVAL_NATIVE_ENVELOPE_MISMATCH')
  const args = envelope.arguments
  const permittedArtifacts = new Set(artifacts.filter((artifact) =>
    artifact.ownerId === team.ownerId && artifact.workspaceId === team.workspaceId && artifact.teamId === team.id &&
    members.has(artifact.memberId) && execution.attempts.some((item) =>
      item.id === artifact.attemptId && item.taskId === artifact.taskId && item.memberId === artifact.memberId)
  ).map((artifact) => artifact.id))
  requireFact(
    object(args) && id(args.commandId) && keys(args.payload, ['text', 'artifactIds']) &&
    typeof args.payload.text === 'string' && args.payload.text.length <= 8192 &&
    ids(args.payload.artifactIds, permittedArtifacts),
    'C15_APPROVAL_PAYLOAD_SCOPE_MISMATCH'
  )
  if (approval.toolName === 'team_send') {
    requireFact(
      keys(args, ['commandId', 'recipient', 'payload']) && keys(args.recipient, ['memberId'], ['taskId']) &&
      members.has(args.recipient.memberId) && args.recipient.memberId !== attempt.memberId &&
      (!Object.hasOwn(args.recipient, 'taskId') || team.tasks.some((task) =>
        task.id === args.recipient.taskId && task.assigneeMemberId === args.recipient.memberId)),
      'C15_APPROVAL_RECIPIENT_SCOPE_MISMATCH'
    )
    return
  }
  const recipient = members.get(args.recipientMemberId)
  requireFact(
    keys(args, ['commandId', 'recipientMemberId', 'expectedTeamRevision', 'task', 'payload', 'reservation']) &&
    members.get(attempt.memberId).role === 'coordinator' && recipient &&
    ['product', 'designer', 'reviewer'].includes(recipient.role) && args.expectedTeamRevision === team.revision &&
    keys(args.task, ['taskId', 'role', 'input', 'outputContract', 'dependsOn']) &&
    id(args.task.taskId) && !team.tasks.some((task) => task.id === args.task.taskId) &&
    args.task.role === recipient.role && object(args.task.outputContract) &&
    ids(args.task.dependsOn, new Set(team.tasks.map((task) => task.id))),
    'C15_APPROVAL_DELEGATION_SCOPE_MISMATCH'
  )
  const reservation = args.reservation
  requireFact(keys(reservation, ['tokens', 'costMicrounits', 'elapsedSeconds']) &&
    Object.values(reservation).every(Number.isSafeInteger) &&
    reservation.tokens > 0 && reservation.tokens <= execution.budget.maxTokens &&
    reservation.costMicrounits >= 0 && reservation.costMicrounits <= execution.budget.maxCostMicrounits &&
    reservation.elapsedSeconds > 0 && reservation.elapsedSeconds <= execution.budget.maxElapsedSeconds,
    'C15_APPROVAL_RESERVATION_EXCEEDS_SCENARIO_BUDGET')
}

export function mixedTeamApprovalOperator({ evaluate, signal, selector, instance, instructions }) {
  requireFact(instructions === readOnlyInstructions, 'C15_APPROVAL_READ_ONLY_CONTEXT_CHANGED')
  const evidence = { instructionSha256: digest(instructions), readOnly: true, approvals: [] }
  const handled = new Set()
  const read = () => request(evaluate, 'approvals', selector)
  return {
    evidence,
    async handle() {
      for (const approval of (await read()).approvals) {
        signal.throwIfAborted()
        const key = approval.attemptId + ':' + approval.approvalId
        requireFact(!handled.has(key), 'C15_APPROVAL_REMAINED_PENDING_AFTER_CLICK')
        requireFact(handled.size < 64, 'C15_APPROVAL_SCENARIO_LIMIT_REACHED')
        const execution = await request(evaluate, 'execution', selector)
        const team = (await request(evaluate, 'snapshot', { workspaceId: selector.workspaceId })).instances
          .find((item) => item.id === instance.id)
        const { artifacts } = await request(evaluate, 'artifacts', selector)
        validate(approval, execution, team, instance, selector, artifacts)
        const argumentsSha256 = digest(approval.argumentsJson)
        const latest = (await read()).approvals.find((item) => item.attemptId === approval.attemptId && item.approvalId === approval.approvalId)
        requireFact(latest && latest.eventId === approval.eventId && latest.cursor === approval.cursor &&
          latest.runId === approval.runId && latest.toolName === approval.toolName &&
          digest(latest.argumentsJson) === argumentsSha256, 'C15_APPROVAL_CHANGED_BEFORE_CLICK')
        await waitFor(signal, () => evaluate(`(async () => {
          const expected=${JSON.stringify({ approvalId: approval.approvalId, attemptId: approval.attemptId,
            runId: approval.runId, toolName: approval.toolName, argumentsSha256 })};
          const rows=[...document.querySelectorAll('li[data-approval-id][data-attempt-id][data-tool-name]')]
            .filter(row=>row.getClientRects().length && row.dataset.approvalId===expected.approvalId &&
              row.dataset.attemptId===expected.attemptId && row.dataset.runId===expected.runId && row.dataset.toolName===expected.toolName);
          if(rows.length!==1)return false;
          const row=rows[0], text=row.querySelector('pre')?.textContent;
          if(typeof text!=='string')return false;
          const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
          const hash=[...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');
          if(hash!==expected.argumentsSha256 || !row.isConnected || row.querySelector('pre')?.textContent!==text)return false;
          const buttons=[...row.querySelectorAll('button')].filter(button=>button.getClientRects().length &&
            button.innerText.trim()==='Allow once' && !button.disabled && button.getAttribute('aria-disabled')!=='true');
          if(buttons.length!==1)return false;
          buttons[0].scrollIntoView({block:'center'});buttons[0].focus();buttons[0].click();return true;
        })()`), 'C15_APPROVAL_VISIBLE_MATCHING_ROW_UNAVAILABLE', 15000)
        handled.add(key)
        const receipt = { approvalId: approval.approvalId, attemptId: approval.attemptId, runId: approval.runId,
          toolCallId: approval.toolCallId, toolName: approval.toolName, argumentsSha256, clickedAt: new Date().toISOString() }
        evidence.approvals.push(receipt)
        await waitFor(signal, async () => !(await read()).approvals.some((item) =>
          item.attemptId === approval.attemptId && item.approvalId === approval.approvalId),
        'C15_APPROVAL_NOT_RESOLVED_AFTER_CLICK', 15000)
        receipt.pendingClearedAt = new Date().toISOString()
      }
    }
  }
}
