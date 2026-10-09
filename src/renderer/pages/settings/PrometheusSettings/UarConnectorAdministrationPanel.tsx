import { useCallback, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button, Checkbox, Textarea } from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { ipcApi } from '@renderer/ipc'
import type { UarConnectorEffect, UarConnectorSaveInput } from '@shared/types/uarConnectors'

import { IntegrationChoice, IntegrationField } from './IntegrationFields'

type Snapshot = Awaited<ReturnType<typeof ipcApi.request<'prometheus.uar.connectors.snapshot'>>>
type Binding = Snapshot['bindings'][number]
type Provider = UarConnectorSaveInput['provider']
type Action = UarConnectorSaveInput['allowedActions'][number]
const providers: Provider[] = ['github', 'notion', 'slack', 'jira']
const providerNames = { github: 'GitHub', notion: 'Notion', slack: 'Slack', jira: 'Jira' }
const actions: Action[] = ['read', 'draft', 'write', 'send', 'publish']
const providerActions: Record<Provider, Action[]> = {
  github: ['read', 'draft', 'publish'], notion: ['read', 'draft', 'write', 'publish'],
  slack: ['read', 'draft', 'send'], jira: ['read', 'draft', 'write']
}
const newDraft = () => ({ provider: 'github' as Provider, target: '', site: '', credential: '',
  allowedActions: ['read', 'draft'] as Action[], approvalMode: 'explicit_customer' as const })

export function UarConnectorAdministrationPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`settings.prometheus.integration.uarAdmin.connectors.${key}`)
  const id = useId()
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [selectedId, setSelectedId] = useState('new')
  const [draft, setDraft] = useState<Omit<UarConnectorSaveInput, 'workspaceId' | 'id' | 'expectedRevision'>>(newDraft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [action, setAction] = useState<Action>('read')
  const [egress, setEgress] = useState<string[]>([])
  const [decisionRef, setDecisionRef] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [issue, setIssue] = useState('')
  const [properties, setProperties] = useState('{}')
  const [reconcileId, setReconcileId] = useState('')
  const [disposition, setDisposition] = useState<'confirmed' | 'not_applied'>('confirmed')
  const [externalId, setExternalId] = useState('')
  const [evidenceRef, setEvidenceRef] = useState('')
  const [independentlyChecked, setIndependentlyChecked] = useState(false)
  const binding = snapshot?.bindings.find((item) => item.id === selectedId)

  const load = useCallback(async () => {
    setBusy(true)
    setError(undefined)
    try {
      setSnapshot(await ipcApi.request('prometheus.uar.connectors.snapshot', { workspaceId }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [workspaceId])
  useEffect(() => { void load() }, [load])

  const selectBinding = (value: string, source = snapshot) => {
    const selected = source?.bindings.find((item) => item.id === value)
    setSelectedId(value)
    setDraft(selected ? { provider: selected.provider, target: selected.target, site: selected.site ?? '',
      allowedActions: selected.allowedActions, approvalMode: selected.approvalMode, credential: '' } : newDraft())
    setAction(selected?.allowedActions.find((item) => providerActions[selected.provider].includes(item)) ?? 'read')
    setEgress([])
    setDecisionRef('')
    setTitle('')
    setBody('')
    setIssue('')
    setProperties('{}')
    setNotice(undefined)
    setError(undefined)
  }

  const save = async (revoked?: boolean) => {
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const configuration = revoked !== undefined && binding ? binding : draft
      const saved = await ipcApi.request('prometheus.uar.connectors.save', {
        workspaceId, provider: configuration.provider, target: configuration.target.trim(), allowedActions: configuration.allowedActions,
        approvalMode: configuration.approvalMode,
        ...(configuration.site?.trim() ? { site: configuration.site.trim() } : {}),
        ...(revoked === undefined && draft.credential ? { credential: draft.credential } : {}),
        ...(binding ? { id: binding.id, expectedRevision: binding.revision } : {}),
        ...(revoked !== undefined ? { revoked } : {})
      })
      setDraft((current) => ({ ...current, credential: '' }))
      const next = await ipcApi.request('prometheus.uar.connectors.snapshot', { workspaceId })
      setSnapshot(next)
      selectBinding(saved.id, next)
      setNotice(t('common.saved'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const prepare = async () => {
    if (!binding) return
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      let payload: Record<string, unknown> = {}
      if (action === 'draft') payload = { title, body, text: body }
      else if (binding.provider === 'github') {
        if (action === 'read') {
          const issueNumber = Number(issue)
          if (!Number.isInteger(issueNumber) || issueNumber < 1) throw new Error(tr('invalidIssue'))
          payload = { issueNumber }
        } else payload = { title, body }
      } else if (binding.provider === 'slack' && action !== 'read') payload = { text: body }
      else if (binding.provider === 'jira') payload = action === 'read' ? { issueKey: issue } : { title, body }
      else if (binding.provider === 'notion' && action !== 'read') {
        let parsed: unknown
        try { parsed = JSON.parse(properties) } catch { throw new Error(tr('invalidProperties')) }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(tr('invalidProperties'))
        payload = { properties: parsed }
      }
      const effect = await ipcApi.request('prometheus.uar.connectors.prepare', {
        workspaceId, bindingId: binding.id, expectedBindingRevision: binding.revision, action,
        egressLabels: egress, ...(decisionRef.trim() ? { decisionRef: decisionRef.trim() } : {}), payload
      })
      setSnapshot((current) => current ? { ...current, effects: [effect, ...current.effects.filter((item) => item.id !== effect.id)] } : current)
      await load()
      setNotice(tr('preparedNotice'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const changeEffect = async (effect: UarConnectorEffect, operation: 'dispatch' | 'cancel') => {
    if (operation === 'dispatch' && !window.confirm(tr('dispatchConfirm'))) return
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const next = operation === 'dispatch'
        ? await ipcApi.request('prometheus.uar.connectors.dispatch', { workspaceId, effectId: effect.id })
        : await ipcApi.request('prometheus.uar.connectors.cancel', { workspaceId, effectId: effect.id })
      setSnapshot((current) => current ? { ...current, effects: current.effects.map((item) => item.id === next.id ? next : item) } : current)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const requiresDecision = binding && binding.provider !== 'github' && !['read', 'draft'].includes(action)
  const reconciliation = snapshot?.effects.find((effect) => effect.id === reconcileId)
  const reconcile = async () => {
    if (!reconciliation || !independentlyChecked) return
    setBusy(true)
    setError(undefined)
    try {
      await ipcApi.request('prometheus.uar.connectors.reconcile', {
        workspaceId, effectId: reconciliation.id, expectedPayloadDigest: reconciliation.payloadDigest,
        disposition, ...(externalId.trim() ? { externalId: externalId.trim() } : {}),
        evidenceRef: evidenceRef.trim(), independentlyChecked: true
      })
      setReconcileId('')
      setEvidenceRef('')
      setExternalId('')
      setIndependentlyChecked(false)
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  return (
    <div className="space-y-5" data-ui="uar-connectors" aria-busy={busy}>
      <SettingGroup>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><SettingTitle>{tr('title')}</SettingTitle><SettingDescription>{tr('description')}</SettingDescription></div>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>{t('common.refresh')}</Button>
        </div>
        {busy && <p role="status" className="mt-3 text-sm text-muted-foreground">{t('common.loading')}</p>}
        {error && <p role="alert" className="mt-3 break-words text-sm text-error">{error}</p>}
        {notice && <p role="status" className="mt-3 text-sm text-muted-foreground">{notice}</p>}
        <div className="mt-4 space-y-4">
          <IntegrationChoice label={tr('binding')} value={selectedId} onChange={selectBinding} disabled={busy}
            options={[{ value: 'new', label: tr('newBinding') }, ...(snapshot?.bindings.map((item) => ({
              value: item.id, label: `${providerNames[item.provider]} · ${item.target}${item.revoked ? ` · ${tr('revoked')}` : ''}`
            })) ?? [])]} />
          <div className="grid gap-4 md:grid-cols-2">
            <IntegrationChoice label={tr('provider')} value={draft.provider} disabled={busy || Boolean(binding)}
              onChange={(provider) => setDraft({ ...newDraft(), provider })}
              options={providers.map((provider) => ({ value: provider, label: providerNames[provider] }))} />
            <IntegrationField label={tr(`target.${draft.provider}`)} value={draft.target} disabled={busy}
              onChange={(target) => setDraft({ ...draft, target })} />
            {draft.provider === 'jira' && <IntegrationField label={tr('site')} value={draft.site ?? ''} disabled={busy}
              onChange={(site) => setDraft({ ...draft, site })} />}
            <IntegrationChoice label={tr('approvalMode')} value={draft.approvalMode ?? 'explicit_customer'} disabled={busy}
              onChange={(approvalMode) => setDraft({ ...draft, approvalMode })}
              options={['explicit_customer', 'standing_policy'].map((value) => ({ value: value as Binding['approvalMode'], label: tr(`approval.${value}`) }))} />
          </div>
          <IntegrationField type="password" label={tr('credential')} value={draft.credential ?? ''} disabled={busy}
            onChange={(credential) => setDraft({ ...draft, credential })} help={tr('credentialHelp')} />
          {binding && <p className="text-xs text-muted-foreground">{binding.credentialConfigured ? tr('credentialConfigured') : tr('credentialMissing')}</p>}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{tr('allowedActions')}</legend>
            <div className="flex flex-wrap gap-4">{actions.map((item) => (
              <label key={item} className="flex min-h-6 items-center gap-2 text-sm">
                <Checkbox checked={draft.allowedActions.includes(item)} disabled={busy || !providerActions[draft.provider].includes(item)}
                  onCheckedChange={(checked) => setDraft({ ...draft, allowedActions: checked ? [...draft.allowedActions, item] : draft.allowedActions.filter((value) => value !== item) })} />
                {tr(`action.${item}`)}
              </label>
            ))}</div>
          </fieldset>
          <p className="text-xs text-muted-foreground">{tr('approvalHelp')}</p>
          <div className="flex flex-wrap justify-end gap-2">
            {binding && <Button variant="outline" disabled={busy} onClick={() => void save(!binding.revoked)}>
              {binding.revoked ? tr('restore') : tr('revoke')}
            </Button>}
            <Button disabled={busy || !draft.target.trim() || !draft.allowedActions.length || (draft.provider === 'jira' && !draft.site?.trim())}
              onClick={() => void save()}>{t('common.save')}</Button>
          </div>
        </div>
      </SettingGroup>

      {binding && <SettingGroup>
        <SettingTitle>{tr('prepare')}</SettingTitle>
        <SettingDescription>{tr('prepareHelp')}</SettingDescription>
        {binding.revoked && <p role="status" className="mt-3 text-sm text-warning-subtle-foreground">{tr('revoked')}</p>}
        <div className="mt-4 grid gap-4">
          <IntegrationChoice label={tr('allowedActions')} value={action} onChange={setAction} disabled={busy || binding.revoked}
            options={binding.allowedActions.filter((value) => providerActions[binding.provider].includes(value)).map((value) => ({ value, label: tr(`action.${value}`) }))} />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{tr('egress')}</legend>
            <div className="flex flex-wrap gap-4">{binding.allowedEgressLabels.map((label) => (
              <label key={label} className="flex min-h-6 items-center gap-2 text-sm">
                <Checkbox checked={egress.includes(label)} disabled={busy || binding.revoked}
                  onCheckedChange={(checked) => setEgress(checked ? [...egress, label] : egress.filter((item) => item !== label))} />
                {label === 'public' || label === 'internal' ? tr(`egress.${label}`) : label}
              </label>
            ))}</div>
          </fieldset>
          <IntegrationField label={tr('decision')} value={decisionRef} onChange={setDecisionRef} disabled={busy}
            help={requiresDecision ? tr('decisionRequired') : tr('decisionHelp')} />
          {action === 'read' && ['github', 'jira'].includes(binding.provider) && (
            <IntegrationField label={tr(binding.provider === 'github' ? 'issueNumber' : 'issueKey')} value={issue}
              onChange={setIssue} disabled={busy} type={binding.provider === 'github' ? 'number' : 'text'} />
          )}
          {action !== 'read' && (binding.provider !== 'notion' || action === 'draft') && <>
            {binding.provider !== 'slack' && <IntegrationField label={tr('payloadTitle')} value={title} onChange={setTitle} disabled={busy} />}
            <label htmlFor={id + '-body'} className="text-sm font-medium">{tr('body')}</label>
            <Textarea.Input id={id + '-body'} value={body} onValueChange={setBody} rows={5} disabled={busy} />
          </>}
          {binding.provider === 'notion' && !['read', 'draft'].includes(action) && <>
            <label htmlFor={id + '-properties'} className="text-sm font-medium">{tr('properties')}</label>
            <Textarea.Input id={id + '-properties'} value={properties} onValueChange={setProperties} rows={6} disabled={busy} />
          </>}
          <Button className="justify-self-end" disabled={busy || binding.revoked || (!binding.credentialConfigured && action !== 'draft') || !binding.allowedActions.includes(action) || !providerActions[binding.provider].includes(action) || !egress.length || (requiresDecision && !decisionRef.trim())}
            onClick={() => void prepare()}>{tr('prepare')}</Button>
        </div>
      </SettingGroup>}

      <SettingGroup>
        <SettingTitle>{tr('effects')}</SettingTitle>
        <SettingDescription>{tr('stages')}</SettingDescription>
        {snapshot && snapshot.effects.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{tr('empty')}</p>}
        <div className="mt-4 space-y-3">{snapshot?.effects.map((effect) => (
          <article key={effect.id} className="min-w-0 space-y-2 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><div className="font-medium">{providerNames[effect.provider]} · {tr(`action.${effect.action}`)}</div>
                <p className="break-all text-sm">{effect.target}</p></div>
              <Badge variant="outline">{tr(`state.${effect.status}`)}</Badge>
            </div>
            <p className="break-all font-mono text-xs text-muted-foreground">{effect.id}</p>
            <p className="text-xs text-muted-foreground">{tr(`stage.${effect.status}`)}</p>
            <details className="text-xs">
              <summary className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{tr('details')}</summary>
              <dl className="mt-2 grid gap-2 break-all">
                <div><dt className="font-medium">{tr('digest')}</dt><dd>{effect.payloadDigest}</dd></div>
                <div><dt className="font-medium">{tr('decision')}</dt><dd>{effect.decisionRef ?? '—'}</dd></div>
                <div><dt className="font-medium">{tr('egress')}</dt><dd>{effect.egressLabels.join(', ')}</dd></div>
                {effect.receipt?.externalId && <div><dt className="font-medium">{tr('externalId')}</dt><dd>{effect.receipt.externalId}</dd></div>}
                {effect.receipt?.evidenceRef && <div><dt className="font-medium">{tr('evidence')}</dt><dd>{effect.receipt.evidenceRef}</dd></div>}
              </dl>
            </details>
            {['prepared', 'draft'].includes(effect.status) && <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void changeEffect(effect, 'cancel')}>{t('common.cancel')}</Button>
              {effect.status === 'prepared' && <Button size="sm" disabled={busy} onClick={() => void changeEffect(effect, 'dispatch')}>{tr('dispatch')}</Button>}
            </div>}
            {['uncertain', 'dispatched'].includes(effect.status) && <Button variant="outline" size="sm" disabled={busy}
              onClick={() => { setReconcileId(effect.id); setIndependentlyChecked(false); setExternalId(''); setEvidenceRef('') }}>{tr('reconcile')}</Button>}
          </article>
        ))}</div>
        {reconciliation && <div className="mt-4 space-y-4 border-t border-border pt-4" data-ui="uar-connector-reconcile">
          <h3 className="text-sm font-medium">{tr('reconcile')} · {reconciliation.target}</h3>
          <p className="text-xs text-muted-foreground">{tr('reconcileHelp')}</p>
          <IntegrationChoice label={tr('disposition')} value={disposition} onChange={setDisposition} disabled={busy}
            options={['confirmed', 'not_applied'].map((value) => ({ value: value as typeof disposition, label: tr(`state.${value}`) }))} />
          <IntegrationField label={tr('externalId')} value={externalId} onChange={setExternalId} disabled={busy} />
          <IntegrationField label={tr('evidence')} value={evidenceRef} onChange={setEvidenceRef} disabled={busy} />
          <label className="flex min-h-6 items-center gap-2 text-sm"><Checkbox checked={independentlyChecked} disabled={busy}
            onCheckedChange={(value) => setIndependentlyChecked(value === true)} />{tr('independentlyChecked')}</label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setReconcileId('')}>{t('common.cancel')}</Button>
            <Button disabled={busy || !independentlyChecked || !evidenceRef.trim() || (disposition === 'confirmed' && !externalId.trim())}
              onClick={() => void reconcile()}>{tr('recordReconciliation')}</Button>
          </div>
        </div>}
      </SettingGroup>
    </div>
  )
}
