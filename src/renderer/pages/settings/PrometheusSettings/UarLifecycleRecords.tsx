import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@cherrystudio/ui'
import { SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'

const prefix = 'settings.prometheus.integration.uarAdmin.'

export function LifecycleSource({
  title,
  source,
  children
}: {
  title: string
  source: {
    state: 'available' | 'unsupported' | 'unknown' | 'failed'
    scope: 'runtime' | 'workspace'
    readAt: string | null
    reason?: string
  }
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <SettingGroup
      className="min-w-0"
      data-ui="uar-lifecycle-source"
      data-source-state={source.state}
      data-source-scope={source.scope}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SettingTitle>{title}</SettingTitle>
        <Badge variant="outline">
          {t(prefix + (source.state === 'available' ? 'availability.available' : 'lifecycle.state.' + source.state))}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t(prefix + 'lifecycle.sourceScope.' + source.scope)}</p>
      {source.readAt && (
        <p className="mt-1 break-words text-xs text-muted-foreground">
          {t(prefix + 'lifecycle.readAt')} ·{' '}
          <time dateTime={source.readAt}>{new Date(source.readAt).toLocaleString()}</time>
        </p>
      )}
      {source.reason && (
        <p
          className="mt-3 break-words text-sm text-muted-foreground"
          role={source.state === 'failed' ? 'alert' : 'status'}>
          {source.reason === 'workspace_scoped_approval_inventory_unavailable'
            ? t(prefix + 'lifecycle.approvalScopeUnknown')
            : source.reason}
        </p>
      )}
      {source.state === 'available' && <div className="mt-4 space-y-4">{children}</div>}
    </SettingGroup>
  )
}

export function LifecycleRecord({
  id,
  title,
  status,
  children
}: {
  id: string
  title: string
  status?: string
  children: ReactNode
}) {
  return (
    <article
      data-ui="uar-lifecycle-record"
      data-record-id={id}
      id={recordAnchor(id)}
      className="min-w-0 scroll-mt-6 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 break-words text-sm font-medium">{title}</h3>
        {status && <Badge variant="secondary">{status}</Badge>}
      </div>
      {title !== id && <p className="mt-1 break-all text-xs text-muted-foreground">{id}</p>}
      <dl className="mt-2 grid min-w-0 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">{children}</dl>
    </article>
  )
}

export function LifecycleField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

export function recordAnchor(id: string) {
  return 'uar-lifecycle-' + encodeURIComponent(id)
}

export function LifecycleReference({ id, exists, targetId = id }: { id: string; exists: boolean; targetId?: string }) {
  const { t } = useTranslation()
  return exists ? (
    <a
      className="text-link underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      href={'#' + recordAnchor(targetId)}>
      {id}
    </a>
  ) : (
    <span>
      {id} · {t(prefix + 'lifecycle.missingLink')}
    </span>
  )
}

export function LifecycleEmpty() {
  const { t } = useTranslation()
  return <p className="text-sm text-muted-foreground">{t(prefix + 'lifecycle.noRecords')}</p>
}
