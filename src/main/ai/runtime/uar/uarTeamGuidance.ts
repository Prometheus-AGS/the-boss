import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

import { application } from '@application'
import { toAsarUnpackedPath } from '@main/utils/asar'
import { uarGuideResultSchema, type UarReviewedGuidance } from '@shared/types/uarTeamGuidance'

import { assertUarTeamArtifactCredentialFree } from './uarTeamReviewedModelPolicy'

const digest = (value: string) => 'sha256:' + createHash('sha256').update(value).digest('hex')

async function readGuidance(source: string) {
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    throw new Error('UAR_TEAM_GUIDANCE_RESULT_INVALID')
  }
  await assertUarTeamArtifactCredentialFree(raw)
  const result = uarGuideResultSchema.safeParse(raw)
  if (!result.success) throw new Error('UAR_TEAM_GUIDANCE_RESULT_INVALID')
  if (result.data.team) {
    const url = pathToFileURL(
      toAsarUnpackedPath(
        application.getPath('feature.prometheus.pack.builtin', 'skills/agent-team-creator/scripts/validation.mjs')
      )
    ).href
    const creator = (await import(/* @vite-ignore */ url)) as { validateTeam(value: unknown): unknown }
    try {
      creator.validateTeam(result.data.team)
    } catch {
      throw new Error('UAR_TEAM_GUIDANCE_RESULT_INVALID')
    }
  }
  return result.data
}

export async function reviewUarTeamGuidance(source: string): Promise<UarReviewedGuidance> {
  const result = await readGuidance(source)
  return {
    schemaVersion: 1,
    source: 'agent-team-creator/guide',
    sourceJson: source,
    sourceDigest: digest(source),
    digest: digest(JSON.stringify(result)),
    result
  }
}

export async function assertUarTeamGuidance(value: UarReviewedGuidance) {
  const result = await readGuidance(value.sourceJson)
  if (
    value.sourceDigest !== digest(value.sourceJson) ||
    value.digest !== digest(JSON.stringify(result)) ||
    value.digest !== digest(JSON.stringify(value.result))
  )
    throw new Error('UAR_TEAM_GUIDANCE_IDENTITY_MISMATCH')
}
