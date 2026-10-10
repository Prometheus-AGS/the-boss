import { CheckCircle2, CircleSlash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { getSettingDomId } from '@renderer/pages/settings/settingsSearch/types'
import type { UarAdministrationSnapshot } from '@shared/types/prometheusIntegration'

type SurfaceProjection = UarAdministrationSnapshot['surfaces'][number]
function navText(translate: ReturnType<typeof useTranslation>['t'], key: string) {
  return translate('settings.prometheus.integration.uarAdmin.' + key)
}

function SurfaceStatus({ surface }: { surface: SurfaceProjection }) {
  const { t } = useTranslation()
  const available = surface.availability === 'available'
  return (
    <Badge variant={available ? 'secondary' : 'outline'} className="shrink-0 font-normal">
      {navText(t, `availability.${surface.availability}`)}
    </Badge>
  )
}

export function MethodCoverage({ surface }: { surface: SurfaceProjection }) {
  const { t } = useTranslation()
  return (
    <details className="border-t border-border pt-4">
      <summary className="cursor-pointer text-sm font-medium text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {navText(t, 'apiCoverage')} · {surface.methods.length}
      </summary>
      <div className="mt-3 divide-y divide-border-subtle overflow-hidden rounded-lg border border-border">
        {surface.methods.map((method) => (
          <div key={method.id} className="grid min-w-0 gap-2 px-3 py-2.5 sm:grid-cols-[4rem_minmax(0,1fr)_auto]">
            <span className="font-mono text-xs font-medium text-foreground">{method.method}</span>
            <code className="min-w-0 break-all text-xs text-muted-foreground">{method.path}</code>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge variant="outline" className="font-normal">
                {navText(t, `scope.${method.scope}`)}
              </Badge>
              <Badge variant="outline" className="font-normal">
                {navText(t, `apply.${method.apply}`)}
              </Badge>
              <span
                className={method.adapter === 'available' ? 'text-success' : 'text-error'}
                title={navText(t, `adapter.${method.adapter}`)}>
                {method.adapter === 'available' ? (
                  <CheckCircle2 size={15} aria-hidden="true" />
                ) : (
                  <CircleSlash2 size={15} aria-hidden="true" />
                )}
                <span className="sr-only">{navText(t, `adapter.${method.adapter}`)}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}

export function CapabilitySurface({ surface }: { surface: SurfaceProjection }) {
  const { t } = useTranslation()
  const adapterFailures = surface.methods.filter((method) => method.adapter === 'unavailable').length
  return (
    <SettingGroup id={getSettingDomId('/settings/uar', surface.id)} className="min-w-0 scroll-mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <SettingTitle>{navText(t, `surface.${surface.id}`)}</SettingTitle>
          <SettingDescription>{navText(t, 'surfaceDescription')}</SettingDescription>
        </div>
        <SurfaceStatus surface={surface} />
      </div>
      {adapterFailures > 0 && (
        <div
          className="mt-4 rounded-lg border border-error-border bg-error-subtle px-3 py-2 text-sm text-error-subtle-foreground"
          role="alert">
          {navText(t, 'adapterMismatch')}
        </div>
      )}
      <div className="mt-4">
        <MethodCoverage surface={surface} />
      </div>
    </SettingGroup>
  )
}

