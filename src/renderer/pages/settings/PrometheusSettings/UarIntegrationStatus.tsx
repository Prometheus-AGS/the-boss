import { Loader2 } from 'lucide-react'

import { Badge, Button } from '@cherrystudio/ui'
import {
  SettingDescription,
  SettingDivider,
  SettingGroup,
  SettingHelpText,
  SettingTitle
} from '@renderer/components/SettingsPrimitives'
import type { ThemeMode } from '@shared/data/preference/preferenceTypes'
import type { IntegrationAction, IntegrationSnapshot } from '@shared/types/prometheusIntegration'

type Text = (key: string, options?: Record<string, unknown>) => string

export function UarIntegrationStatus({
  snapshot,
  busy,
  dirty,
  theme,
  text,
  activeAction,
  start,
  id
}: {
  snapshot: IntegrationSnapshot
  busy: boolean
  dirty: boolean
  theme: ThemeMode
  text: Text
  activeAction?: IntegrationAction
  start: (action: IntegrationAction) => void
  id?: string
}) {
  const running = snapshot.uar.state === 'running'
  const portFallback = running && snapshot.uar.effectivePort !== snapshot.uar.appliedPort
  const describeStorage = (
    backend: 'embedded' | 'remote',
    details: { endpoint?: string; namespace?: string; database?: string }
  ) => {
    if (backend === 'embedded') return text('uarBackendLocal')
    return [
      text('backends.remote'),
      details.endpoint,
      details.namespace && details.database ? `${details.namespace}/${details.database}` : undefined
    ]
      .filter(Boolean)
      .join(' · ')
  }

  return (
    <SettingGroup theme={theme} id={id} className="scroll-mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <SettingTitle>{text('uarRuntimeStatus')}</SettingTitle>
          <SettingDescription>{text('uarRuntimeStatusDescription')}</SettingDescription>
        </div>
        <Badge
          role="status"
          aria-atomic="true"
          variant="outline"
          className={running ? 'border-success-border text-success' : 'border-border text-muted-foreground'}>
          {text(`states.${snapshot.uar.state}`)}
        </Badge>
      </div>
      <SettingDivider />

      <div className="rounded-lg border border-border bg-background/40 p-4">
        <div className="text-xs font-medium text-muted-foreground">{text('uarEndpoint')}</div>
        <div className="mt-1 break-all font-mono text-sm text-foreground">
          {snapshot.uar.baseUrl ?? text('uarUnavailable')}
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">{text('uarRunningPreferredPort')}</dt>
            <dd className="mt-1 font-mono text-sm text-foreground">{snapshot.uar.appliedPort}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{text('uarListeningPort')}</dt>
            <dd className="mt-1 font-mono text-sm text-foreground">
              {snapshot.uar.effectivePort ?? text('uarUnavailable')}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">{text('uarConfigurationState')}</dt>
            <dd className="mt-1 text-sm text-foreground">
              {text(snapshot.uar.applyRequired ? 'uarApplyRequired' : 'uarApplied')}
            </dd>
          </div>
          {snapshot.uar.applyRequired && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">{text('uarPendingPort')}</dt>
              <dd className="mt-1 font-mono text-sm text-foreground">{snapshot.uar.requestedPort}</dd>
            </div>
          )}
        </dl>
      </div>

      {portFallback && (
        <div
          className="mt-3 rounded-lg border border-warning-border bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground"
          role="status">
          {text('uarPortFallback', {
            preferredPort: snapshot.uar.appliedPort,
            effectivePort: snapshot.uar.effectivePort
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant={!running && !snapshot.uar.applyRequired ? 'default' : 'outline'}
          size="sm"
          disabled={busy || dirty}
          onClick={() => start('uar-check')}>
          {activeAction === 'uar-check' && (
            <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden="true" />
          )}
          {text(running ? 'actions.uar-check' : 'uarStart')}
        </Button>
        <Button
          variant={snapshot.uar.applyRequired ? 'default' : 'outline'}
          size="sm"
          disabled={busy || dirty || !snapshot.uar.applyRequired}
          onClick={() => start('uar-apply')}>
          {activeAction === 'uar-apply' && (
            <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden="true" />
          )}
          {text('actions.uar-apply')}
        </Button>
        <Button variant="outline" size="sm" disabled={busy || dirty} onClick={() => start('uar-restart')}>
          {activeAction === 'uar-restart' && (
            <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden="true" />
          )}
          {text('actions.uar-restart')}
        </Button>
      </div>

      {activeAction?.startsWith('uar-') && (
        <SettingHelpText className="mt-3" role="status" aria-live="polite">
          {text(`actions.${activeAction}`)} · {text('operationInProgress')}
        </SettingHelpText>
      )}

      {snapshot.uar.lastApplyError ? (
        <SettingHelpText className="mt-3 text-error" role="alert">
          {text('uarLastApplyError')}: {snapshot.uar.lastApplyError}
        </SettingHelpText>
      ) : (
        <SettingHelpText className="mt-3">{text('uarApplyHelp')}</SettingHelpText>
      )}

      <details className="mt-4 border-t border-border pt-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          {text('uarTechnicalDetails')}
        </summary>
        <dl className="mt-3 divide-y divide-border-subtle">
          {[
            [text('uarRuntimeVersion'), snapshot.uar.runtimeVersion ?? text('uarUnavailable')],
            [text('uarProcessId'), snapshot.uar.processId ? String(snapshot.uar.processId) : text('uarUnavailable')],
            [
              text('uarStartedAt'),
              snapshot.uar.startedAt ? new Date(snapshot.uar.startedAt).toLocaleString() : text('uarUnavailable')
            ],
            [text('uarRequestedBackend'), describeStorage(snapshot.uar.requestedBackend, snapshot.config.uar)],
            [text('uarEffectiveBackend'), describeStorage(snapshot.uar.effectiveBackend, snapshot.uar)],
            [text('uarSkills'), String(snapshot.inventory?.skills.length ?? 0)],
            [
              text('uarCapabilities'),
              snapshot.uar.capabilities.length ? snapshot.uar.capabilities.join(', ') : text('uarUnavailable')
            ]
          ].map(([label, value]) => (
            <div key={label} className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-4">
              <dt className="font-medium">{label}</dt>
              <dd className="min-w-0 break-words text-foreground-secondary">{value}</dd>
            </div>
          ))}
          <div className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-4">
            <dt className="font-medium">{text('uarBinary')}</dt>
            <dd className="min-w-0 break-all text-foreground-secondary">
              {snapshot.uar.binary ?? text('uarUnavailable')}
              {snapshot.uar.binaryVersion ? ` · ${snapshot.uar.binaryVersion}` : ''}
            </dd>
          </div>
        </dl>
      </details>
    </SettingGroup>
  )
}
