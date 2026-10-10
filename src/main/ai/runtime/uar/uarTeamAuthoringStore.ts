import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

import * as z from 'zod'

import { application } from '@application'
import { uarAuthoredTeamSchema, type UarAuthoredTeamRevision } from '@shared/types/uarTeams'

const identity = z.object({ id: z.string(), version: z.string(), digest: z.string() })
const recordSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().positive(),
  savedAt: z.string(),
  team: uarAuthoredTeamSchema,
  package: identity,
  definition: identity,
  compiled: z.object({ identity, definition: identity, manifest: z.string(), files: z.record(z.string(), z.string()) })
})
export type AuthoredTeamRecord = z.infer<typeof recordSchema>
const root = () => application.getPath('feature.prometheus.state', 'authored-teams')
const filename = (name: string) => application.getPath('feature.prometheus.state', 'authored-teams/' + name)

export function readAuthoredTeamRecords(): AuthoredTeamRecord[] {
  if (!existsSync(root())) return []
  return readdirSync(root())
    .filter((name) => /^[a-f0-9-]+\.\d+\.json$/.test(name))
    .map((name) => recordSchema.parse(JSON.parse(readFileSync(filename(name), 'utf8'))))
    .sort((left, right) => right.revision - left.revision || right.savedAt.localeCompare(left.savedAt))
}

export function projectAuthoredTeam(record: AuthoredTeamRecord): UarAuthoredTeamRevision {
  const { compiled: _compiled, ...snapshot } = record
  return snapshot
}

export function saveAuthoredTeamRecord(record: AuthoredTeamRecord, expectedRevision: number): void {
  const current = readAuthoredTeamRecords().find((item) => item.team.id === record.team.id)
  if ((current?.revision ?? 0) !== expectedRevision) throw new Error('TEAM_REVISION_CONFLICT')
  mkdirSync(root(), { recursive: true, mode: 0o700 })
  const target = filename(record.team.id + '.' + record.revision + '.json')
  const pending = filename(randomUUID() + '.pending')
  writeFileSync(pending, JSON.stringify(recordSchema.parse(record)), { flag: 'wx', mode: 0o600 })
  renameSync(pending, target)
}
