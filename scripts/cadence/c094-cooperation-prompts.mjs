import { randomUUID } from 'node:crypto'

export const marker = (label) => `C094_${label}_${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`

/** The model must issue these calls itself through the actual native tool assembly. */
export function cooperationPlan(
  fixture,
  outcomes,
  budget,
  { duplicate = false, cycle = false, send = true, restart = false } = {}
) {
  const final = marker('FINAL')
  const count = outcomes.length
  const share = count + 2
  const reservation = (tokens, elapsedSeconds) => ({
    tokens,
    costMicrounits: Math.floor(budget.maxCostMicrounits / share),
    elapsedSeconds
  })
  const workerTokens = count === 1 ? 4000 : 3000
  const initial = reservation(count === 1 ? 8000 : 6000, count === 1 ? 100 : 90)
  const continuation = reservation(count === 1 ? 4000 : 3000, count === 1 ? 100 : 90)
  const targets = outcomes.map((outcome, index) => {
    const output = marker('WORKER')
    const sendArgs = {
      commandId: randomUUID(),
      recipient: { memberId: fixture.coordinatorId },
      payload: { text: `Worker ${index + 1} completed its assigned preparation.`, artifactIds: [] }
    }
    const instruction =
      outcome === 'cancelled'
        ? `${restart ? `First call team_send with exactly ${JSON.stringify(sendArgs)}. ` : ''}Write 300 detailed numbered paragraphs; do not use any other tools. The owner will cancel this bounded task.`
        : `${send ? `First call team_send with exactly ${JSON.stringify(sendArgs)}. ` : ''}Then reply with exactly ${output}, no quotes or markup, and do not call any other tool.`
    const taskId = randomUUID()
    return {
      taskId,
      outcome,
      output,
      args: {
        commandId: randomUUID(),
        recipientMemberId: fixture.workerIds[index],
        expectedTeamRevision: '$HOST_TEAM_REVISION',
        task: {
          taskId,
          role: 'worker',
          input: { instruction },
          outputContract: outcome === 'failed' ? { type: 'string', not: {} } : { type: 'string', const: output },
          dependsOn: cycle ? ['$CURRENT_TASK_ID'] : []
        },
        payload: { text: `Perform your explicitly assigned worker task ${index + 1}.`, artifactIds: [] },
        reservation: reservation(workerTokens, count === 1 ? 75 : 60)
      }
    }
  })
  const waitArgs = {
    commandId: randomUUID(),
    targetTaskIds: targets.map((target) => target.taskId),
    predicate: 'all-terminal',
    continuationInput: {
      text: 'Use the actual ordered terminal target outcomes to complete the original assignment.',
      artifactIds: []
    },
    continuationReservation: continuation
  }
  const instruction = [
    `This is a bounded cooperation task. Read host-selected targetOutcomes first. If it is nonempty, require exactly these ordered outcomes: ${JSON.stringify(outcomes)}. Then reply with exactly ${final}; never delegate or wait again.`,
    'If targetOutcomes is empty, call team_roster with {"limit":50}; use the authorized worker IDs, and do not invent sender or root identity.',
    `Use the host-selected assignment.teamRevision as the first expectedTeamRevision. For each accepted delegate increase that revision by exactly one. Replace $CURRENT_TASK_ID with your host-selected assignment.taskId.`,
    ...targets.map(
      (target, index) =>
        `Call team_delegate ${index + 1} with ${JSON.stringify(target.args)}, replacing $HOST_TEAM_REVISION with that numeric revision. ${duplicate && index === 0 ? 'Immediately call team_delegate again with exactly the SAME arguments and commandId; require the same queuedAttemptId. Do not increment the revision for that replay.' : ''}`
    ),
    `Then call team_wait with exactly ${JSON.stringify(waitArgs)}. This yields your turn. Do not return a final answer, call more tools, or invent terminal outcomes before the host resumes you.`,
    ...(cycle
      ? [
          `For this explicit cycle-refusal case only, the delegated task depends on your current task. team_wait must refuse that cycle; after the refusal reply exactly ${final}.`
        ]
      : [])
  ].join('\n')
  return { final, targets, waitArgs, initial, instruction, duplicate, send, restart }
}

export function deniedPlan(recipientMemberId, budget) {
  const final = marker('DENIED')
  const args = {
    commandId: randomUUID(),
    recipientMemberId,
    expectedTeamRevision: '$HOST_TEAM_REVISION',
    task: {
      taskId: randomUUID(),
      role: 'worker',
      input: { instruction: 'Reply with a bounded marker.' },
      outputContract: { type: 'string' },
      dependsOn: []
    },
    payload: { text: 'Explicit refusal exercise.', artifactIds: [] },
    reservation: {
      tokens: 4000,
      costMicrounits: Math.floor(budget.maxCostMicrounits / 3),
      elapsedSeconds: Math.floor(budget.maxElapsedSeconds / 3)
    }
  }
  return {
    final,
    args,
    initial: { ...args.reservation, tokens: 6000 },
    instruction: `Call team_roster with {"limit":50}. Then call team_delegate once with ${JSON.stringify(args)}, replacing $HOST_TEAM_REVISION with host assignment.teamRevision. This is an explicitly selected denial exercise: expect the runtime to refuse the edge/recipient. Never retry, use another recipient, or wait. After the refusal reply exactly ${final}, without quotes or markup.`
  }
}
