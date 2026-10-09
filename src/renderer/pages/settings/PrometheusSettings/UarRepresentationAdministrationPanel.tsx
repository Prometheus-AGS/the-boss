import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Checkbox } from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { ipcApi } from '@renderer/ipc'
import type { UarRepresentationGrant, UarRepresentationSaveInput } from '@shared/types/uarRepresentation'
import { IntegrationChoice, IntegrationField } from './IntegrationFields'
import { UarExecutiveRoleCatalogPanel } from './UarExecutiveRoleCatalogPanel'

type Snapshot = Awaited<ReturnType<typeof ipcApi.request<'prometheus.uar.representation.snapshot'>>>
type Grant = UarRepresentationSaveInput['grant']
const offices = ['ceo', 'cfo', 'cio', 'intelligence', 'security', 'marketing', 'product'] as const
const blank = (): Grant => ({
  profile: 'urn:prometheus:uar:collaboration:0.1.0-draft.2', kind: 'RepresentationGrant',
  exportClass: 'private-authority-state', grantId: `urn:boss:grant:${crypto.randomUUID()}`,
  subjectPrincipalId: '', granteeAgentInstanceId: '', organizationId: '', office: 'ceo', purpose: '',
  audienceScopes: ['user:issuer'], actionScopes: [], resourceScopes: ['workspace:current'], dataScopes: [],
  approvalRequirements: ['current-policy', 'real-human'], disclosureRequirements: ['disclose-agent-assistance'],
  consentEvidenceRef: 'protected-evidence://', organizationalAuthorityEvidenceRef: 'protected-evidence://',
  revision: 1, status: 'pending', notBefore: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600000).toISOString(), revocation: null,
  retention: { policy: 'retain-audit', deleteAfter: null },
  offboarding: { mode: 'revoke-immediately', requiredActions: ['disable-binding'] },
  restrictions: { forbiddenClaims: ['human-authorship', 'human-approval'], notes: [] }
})
const scopes = (value: string) => [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))]

export function UarRepresentationAdministrationPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`settings.prometheus.integration.uarAdmin.representation.${key}`)
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [selectedId, setSelectedId] = useState('new')
  const [draft, setDraft] = useState<Grant>(blank)
  const [audience, setAudience] = useState('user:issuer')
  const [actions, setActions] = useState('')
  const [data, setData] = useState('')
  const [attested, setAttested] = useState(false)
  const [reason, setReason] = useState('')
  const [history, setHistory] = useState<UarRepresentationGrant[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const selected = snapshot?.grants.find((grant) => grant.grantId === selectedId)
  const terminal = selected?.status === 'revoked' || selected?.status === 'expired'
  const update = <K extends keyof Grant>(key: K, value: Grant[K]) => setDraft((previous) => ({ ...previous, [key]: value }))
  const load = useCallback(async () => {
    setBusy(true)
    setError(undefined)
    try { setSnapshot(await ipcApi.request('prometheus.uar.representation.snapshot', { workspaceId })) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }, [workspaceId])
  useEffect(() => { void load() }, [load])
  const choose = (value: string) => {
    const existing = snapshot?.grants.find((grant) => grant.grantId === value)
    const next = existing ? (({ issuerPrincipalId: _issuer, constraintDigest: _digest, ...grant }) => grant)(existing) : blank()
    setSelectedId(value); setDraft(next); setAudience(next.audienceScopes.join(', '))
    setActions(next.actionScopes.join(', ')); setData(next.dataScopes.join(', '))
    setHistory([]); setAttested(false); setReason('')
  }
  const save = async () => {
    if (!attested || !window.confirm(tr('saveConfirm'))) return
    setBusy(true); setError(undefined)
    try {
      const result = await ipcApi.request('prometheus.uar.representation.save', {
        workspaceId, commandId: crypto.randomUUID(), expectedRevision: selectedId === 'new' ? 0 : draft.revision,
        grant: { ...draft, revision: selectedId === 'new' ? 1 : draft.revision + 1,
          audienceScopes: scopes(audience), actionScopes: scopes(actions), dataScopes: scopes(data) }
      })
      const { issuerPrincipalId: _issuer, constraintDigest: _digest, ...grant } = result.grant
      setSelectedId(result.grant.grantId); setDraft(grant)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false); return }
    setAttested(false); await load()
  }
  const revoke = async () => {
    if (!selected || !reason.trim() || !window.confirm(tr('revokeConfirm'))) return
    setBusy(true); setError(undefined)
    try {
      await ipcApi.request('prometheus.uar.representation.revoke', { workspaceId, grantId: selected.grantId,
        expectedRevision: selected.revision, reason: reason.trim() })
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false); return }
    setAttested(false); await load()
  }
  const readHistory = async () => {
    if (!selected) return
    setBusy(true); setError(undefined)
    try { setHistory(await ipcApi.request('prometheus.uar.representation.history', { workspaceId, grantId: selected.grantId })) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  return <div className="space-y-4">
    <UarExecutiveRoleCatalogPanel workspaceId={workspaceId} />
    <SettingGroup>
      <SettingTitle>{tr('title')}</SettingTitle>
      <SettingDescription>{tr('help')}</SettingDescription>
      <p className="mt-3 text-xs text-muted-foreground">{tr('evidenceHelp')}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <IntegrationChoice label={tr('grant')} value={selectedId} onChange={choose} disabled={busy}
          options={[{ value: 'new', label: tr('new') }, ...(snapshot?.grants.map((grant) => ({
            value: grant.grantId, label: `${grant.office} · ${grant.subjectPrincipalId} · r${grant.revision}` })) ?? [])]} />
        <IntegrationField label={tr('issuer')} value={snapshot?.issuerPrincipalId ?? ''} onChange={() => {}} disabled />
        <IntegrationField label={tr('subject')} value={draft.subjectPrincipalId} onChange={(value) => update('subjectPrincipalId', value)} disabled={busy || terminal} />
        <IntegrationChoice label={tr('instance')} value={draft.granteeAgentInstanceId} onChange={(value) => update('granteeAgentInstanceId', value)} disabled={busy || terminal}
          options={snapshot?.instances.map((instance) => ({ value: instance.instanceId, label: `${instance.definitionId} · ${instance.instanceId}` })) ?? []} />
        <IntegrationChoice label={tr('officePreset')} value={offices.includes(draft.office as typeof offices[number]) ? draft.office : 'custom'}
          onChange={(value) => { if (value !== 'custom') update('office', value) }} disabled={busy || terminal}
          options={[...offices.map((office) => ({ value: office, label: tr(`office.${office}`) })), { value: 'custom', label: tr('custom') }]} />
        <IntegrationField label={tr('office')} help={tr('officeHelp')} value={draft.office} onChange={(value) => update('office', value)} disabled={busy || terminal} />
        <IntegrationField label={tr('organization')} value={draft.organizationId} onChange={(value) => update('organizationId', value)} disabled={busy || terminal} />
        <IntegrationField label={tr('purpose')} value={draft.purpose} onChange={(value) => update('purpose', value)} disabled={busy || terminal} />
        <IntegrationField label={tr('consent')} value={draft.consentEvidenceRef} onChange={(value) => update('consentEvidenceRef', value)} disabled={busy || terminal} />
        <IntegrationField label={tr('authority')} value={draft.organizationalAuthorityEvidenceRef} onChange={(value) => update('organizationalAuthorityEvidenceRef', value)} disabled={busy || terminal} />
        <IntegrationField label={tr('audience')} help="user:issuer, team-member:id" value={audience} onChange={setAudience} disabled={busy || terminal} />
        <IntegrationField label={tr('actions')} help="tool:providername" value={actions} onChange={setActions} disabled={busy || terminal} />
        <IntegrationField label={tr('data')} help="knowledge-base:id" value={data} onChange={setData} disabled={busy || terminal} />
        <IntegrationChoice label={tr('status')} value={draft.status} onChange={(value) => update('status', value)} disabled={busy || terminal}
          options={(['pending', 'active', 'suspended', ...(terminal ? [draft.status] : [])] as Grant['status'][]).map((status) => ({ value: status, label: tr(`status.${status}`) }))} />
        <IntegrationField label={tr('notBefore')} help={tr('utc')} value={draft.notBefore} onChange={(value) => update('notBefore', value)} disabled={busy || terminal} />
        <IntegrationField label={tr('expiresAt')} help={tr('utc')} value={draft.expiresAt} onChange={(value) => update('expiresAt', value)} disabled={busy || terminal} />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{tr('bounds')}</p>
      <label className="mt-4 flex items-start gap-2 text-sm"><Checkbox checked={attested} disabled={busy || terminal}
        onCheckedChange={(value) => setAttested(value === true)} />{tr('attestation')}</label>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={busy || terminal || !attested || !draft.subjectPrincipalId.trim() || !draft.granteeAgentInstanceId || !draft.organizationId.trim() || !draft.purpose.trim() || !actions.trim()}
          onClick={() => void save()}>{tr('save')}</Button>
        <Button variant="outline" disabled={busy} onClick={() => void load()}>{t('common.refresh')}</Button>
      </div>
      {error && <p className="mt-3 break-words text-sm text-error" role="alert">{error}</p>}
    </SettingGroup>
    {selected && <SettingGroup>
      <SettingTitle>{tr('audit')}</SettingTitle>
      <Badge>{tr(`status.${selected.status}`)} · r{selected.revision}</Badge>
      <p className="mt-2 break-all text-xs">{selected.grantId}<br />{selected.constraintDigest}</p>
      <div className="mt-4 space-y-3">
        <IntegrationField label={tr('reason')} value={reason} onChange={setReason} disabled={busy || terminal} />
        <div className="flex gap-2"><Button variant="outline" disabled={busy || terminal || !reason.trim()} onClick={() => void revoke()}>{tr('revoke')}</Button>
          <Button variant="outline" disabled={busy} onClick={() => void readHistory()}>{tr('history')}</Button></div>
        {history.map((grant) => <details key={grant.revision} className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm">r{grant.revision} · {tr(`status.${grant.status}`)} · {grant.notBefore}</summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(grant, null, 2)}</pre>
        </details>)}
      </div>
    </SettingGroup>}
  </div>
}
