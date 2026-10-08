import { randomUUID } from 'node:crypto';

const kinds = new Set(['planning', 'implementation', 'coordination', 'rework', 'resource-wait', 'human-wait']);
const fail = message => { throw new Error(message); };

/** Explicit observations only. The engine owns locking, persistence and command idempotency. */
export function handleActivity(iteration, action, input = {}) {
  iteration.activities ??= [];
  if (action === 'status') return { activities: iteration.activities, open: iteration.activities.filter(item => !item.finishedAt) };
  if (iteration.finishedAt) fail('Activity recording requires an unfinished iteration');
  if (action === 'start') {
    if (!kinds.has(input.kind)) fail('Unknown activity kind');
    if (typeof input.actor !== 'string' || !input.actor.trim()) fail('Activity needs an explicit actor');
    if (input.childId !== undefined && input.childId !== null && typeof input.childId !== 'string') fail('Activity childId must be a string');
    const startedAt = input.startedAt ?? new Date().toISOString();
    const start = Date.parse(startedAt);
    if (!Number.isFinite(start) || start < Date.parse(iteration.startedAt) || start > Date.now()) fail('Activity start must fall within the recorded iteration');
    const id = input.id ?? randomUUID();
    if (iteration.activities.some(item => item.id === id)) fail('Activity ID already exists; retry with the original command ID');
    if (iteration.activities.some(item => item.actor === input.actor && !item.finishedAt)) fail('Stop the actor’s open activity before starting another');
    const activity = { id, kind: input.kind, actor: input.actor, childId: input.childId ?? null, startedAt, ...(input.note ? { note: input.note } : {}) };
    iteration.activities.push(activity);
    return activity;
  }
  if (action === 'stop') {
    const activity = iteration.activities.find(item => item.id === (input.id ?? input.activityId));
    if (!activity) fail('Unknown activity ID');
    if (activity.finishedAt) fail('Activity already stopped; retry with the original command ID');
    const finishedAt = input.finishedAt ?? new Date().toISOString();
    const end = Date.parse(finishedAt);
    if (!Number.isFinite(end) || end < Date.parse(activity.startedAt) || end > Date.now()) fail('Activity finish must follow its start and not be in the future');
    activity.finishedAt = finishedAt;
    iteration.spans ??= [];
    iteration.spans.push({ ...activity });
    return activity;
  }
  fail('Unknown activity action; use start, stop or status');
}
