import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button, Checkbox } from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { ipcApi } from '@renderer/ipc'
import type { UarFeedbackDetail } from '@shared/types/uarFeedback'
import type { UarFeedbackPolicy, UarFeedbackPolicySaveInput } from '@shared/types/uarFeedbackPolicy'

import { IntegrationChoice, IntegrationField } from './IntegrationFields'

type Snapshot = Awaited<ReturnType<typeof ipcApi.request<'prometheus.uar.feedback.snapshot'>>>
type Bindings = Awaited<ReturnType<typeof ipcApi.request<'prometheus.uar.connectors.snapshot'>>>['bindings']
type Role = 'product' | 'design' | 'reviewer'
const roles: Role[] = ['product', 'design', 'reviewer']

export function UarFeedbackGovernancePanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`settings.prometheus.integration.uarAdmin.governance.${key}`)
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [bindings, setBindings] = useState<Bindings>([])
  const [policies, setPolicies] = useState<UarFeedbackPolicy[]>([])
  const [policyId, setPolicyId] = useState('new')
  const [source, setSource] = useState<UarFeedbackPolicySaveInput['source']>('direct')
  const [bindingId, setBindingId] = useState('')
  const [egressLabel, setEgressLabel] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [intakeId, setIntakeId] = useState('')
  const [detail, setDetail] = useState<UarFeedbackDetail>()
  const [reviewIds, setReviewIds] = useState<Record<Role, string>>({ product: '', design: '', reviewer: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const policy = policies.find((item) => item.id === policyId)
  const eligibleBindings = bindings.filter((item) => item.provider === 'github' && item.approvalMode === 'standing_policy' && !item.revoked)
  const selectedBinding = eligibleBindings.find((item) => item.id === bindingId)
  const parsedArtifacts = detail?.intake.issueDraft ? Array.from(new Set([
    detail.intake.issueDraft.artifactId, ...roles.map((role) => detail.intake.reviewArtifacts[role])
  ].filter((value): value is string => Boolean(value)))) : []
  const reviewComplete = roles.every((role) => detail?.intake.reviewArtifacts[role])
  const policyBinding = bindings.find((item) => item.id === policy?.connectorBindingId)
  const policyMatches = Boolean(policy?.enabled && detail && policyBinding && !policyBinding.revoked &&
    detail.workflow && ['ready', 'awaiting_decision'].includes(detail.workflow.status) &&
    policyBinding.approvalMode === 'standing_policy' && policy.source === detail.intake.source &&
    (!detail.intake.requestedTarget || policyBinding.target === detail.intake.requestedTarget) &&
    (!detail.intake.issueDraft || (policy.connectorBindingId === detail.intake.issueDraft.connectorBindingId &&
      policy.egressLabel === detail.intake.issueDraft.egressLabel)))

  const load = useCallback(async () => {
    setBusy(true)
    setError(undefined)
    try {
      const [feedback, nextPolicies, connectors] = await Promise.all([
        ipcApi.request('prometheus.uar.feedback.snapshot', { workspaceId }),
        ipcApi.request('prometheus.uar.feedback.policies', { workspaceId }),
        ipcApi.request('prometheus.uar.connectors.snapshot', { workspaceId })
      ])
      setSnapshot(feedback)
      setPolicies(nextPolicies)
      setBindings(connectors.bindings)
      if (intakeId) setDetail(await ipcApi.request('prometheus.uar.feedback.read', { workspaceId, intakeId }))
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }, [workspaceId, intakeId])
  useEffect(() => { void load() }, [load])

  const selectPolicy = (value: string) => {
    const selected = policies.find((item) => item.id === value)
    setPolicyId(value)
    setSource(selected?.source ?? 'direct')
    setBindingId(selected?.connectorBindingId ?? '')
    setEgressLabel(selected?.egressLabel ?? '')
    setEnabled(selected?.enabled ?? false)
    setError(undefined)
    setNotice(undefined)
  }
  const savePolicy = async () => {
    if (enabled && !window.confirm(tr('policyConfirm'))) return
    setBusy(true)
    setError(undefined)
    try {
      const next = await ipcApi.request('prometheus.uar.feedback.save_policy', {
        workspaceId, source, connectorBindingId: bindingId, egressLabel, enabled,
        ...(policy ? { id: policy.id, expectedRevision: policy.revision } : {})
      })
      setPolicies((current) => [next, ...current.filter((item) => item.id !== next.id)])
      setPolicyId(next.id)
      await load()
      setNotice(t('common.saved'))
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const changed = (next: UarFeedbackDetail) => {
    setDetail(next)
    setSnapshot((current) => current ? { ...current, intakes: current.intakes.map((item) => item.id === next.intake.id ? next.intake : item) } : current)
  }
  const authorize = async () => {
    if (!policy || !detail) return
    setBusy(true)
    setError(undefined)
    try {
      changed(await ipcApi.request('prometheus.uar.feedback.authorize_policy', {
        workspaceId, intakeId: detail.intake.id, policyId: policy.id, expectedPolicyRevision: policy.revision
      }))
      await load()
      setNotice(tr('prepared'))
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const attachReview = async (role: Role) => {
    if (!detail) return
    setBusy(true)
    setError(undefined)
    try {
      changed(await ipcApi.request('prometheus.uar.feedback.attach_review', {
        workspaceId, intakeId: detail.intake.id, commandId: crypto.randomUUID(), expectedRevision: detail.intake.revision,
        role, artifactId: reviewIds[role].trim()
      }))
      setReviewIds((current) => ({ ...current, [role]: '' }))
      await load()
      setNotice(t('common.saved'))
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const decide = async (decision: 'admit' | 'reject') => {
    if (!detail || !window.confirm(tr('implementationConfirm'))) return
    setBusy(true)
    setError(undefined)
    try {
      changed(await ipcApi.request('prometheus.uar.feedback.implementation', {
        workspaceId, intakeId: detail.intake.id, commandId: crypto.randomUUID(), expectedRevision: detail.intake.revision,
        artifactIds: parsedArtifacts, decision
      }))
      await load()
      setNotice(t('common.saved'))
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-5" data-ui="uar-feedback-governance" aria-busy={busy}>
      <SettingGroup>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><SettingTitle>{tr('title')}</SettingTitle><SettingDescription>{tr('description')}</SettingDescription></div>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>{t('common.refresh')}</Button>
        </div>
        {busy && <p role="status" className="mt-3 text-sm text-muted-foreground">{t('common.loading')}</p>}
        {error && <p role="alert" className="mt-3 break-words text-sm text-error">{error}</p>}
        {notice && <p role="status" className="mt-3 text-sm text-muted-foreground">{notice}</p>}
        <div className="mt-4 space-y-4">
          <IntegrationChoice label={tr('policy')} value={policyId} onChange={selectPolicy} disabled={busy}
            options={[{ value: 'new', label: tr('newPolicy') }, ...policies.map((item) => ({ value: item.id,
              label: `${item.id} · ${tr(`source.${item.source}`)} · ${item.enabled ? t('common.enabled') : t('common.disabled')}` }))]} />
          <div className="grid gap-4 md:grid-cols-2">
            <IntegrationChoice label={tr('source')} value={source} onChange={setSource} disabled={busy}
              options={['direct', 'bossfang'].map((value) => ({ value: value as typeof source, label: tr(`source.${value}`) }))} />
            <IntegrationChoice label={tr('binding')} value={bindingId} disabled={busy}
              onChange={(value) => { setBindingId(value); setEgressLabel('') }}
              options={eligibleBindings.map((item) => ({ value: item.id, label: `${item.target} · ${item.id}` }))} />
            <IntegrationChoice label={tr('egress')} value={egressLabel} onChange={setEgressLabel} disabled={busy}
              options={selectedBinding?.allowedEgressLabels.map((value) => ({ value, label: value === 'public' || value === 'internal'
                ? t(`settings.prometheus.integration.uarAdmin.connectors.egress.${value}`) : value })) ?? []} />
          </div>
          {eligibleBindings.length === 0 && <p className="text-sm text-muted-foreground">{tr('noBindings')}</p>}
          <label className="flex min-h-6 items-center gap-2 text-sm"><Checkbox checked={enabled} disabled={busy} onCheckedChange={(value) => setEnabled(value === true)} />{t('common.enabled')}</label>
          <p className="text-xs text-muted-foreground">{tr('policyHelp')}</p>
          <div className="flex justify-end"><Button disabled={busy || !bindingId || !egressLabel} onClick={() => void savePolicy()}>{t('common.save')}</Button></div>
        </div>
      </SettingGroup>
      <SettingGroup>
        <SettingTitle>{tr('intake')}</SettingTitle>
        <SettingDescription>{tr('intakeHelp')}</SettingDescription>
        <div className="mt-4 space-y-4">
          <IntegrationChoice label={tr('intake')} value={intakeId} disabled={busy}
            onChange={(value) => { setIntakeId(value); setDetail(undefined); setReviewIds({ product: '', design: '', reviewer: '' }); setNotice(undefined) }}
            options={snapshot?.intakes.map((item) => ({ value: item.id, label: `${item.feedback.slice(0, 80)} · ${item.id}` })) ?? []} />
          {snapshot?.intakes.length === 0 && <p className="text-sm text-muted-foreground">{tr('empty')}</p>}
          {detail && <>
            <p className="break-all font-mono text-xs text-muted-foreground">{detail.intake.id}</p>
            {detail.intake.issueDraft && <div className="space-y-2 rounded-lg border border-border p-3">
              <h3 className="text-sm font-medium">{detail.intake.issueDraft.sanitizedIssue.title}</h3>
              <p className="whitespace-pre-wrap break-words text-sm">{detail.intake.issueDraft.sanitizedIssue.body}</p>
              <p className="break-all text-xs text-muted-foreground">{detail.intake.issueDraft.target} · {detail.intake.issueDraft.payloadDigest}</p>
            </div>}
            <p className="text-xs text-muted-foreground">{tr('authorizeHelp')}</p>
            <Button variant="outline" disabled={busy || !policyMatches || Boolean(detail.intake.connectorEffectId)} onClick={() => void authorize()}>{tr('authorize')}</Button>
            <div className="space-y-3 border-t border-border pt-4">
              <h3 className="text-sm font-medium">{tr('reviews')}</h3>
              <p className="text-xs text-muted-foreground">{tr('reviewsHelp')}</p>
              {roles.map((role) => <div key={role} className="space-y-2">
                <IntegrationField label={tr(`role.${role}`)} value={reviewIds[role]} disabled={busy}
                  onChange={(value) => setReviewIds({ ...reviewIds, [role]: value })} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="break-all text-xs text-muted-foreground">{detail.intake.reviewArtifacts[role] ?? '—'}</code>
                  <Button variant="outline" size="sm" disabled={busy || !reviewIds[role].trim()} onClick={() => void attachReview(role)}>{tr('attach')}</Button>
                </div>
              </div>)}
            </div>
            <div className="space-y-3 border-t border-border pt-4">
              <h3 className="text-sm font-medium">{tr('implementation')}</h3>
              <p className="text-xs text-muted-foreground">{tr('implementationHelp')}</p>
              <p className="text-sm font-medium">{tr('artifactIds')}</p>
              <ul className="space-y-1 break-all font-mono text-xs text-muted-foreground">
                {parsedArtifacts.map((artifactId) => <li key={artifactId}>{artifactId}</li>)}
              </ul>
              {detail.intake.implementation && <Badge variant="outline">{tr('recorded')} · {detail.intake.implementation.decision}</Badge>}
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" disabled={busy || !detail.intake.issueDraft || !reviewComplete || !parsedArtifacts.length}
                  onClick={() => void decide('reject')}>{tr('reject')}</Button>
                <Button disabled={busy || !detail.intake.issueDraft || !reviewComplete || !parsedArtifacts.length}
                  onClick={() => void decide('admit')}>{tr('admit')}</Button>
              </div>
            </div>
          </>}
        </div>
      </SettingGroup>
    </div>
  )
}
