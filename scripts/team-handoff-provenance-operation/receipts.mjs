const pick = (value, keys) => Object.fromEntries(keys.map((key) => [key, value?.[key] ?? null]))
const file = (value) => pick(value, ['path', 'observation', 'bytes', 'sha256'])
const identity = (value) => value ? pick(value, ['projectId', 'runId', 'phaseId', 'changeId', 'taskId']) : null
const canonical = (value) => ({ ...pick(value, ['path', 'observation', 'revision', 'eventId', 'taskStatus', 'receiptSha256', 'reason']),
  identity: identity(value?.identity) })
const memory = (value) => ({ ...pick(value, ['id', 'status', 'observation', 'projectId', 'teamId', 'scope', 'contentSha256', 'provenanceSha256']),
  kbd: identity(value?.kbd), publication: value?.publication ? pick(value.publication,
    ['outcome', 'publicationKey', 'remoteIdSha256', 'receiptSha256', 'uncertain']) : null })
const provenance = (value) => value ? ({ schemaVersion: value.schemaVersion, capturedAt: value.capturedAt,
  canonical: canonical(value.canonical), sources: value.sources.map(file), evidence: value.evidence.map(file),
  karpathy: value.karpathy.map(file), memory: value.memory.map(memory) }) : null
const rows = (values, project) => values.map((value) => ({ captured: project(value.captured),
  current: project(value.current), comparison: value.comparison }))

export const ownership = (value) => pick(value, ['owner', 'harness', 'revision', 'acceptedAt', 'stale'])
export function inspection(value) {
  return { ...pick(value, ['id', 'taskId', 'taskRevision', 'legacy']), ownership: ownership(value.ownership),
    captured: provenance(value.captured), current: value.current ? {
      sources: rows(value.current.sources, file), evidence: rows(value.current.evidence, file),
      karpathy: rows(value.current.karpathy, file), memory: rows(value.current.memory, memory),
      canonical: { captured: canonical(value.current.canonical.captured), current: canonical(value.current.canonical.current),
        comparison: value.current.canonical.comparison } } : null }
}

export const packetIdentity = (value) => ({ ...pick(value, ['schemaVersion', 'id', 'taskId', 'taskRevision', 'createdAt', 'acceptedAt']),
  from: pick(value.from, ['owner', 'harness']), to: pick(value.to, ['owner', 'harness']),
  git: pick(value.git, ['root', 'head', 'branch', 'dirty']) })
