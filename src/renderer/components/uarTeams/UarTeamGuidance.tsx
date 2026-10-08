import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Checkbox, Input, Textarea } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { uarGuidanceRoles, type UarGuidanceMapping, type UarReviewedGuidance } from '@shared/types/uarTeamGuidance'
import type { UarAuthoredTeam } from '@shared/types/uarTeams'

export function UarTeamGuidance({
  value,
  mappings,
  members,
  disabled,
  onReview,
  onApply,
  onError
}: {
  value?: UarReviewedGuidance
  mappings: UarGuidanceMapping[]
  members: UarAuthoredTeam['members']
  disabled: boolean
  onReview: (value: UarReviewedGuidance) => void
  onApply: (mappings: UarGuidanceMapping[]) => void
  onError: (error: unknown) => void
}) {
  const { t } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams.authoring.guidance' })
  const id = useId()
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<UarGuidanceMapping[]>([])
  const roles = value ? uarGuidanceRoles(value) : []
  const targets = selected.map((mapping) => mapping.memberRole)
  const valid =
    selected.length > 0 &&
    new Set(targets).size === targets.length &&
    targets.every((target) => target !== 'coordinator' && members.some((member) => member.role === target))
  const review = async () => {
    setBusy(true)
    try {
      onReview(await ipcApi.request('prometheus.uar.teams.review_guidance', { source }))
      setSource('')
      setSelected([])
    } catch (error) {
      onError(error)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3 border-t border-border-subtle pt-4" data-ui="team-authoring-guidance">
      <label htmlFor={id} className="block text-sm font-medium">
        {t('title')}
      </label>
      <p id={id + '-help'} className="text-xs text-muted-foreground">
        {t('help')}
      </p>
      <Textarea.Input
        id={id}
        aria-describedby={id + '-help'}
        data-ui="team-authoring-guidance-source"
        rows={3}
        maxLength={8 * 1024 * 1024}
        value={source}
        disabled={disabled || busy}
        onChange={(event) => setSource(event.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        data-ui="team-authoring-guidance-import"
        disabled={disabled || busy || !source.trim()}
        onClick={() => void review()}>
        {t('import')}
      </Button>
      {value && (
        <div
          className="space-y-3"
          data-ui="team-authoring-guidance-receipt"
          data-guidance-digest={value.digest}
          data-guidance-source-digest={value.sourceDigest}
          data-guidance-ready={value.result.ready === true}>
          <p className="text-xs" role="status">
            {t(value.result.ready ? 'ready' : 'incomplete')}
          </p>
          <p className="text-xs text-muted-foreground">{t('planning')}</p>
          {value.result.reasons?.map((reason, index) => (
            <p key={index} className="text-xs">{reason}</p>
          ))}
          {value.result.missing?.map((field) => (
            <p key={field} className="break-all text-xs">{field}</p>
          ))}
          <details data-ui="team-authoring-guidance-details">
            <summary className="cursor-pointer text-xs">{t('details')}</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all text-xs">{value.sourceJson}</pre>
          </details>
          {roles.map((role, index) => {
            const selection = selected.find((mapping) => mapping.sourceRole === role.id)
            const targetId = id + '-target-' + index
            return (
              <fieldset key={role.id} className="space-y-2" data-ui="team-authoring-guidance-role" data-source-role={role.id}>
                <legend className="text-sm font-medium">{role.id}</legend>
                <p className="text-xs">{role.description}</p>
                <pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(role, null, 2)}</pre>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    data-ui="team-authoring-guidance-select"
                    size="sm"
                    checked={Boolean(selection)}
                    disabled={disabled || busy || !value.result.ready}
                    onCheckedChange={(checked) =>
                      setSelected(checked === true
                        ? [...selected, { sourceRole: role.id, memberRole: role.id }]
                        : selected.filter((mapping) => mapping.sourceRole !== role.id))
                    }
                  />
                  {t('select')}
                </label>
                <label htmlFor={targetId} className="block text-xs">{t('target')}</label>
                <Input
                  id={targetId}
                  data-ui="team-authoring-guidance-target"
                  value={selection?.memberRole ?? role.id}
                  disabled={disabled || busy || !selection}
                  onChange={(event) =>
                    setSelected(selected.map((mapping) => mapping.sourceRole === role.id
                      ? { ...mapping, memberRole: event.target.value } : mapping))
                  }
                />
              </fieldset>
            )
          })}
          <p className="text-xs text-muted-foreground">{t('applyHelp')}</p>
          {selected.length > 0 && (
            <p className="break-all text-xs" data-ui="team-authoring-guidance-preview">{JSON.stringify(selected)}</p>
          )}
          <Button
            size="sm"
            variant="outline"
            data-ui="team-authoring-guidance-apply"
            disabled={disabled || busy || !value.result.ready || !valid}
            onClick={() => onApply(selected)}>
            {t('apply')}
          </Button>
          {mappings.length > 0 && (
            <pre className="whitespace-pre-wrap break-all text-xs" data-ui="team-authoring-guidance-mappings">
              {JSON.stringify(mappings, null, 2)}
            </pre>
          )}
          <p className="break-all text-xs text-muted-foreground">
            {value.source} · {value.sourceDigest} · {value.digest}
          </p>
        </div>
      )}
    </div>
  )
}
