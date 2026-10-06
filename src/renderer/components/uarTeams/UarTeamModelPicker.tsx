import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import type { UarModelSourceSnapshot } from '@shared/types/prometheusIntegration'
import type { UarTeamModelSelection } from '@shared/types/uarTeams'

interface Props {
  value?: UarTeamModelSelection
  disabled: boolean
  onChange: (value: UarTeamModelSelection | undefined) => void
}

export function UarTeamModelPicker({ value, disabled, onChange }: Props) {
  const { t } = useTranslation()
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams.execution' })
  const id = useId()
  const [snapshot, setSnapshot] = useState<UarModelSourceSnapshot>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      setSnapshot(await ipcApi.request('prometheus.uar.models.sources', {}))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const choices =
    snapshot?.sources.flatMap((source) => {
      if ((source.source !== 'gateway' && source.source !== 'uar') || !source.operational) return []
      const modelSource = source.source
      return source.providers
        .filter((provider) => provider.enabled)
        .flatMap((provider) =>
          provider.models
            .filter((model) => model.enabled)
            .map((model) => ({
              selection: {
                source: modelSource,
                providerId: provider.id,
                modelId: model.id
              } satisfies UarTeamModelSelection,
              name: provider.name + ' · ' + model.name
            }))
        )
    }) ?? []
  const selectedModel = snapshot?.sources
    .find((source) => source.source === value?.source)
    ?.providers.find((provider) => provider.id === value?.providerId)
    ?.models.find((model) => model.id === value?.modelId)
  const key = (model: UarTeamModelSelection) => JSON.stringify(model)
  return (
    <div className="mt-3 space-y-2" data-ui="uar-team-model-picker">
      <label htmlFor={id} className="block text-sm font-medium">
        {tr('model')}
      </label>
      <div className="flex gap-2">
        <Select
          value={value ? key(value) : 'planning'}
          disabled={disabled || loading}
          onValueChange={(selected) =>
            onChange(choices.find((choice) => key(choice.selection) === selected)?.selection)
          }>
          <SelectTrigger id={id} className="min-w-0 flex-1" aria-describedby={id + 'help'} data-ui="teams-model">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="planning">{tr('planningBinding')}</SelectItem>
            {choices.map((choice) => (
              <SelectItem
                key={key(choice.selection)}
                value={key(choice.selection)}
                data-model-source={choice.selection.source}
                data-provider-id={choice.selection.providerId}
                data-model-id={choice.selection.modelId}>
                {choice.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('common.refresh')}
          disabled={disabled || loading}
          onClick={() => void refresh()}>
          <RefreshCw size={14} aria-hidden="true" />
        </Button>
      </div>
      <p id={id + 'help'} className="text-xs text-muted-foreground">
        {tr('modelHelp')}
      </p>
      {value && (
        <div className="space-y-1 text-xs">
          <p className="break-all">
            {tr('route')}: {value.providerId} / {value.modelId}
          </p>
          {selectedModel?.executionProfile && (
            <p className="break-all">
              {tr('profile')}: {selectedModel.executionProfile.profile.id} · {tr('settingsRevision')}{' '}
              {selectedModel.executionProfile.settingsRevision}
            </p>
          )}
          <Badge variant="outline">
            {selectedModel?.executionProfile?.reasoning.mode === 'explicit'
              ? tr('reasoningExplicit')
              : tr('reasoningOff')}
          </Badge>
          <p className="text-warning-subtle-foreground">{tr('noGuaranteedFit')}</p>
        </div>
      )}
      {loading && (
        <p className="text-xs text-muted-foreground" role="status">
          {t('common.loading')}
        </p>
      )}
      {!loading && choices.length === 0 && <p className="text-xs text-muted-foreground">{tr('noModels')}</p>}
      {snapshot?.sources
        .filter((source) => source.source === 'gateway' && !source.operational)
        .map((source) => (
          <p key={source.instanceId} className="break-words text-xs text-error" role="alert">
            {source.error} {tr('noModels')}
          </p>
        ))}
      {error && (
        <p className="break-words text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
