import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { openRoute, openSettingsTab } from '@renderer/services/mainWindowNavigation'
import type { UarModelAssignment } from '@shared/data/api/schemas/agents'
import type { UniqueModelId } from '@shared/data/types/model'
import type { UarModelSourceSnapshot } from '@shared/types/prometheusIntegration'

type Props = {
  value?: UarModelAssignment
  onChange: (value: UarModelAssignment) => void
  portalContainer: HTMLElement | null
  autoSelect?: boolean
  catalogAgentId?: string
  legacyModelId?: UniqueModelId
  legacyModelName?: string
  onSettingsNavigate?: (navigate: () => void) => void
}

type Choice = { assignment: UarModelAssignment; label: string; source: UarModelAssignment['source'] }

function choicesFromSnapshot(snapshot: UarModelSourceSnapshot): Choice[] {
  return snapshot.sources.flatMap((source) => {
    if (!source.operational) return []
    return source.providers.flatMap((provider) => {
      if (!provider.enabled || !provider.credentialConfigured) return []
      return provider.models.flatMap((model): Choice[] => {
        if (!model.enabled) return []
        const assignment: UarModelAssignment =
          source.source === 'uar'
            ? { source: 'uar', providerId: provider.id, modelId: model.id }
            : source.source === 'gateway'
              ? { source: 'gateway', modelId: model.id }
              : { source: 'boss', modelId: model.id as UniqueModelId }
        return [{ assignment, source: source.source, label: `${provider.name} · ${model.name}` }]
      })
    })
  })
}

function navigateTo(path: '/settings/uar' | '/settings/liter-llm', before?: Props['onSettingsNavigate']) {
  const navigate = () => openSettingsTab(path)
  if (before) before(navigate)
  else navigate()
}

/** Selects the executable UAR route. Boss's ordinary model field remains a separate catalog value. */
export function UarModelAssignmentField({
  value,
  onChange,
  portalContainer,
  autoSelect = false,
  catalogAgentId,
  legacyModelId,
  legacyModelName,
  onSettingsNavigate
}: Props) {
  const { t } = useTranslation()
  const [snapshot, setSnapshot] = useState<UarModelSourceSnapshot>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (catalogAgentId) return
    let active = true
    setLoading(true)
    void ipcApi.request('prometheus.uar.models.sources', {}).then(
      (result) => {
        if (!active) return
        setSnapshot(result)
        setError(undefined)
        setLoading(false)
      },
      (reason: unknown) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : String(reason))
        setLoading(false)
      }
    )
    return () => {
      active = false
    }
  }, [catalogAgentId])

  const choices = useMemo(() => (snapshot ? choicesFromSnapshot(snapshot) : []), [snapshot])
  const defaultChoice =
    choices.find((choice) => choice.source === 'gateway') ?? choices.find((choice) => choice.source === 'uar')

  useEffect(() => {
    if (autoSelect && !value && defaultChoice) onChange(defaultChoice.assignment)
  }, [autoSelect, defaultChoice, onChange, value])

  if (catalogAgentId) {
    return (
      <div className="min-w-0 space-y-2 py-3">
        <div className="text-sm font-medium">{t('library.config.agent.uar_model.label')}</div>
        <p className="text-sm text-muted-foreground">{t('library.config.agent.uar_model.catalog_owned')}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const navigate = () => openRoute('/settings/uar', { panel: 'agents', agentId: catalogAgentId })
            if (onSettingsNavigate) onSettingsNavigate(navigate)
            else navigate()
          }}>
          {t('library.config.agent.uar_model.open_catalog')}
        </Button>
      </div>
    )
  }

  const selectedAssignment =
    value?.source === 'boss' && !value.modelId && legacyModelId ? { ...value, modelId: legacyModelId } : value
  const selectedValue = selectedAssignment ? JSON.stringify(selectedAssignment) : undefined
  const selectedChoice = choices.find((choice) => JSON.stringify(choice.assignment) === selectedValue)
  const selectedSource = snapshot?.sources.find((source) => source.source === value?.source)
  const unavailable = value && !selectedChoice
  const legacyRouteReady =
    !value && choices.some((choice) => choice.source === 'boss' && choice.assignment.modelId === legacyModelId)

  return (
    <div className="min-w-0 space-y-2 py-3">
      <label className="block text-sm font-medium" id="uar-model-assignment-label">
        {t('library.config.agent.uar_model.label')}
      </label>
      <p className="text-xs text-muted-foreground">{t('library.config.agent.uar_model.help')}</p>
      <Select value={selectedValue} onValueChange={(selected) => onChange(JSON.parse(selected) as UarModelAssignment)}>
        <SelectTrigger aria-labelledby="uar-model-assignment-label" className="w-full min-w-0">
          <SelectValue placeholder={t('library.config.agent.uar_model.choose')} />
        </SelectTrigger>
        <SelectContent portalContainer={portalContainer}>
          {choices.map((choice) => {
            const key = JSON.stringify(choice.assignment)
            return (
              <SelectItem key={key} value={key}>
                {{ boss: 'The Boss', gateway: 'liter-llm', uar: 'UAR' }[choice.source]} · {choice.label}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      {loading ? <p className="text-xs text-muted-foreground">{t('common.loading')}</p> : null}
      {error ? (
        <p className="break-words text-error text-xs">{t('library.config.agent.uar_model.load_failed', { error })}</p>
      ) : null}
      {!loading && !error && choices.length === 0 ? (
        <p className="text-warning text-xs">{t('library.config.agent.uar_model.no_available')}</p>
      ) : null}
      {unavailable ? (
        <p className="break-words text-warning text-xs">
          {t('library.config.agent.uar_model.unavailable', {
            model: value.source === 'uar' ? `${value.providerId}/${value.modelId}` : (value.modelId ?? legacyModelName),
            detail: selectedSource?.error ?? t('library.config.agent.uar_model.reconfigure')
          })}
        </p>
      ) : null}
      {!value && legacyModelName && !autoSelect && !loading ? (
        <p className={legacyRouteReady ? 'text-success text-xs' : 'text-warning text-xs'}>
          {t(
            legacyRouteReady
              ? 'library.config.agent.uar_model.legacy_ready'
              : 'library.config.agent.uar_model.legacy_repair',
            { model: legacyModelName }
          )}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigateTo('/settings/liter-llm', onSettingsNavigate)}>
          {t('library.config.agent.uar_model.configure_gateway')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => navigateTo('/settings/uar', onSettingsNavigate)}>
          {t('library.config.agent.uar_model.configure_uar')}
        </Button>
      </div>
    </div>
  )
}
