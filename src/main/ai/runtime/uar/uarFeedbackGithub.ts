import { randomUUID } from 'node:crypto'
import * as z from 'zod'

import type { UarFeedbackDetail } from '@shared/types/uarFeedback'

import { feedbackPayloadDigest, feedbackRequest, type FeedbackBinding, type FeedbackScope } from './uarFeedbackBoundary'

const githubOrigin = 'https://api.github.com'
const issueSchema = z.object({ number: z.number().int().positive(), title: z.string(), body: z.string().nullable(),
  pull_request: z.unknown().optional() })
const preparedSchema = z.object({
  effectId: z.string(), dispatchId: z.string(), provider: z.literal('github'), credentialRef: z.string(),
  origin: z.literal(githubOrigin), method: z.literal('POST'), path: z.string(),
  body: z.object({ title: z.string(), body: z.string() }).strict()
})

function headers(token: string) {
  return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'The-Boss-Feedback', 'Content-Type': 'application/json' }
}

export async function publishFeedbackIssue(
  scope: FeedbackScope, state: UarFeedbackDetail, binding: FeedbackBinding, token: string
): Promise<void> {
  const effect = state.effect
  const draft = state.intake.issueDraft
  if (!effect || !draft || effect.status !== 'prepared' || effect.target !== binding.target ||
    effect.payloadDigest !== draft.payloadDigest) throw new Error('FEEDBACK_DISPATCH_MISMATCH')
  const prepared = preparedSchema.parse(await feedbackRequest(scope,
    '/connector-effects/' + encodeURIComponent(effect.id) + '/dispatch', { credentialRef: binding.credentialRef }))
  if (prepared.effectId !== effect.id || prepared.credentialRef !== binding.credentialRef ||
    prepared.path !== `/repos/${draft.target}/issues` || feedbackPayloadDigest(prepared.body) !== effect.payloadDigest ||
    prepared.body.title !== draft.sanitizedIssue.title || prepared.body.body !== draft.sanitizedIssue.body) {
    throw new Error('FEEDBACK_DISPATCH_MISMATCH_RECONCILE_REQUIRED')
  }
  let disposition = 'uncertain'
  let externalId: string | null = null
  let evidenceRef = 'github-response-unavailable'
  try {
    // The durable dispatch is claimed once before this write; the transport never retries it.
    const response = await fetch(githubOrigin + prepared.path, {
      method: 'POST', redirect: 'manual', headers: headers(token), body: JSON.stringify(prepared.body)
    })
    evidenceRef = 'github-http-' + response.status
    if (response.status === 201) {
      const issue = issueSchema.parse(await response.json())
      if (issue.title === prepared.body.title && issue.body === prepared.body.body && !issue.pull_request) {
        disposition = 'confirmed'
        externalId = String(issue.number)
      }
    } else if ([400, 401, 403, 404, 410, 415, 422, 429].includes(response.status)) {
      disposition = 'rejected'
    }
  } catch {
    // A lost write response must remain uncertain, including malformed success receipts.
  }
  try {
    await feedbackRequest(scope, '/connector-effects/' + encodeURIComponent(effect.id) + '/outcome', {
      commandId: randomUUID(), dispatchId: prepared.dispatchId, disposition, externalId, evidenceRef, result: null
    })
  } catch {
    throw new Error('FEEDBACK_OUTCOME_UNRECORDED_RECONCILE_REQUIRED')
  }
}

export async function reconcileFeedbackIssue(
  scope: FeedbackScope, state: UarFeedbackDetail, token: string, commandId: string
): Promise<void> {
  const effect = state.effect
  const draft = state.intake.issueDraft
  if (!effect?.dispatchId || !draft || effect.target !== draft.target ||
    effect.payloadDigest !== feedbackPayloadDigest(draft.sanitizedIssue)) throw new Error('FEEDBACK_RECONCILIATION_MISMATCH')
  const marker = `<!-- prometheus-feedback-intake:${state.intake.id} -->`
  if (!draft.sanitizedIssue.body.includes(marker)) throw new Error('FEEDBACK_RECONCILIATION_MARKER_MISSING')
  let matched: number | undefined
  for (let page = 1; page <= 5; page += 1) {
    const query = new URLSearchParams({ state: 'all', sort: 'created', direction: 'desc', per_page: '100', page: String(page),
      since: effect.createdAt })
    const response = await fetch(`${githubOrigin}/repos/${draft.target}/issues?${query}`, {
      method: 'GET', redirect: 'manual', headers: headers(token)
    })
    if (!response.ok) throw new Error(`FEEDBACK_GITHUB_RECONCILIATION_HTTP_${response.status}`)
    const issues = z.array(issueSchema).parse(await response.json())
    const matches = issues.filter((issue) => !issue.pull_request && issue.title === draft.sanitizedIssue.title &&
      issue.body === draft.sanitizedIssue.body)
    if (matches.length > 1 || (matches.length === 1 && matched !== undefined)) {
      throw new Error('FEEDBACK_RECONCILIATION_MULTIPLE_MATCHES')
    }
    if (matches.length === 1) matched = matches[0].number
    if (issues.length < 100) break
  }
  // Absence in a bounded read cannot prove a write never happened; retain uncertainty.
  if (matched === undefined) return
  await feedbackRequest(scope, '/connector-effects/' + encodeURIComponent(effect.id) + '/reconcile', {
    commandId, dispatchId: effect.dispatchId, disposition: 'confirmed', externalId: String(matched),
    evidenceRef: `https://github.com/${draft.target}/issues/${matched}`, result: null
  })
}
