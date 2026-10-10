import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Textarea } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import type { UarReviewedModelPolicy } from '@shared/types/uarTeamModelPolicy'

import { UarTeamModelCost } from './UarTeamModelCost'

export function UarTeamReviewedModelPolicy({
  value,
  mode,
  disabled,
  onReview,
  onAccept,
  onError
}: {
  value?: UarReviewedModelPolicy
  mode?: 'reviewed' | 'manual'
  disabled: boolean
  onReview: (value: UarReviewedModelPolicy) => void
  onAccept: () => void
  onError: (error: unknown) => void
}) {
  const { t } = useTranslation(undefined, {
    keyPrefix: 'settings.prometheus.integration.uarAdmin.teams.authoring.modelPolicy'
  })
  const id = useId()
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const review = async () => {
    setBusy(true)
    try {
      onReview(await ipcApi.request('prometheus.uar.teams.review_model_policy', { source }))
      setSource('')
    } catch (error) {
      onError(error)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2" data-ui="team-authoring-model-policy">
      <label htmlFor={id} className="block text-sm font-medium">
        {t('title')}
      </label>
      <p id={id + '-help'} className="text-xs text-muted-foreground">
        {t('help')}
      </p>
      <Textarea.Input
        id={id}
        aria-describedby={id + '-help'}
        data-ui="team-authoring-model-policy-source"
        rows={3}
        maxLength={8 * 1024 * 1024}
        value={source}
        disabled={disabled || busy}
        onChange={(event) => setSource(event.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        data-ui="team-authoring-model-policy-import"
        disabled={disabled || busy || !source.trim()}
        onClick={() => void review()}>
        {t('import')}
      </Button>
      {value && (
        <div
          className="space-y-2 text-xs"
          data-ui="team-authoring-model-policy-receipt"
          data-policy-digest={value.digest}
          data-policy-source-digest={value.sourceDigest}
          data-policy-mode={mode ?? 'pending'}
          data-recommended-model={value.selection.modelId}>
          <p className="break-all">
            {t('recommendation')}: {value.selection.modelId}
          </p>
          <p>{value.result.explanation}</p>
          <UarTeamModelCost value={value} />
          <details>
            <summary className="cursor-pointer">{t('details')}</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all">{JSON.stringify(value.bindingTarget ? { result: value.result, bindingTarget: value.bindingTarget } : value.result, null, 2)}</pre>
          </details>
          {value.result.warnings.map((warning, index) => (
            <p key={index} className="text-warning-subtle-foreground">{warning}</p>
          ))}
          <p role="status">{t(mode === 'reviewed' ? 'accepted' : mode === 'manual' ? 'manual' : 'pending')}</p>
          <Button
            size="sm"
            variant="outline"
            data-ui="team-authoring-model-policy-accept"
            disabled={disabled || busy || mode === 'reviewed'}
            onClick={onAccept}>
            {t('accept')}
          </Button>
          <p className="break-all text-muted-foreground">
            {value.source} · {value.digest}
          </p>
        </div>
      )}
    </div>
  )
}
