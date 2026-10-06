import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button, Input } from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { uarTeamError } from '@renderer/components/uarTeams/uarTeamError'
import { ipcApi } from '@renderer/ipc'
import type { UarExecutionOwnerSnapshot, UarExecutionReclaimReceipt } from '@shared/types/uarTeamProfiles'

export function UarExecutionOwnerPanel() {
  const { t } = useTranslation()
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams.execution' })
  const id = useId()
  const [owner, setOwner] = useState<UarExecutionOwnerSnapshot>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [receipt, setReceipt] = useState<UarExecutionReclaimReceipt>()
  const reclaimIntent = useRef<{ fingerprint: string; commandId: string } | undefined>(undefined)
  const refresh = useCallback(async () => {
    setBusy(true)
    setError(undefined)
    try {
      setOwner(await ipcApi.request('prometheus.uar.teams.execution_owner', {}))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const quiesce = async () => {
    if (!window.confirm(tr('quiesceConfirm'))) return
    setBusy(true)
    setError(undefined)
    try {
      const result = await ipcApi.request('prometheus.uar.teams.quiesce_owner', {})
      setEvidence(result.fencingEvidenceRef)
      setOwner(await ipcApi.request('prometheus.uar.teams.execution_owner', {}))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  const reclaim = async () => {
    if (!owner?.claim || !reason.trim() || !evidence.trim()) return
    setBusy(true)
    setError(undefined)
    try {
      const payload = {
        catalogId: owner.currentFence.catalogId,
        expectedEpoch: owner.claim.epoch,
        replacementServiceInstanceId: owner.currentFence.serviceInstanceId,
        reason: reason.trim(),
        fencingEvidenceRef: evidence.trim()
      }
      const fingerprint = JSON.stringify(payload)
      const intent =
        reclaimIntent.current?.fingerprint === fingerprint
          ? reclaimIntent.current
          : { fingerprint, commandId: crypto.randomUUID() }
      reclaimIntent.current = intent
      setReceipt(
        await ipcApi.request('prometheus.uar.teams.reclaim_owner', { ...payload, commandId: intent.commandId })
      )
      reclaimIntent.current = undefined
      setOwner(await ipcApi.request('prometheus.uar.teams.execution_owner', {}))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <SettingGroup data-ui="uar-execution-owner">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SettingTitle>{tr('ownerTitle')}</SettingTitle>
          <SettingDescription>{tr('ownerHelp')}</SettingDescription>
        </div>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>
          {t('common.refresh')}
        </Button>
      </div>
      {busy && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {t('common.loading')}
        </p>
      )}
      {error && (
        <p className="mt-3 break-words text-sm text-error" role="alert">
          {uarTeamError(error, tr)}
        </p>
      )}
      {owner && (
        <div className="mt-3 space-y-3">
          <Badge variant="outline">{tr(owner.ownsExecution ? 'ownerCurrent' : 'ownerConflict')}</Badge>
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <dt className="font-medium">{tr('ownerService')}</dt>
              <dd className="break-all">{owner.claim?.serviceInstanceId ?? owner.currentFence.serviceInstanceId}</dd>
            </div>
            <div>
              <dt className="font-medium">{tr('ownerEpoch')}</dt>
              <dd>{owner.claim?.epoch ?? owner.currentFence.epoch}</dd>
            </div>
            <div>
              <dt className="font-medium">{tr('ownerStateLabel')}</dt>
              <dd>{tr('ownerState.' + (owner.claim?.state ?? 'released'))}</dd>
            </div>
          </dl>
          {owner.ownsExecution && (
            <div>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void quiesce()}>
                {tr('quiesce')}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">{tr('quiesceHelp')}</p>
            </div>
          )}
          {!owner.ownsExecution && owner.claim?.incarnationId === owner.currentFence.incarnationId && (
            <p className="text-xs text-muted-foreground">{tr('restartForReclaim')}</p>
          )}
          {!owner.ownsExecution && owner.claim && owner.claim.incarnationId !== owner.currentFence.incarnationId && (
            <details className="text-sm">
              <summary className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring">
                {tr('reclaimTitle')}
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">{tr('reclaimHelp')}</p>
              <label htmlFor={id + 'reason'} className="mt-3 block text-xs font-medium">
                {tr('reason')}
              </label>
              <Input
                id={id + 'reason'}
                value={reason}
                disabled={busy}
                maxLength={2048}
                onChange={(event) => setReason(event.target.value)}
              />
              <label htmlFor={id + 'evidence'} className="mt-3 block text-xs font-medium">
                {tr('fencingEvidence')}
              </label>
              <Input
                id={id + 'evidence'}
                value={evidence}
                disabled={busy}
                maxLength={128}
                onChange={(event) => setEvidence(event.target.value)}
                aria-describedby={id + 'help'}
              />
              <p id={id + 'help'} className="mt-1 text-xs text-muted-foreground">
                {tr('fencingHelp')}
              </p>
              <Button
                className="mt-3"
                variant="destructive"
                size="sm"
                disabled={busy || !reason.trim() || !evidence.trim()}
                onClick={() => void reclaim()}>
                {tr('reclaim')}
              </Button>
            </details>
          )}
        </div>
      )}
      {receipt && (
        <p className="mt-3 break-words text-sm text-success" role="status">
          {tr('reclaimSucceeded', {
            epoch: receipt.replacementFence.epoch,
            transferred: receipt.transferredQueuedAttemptIds.length,
            uncertain: receipt.uncertainAttemptIds.length
          })}
        </p>
      )}
    </SettingGroup>
  )
}
