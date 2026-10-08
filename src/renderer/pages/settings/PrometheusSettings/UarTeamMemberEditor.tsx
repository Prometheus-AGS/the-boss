import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Checkbox, Input, Textarea } from '@cherrystudio/ui'
import { UarTeamModelPicker } from '@renderer/components/uarTeams/UarTeamModelPicker'
import { UarTeamReviewedModelPolicy } from '@renderer/components/uarTeams/UarTeamReviewedModelPolicy'
import { ipcApi } from '@renderer/ipc'
import type { UarAuthoredTeam, UarTeamSkillCatalog } from '@shared/types/uarTeams'

type Member = UarAuthoredTeam['members'][number]
const tools: Member['tools'] = [
  'filesystem__glob',
  'filesystem__ls',
  'filesystem__grep',
  'filesystem__read',
  'filesystem__edit',
  'filesystem__write'
]

export function UarTeamMemberEditor({
  member,
  catalog,
  workspaceId,
  disabled,
  onChange,
  onRemove,
  onError
}: {
  member: Member
  catalog?: UarTeamSkillCatalog
  workspaceId: string
  disabled: boolean
  onChange: (value: Member) => void
  onRemove: () => void
  onError: (error: unknown) => void
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t('settings.prometheus.integration.uarAdmin.teams.authoring.' + key)
  const id = useId()
  const selectKnowledge = async () => {
    try {
      const paths = await ipcApi.request('prometheus.uar.teams.select_knowledge', { workspaceId })
      onChange({
        ...member,
        knowledge: [
          ...member.knowledge,
          ...paths
            .filter((path) => !member.knowledge.some((item) => item.path === path))
            .map((path) => ({ path, required: true }))
        ]
      })
    } catch (error) {
      onError(error)
    }
  }
  return (
    <fieldset
      disabled={disabled}
      className="space-y-3 border-t border-border-subtle pt-4"
      data-ui="team-authoring-member"
      data-role={member.role}>
      <legend className="px-1 text-sm font-medium">{member.role}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={id + '-role'} className="mb-1 block text-sm">
            {tr('role')}
          </label>
          <Input
            id={id + '-role'}
            value={member.role}
            disabled={disabled || member.role === 'coordinator'}
            onChange={(event) => onChange({ ...member, role: event.target.value })}
          />
        </div>
        <div>
          <label htmlFor={id + '-responsibility'} className="mb-1 block text-sm">
            {tr('responsibility')}
          </label>
          <Input
            id={id + '-responsibility'}
            value={member.responsibility}
            onChange={(event) => onChange({ ...member, responsibility: event.target.value })}
          />
        </div>
      </div>
      <label htmlFor={id + '-instructions'} className="block text-sm">
        {tr('memberInstructions')}
      </label>
      <Textarea.Input
        id={id + '-instructions'}
        data-ui="team-authoring-instructions"
        rows={3}
        value={member.instructions}
        onChange={(event) => onChange({ ...member, instructions: event.target.value })}
      />
      <UarTeamReviewedModelPolicy
        value={member.reviewedModelPolicy}
        mode={member.modelPolicyMode}
        disabled={disabled}
        onError={onError}
        onReview={(reviewedModelPolicy) => onChange({ ...member, reviewedModelPolicy, modelPolicyMode: undefined })}
        onAccept={() => {
          if (member.reviewedModelPolicy)
            onChange({ ...member, model: member.reviewedModelPolicy.selection, modelPolicyMode: 'reviewed' })
        }}
      />
      <UarTeamModelPicker
        value={member.model}
        disabled={disabled}
        onChange={(model) =>
          onChange({ ...member, model, ...(member.reviewedModelPolicy ? { modelPolicyMode: 'manual' as const } : {}) })
        }
      />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tr('tools')}</legend>
        <p className="text-xs text-muted-foreground">{tr('toolsHelp')}</p>
        <div className="flex flex-wrap gap-3">
          {tools.map((tool) => (
            <label key={tool} className="flex items-center gap-2 text-xs">
              <Checkbox
                size="sm"
                disabled={disabled || member.role === 'coordinator'}
                checked={member.tools.includes(tool)}
                onCheckedChange={(checked) =>
                  onChange({
                    ...member,
                    tools: checked === true ? [...member.tools, tool] : member.tools.filter((item) => item !== tool)
                  })
                }
              />
              {tr('tool.' + tool.replace('filesystem__', ''))}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tr('skills')}</legend>
        <p className="text-xs text-muted-foreground">{tr('skillsHelp')}</p>
        {!catalog && (
          <p className="text-xs text-muted-foreground" role="status">
            {tr('skillsUnavailable')}
          </p>
        )}
        {catalog?.entries.map((entry) => {
          const selected = member.skills.find(
            (skill) =>
              skill.id === entry.skillRef?.id &&
              skill.version === entry.skillRef.version &&
              skill.digest === entry.skillRef.digest
          )
          return (
            <div
              key={entry.skillId}
              className="space-y-1 text-xs"
              data-ui="team-authoring-skill"
              data-skill-id={entry.skillId}
              data-skill-digest={entry.skillRef?.digest}>
              <label className="flex items-start gap-2">
                <Checkbox
                  size="sm"
                  disabled={disabled || entry.availability !== 'available' || !entry.skillRef}
                  checked={Boolean(selected)}
                  onCheckedChange={(checked) => {
                    if (!entry.skillRef) return
                    onChange({
                      ...member,
                      skills:
                        checked === true
                          ? [...member.skills, entry.skillRef]
                          : member.skills.filter((skill) => skill !== selected)
                    })
                  }}
                />
                <span>
                  {entry.title} · {entry.skillRef?.version}
                  <span className="block text-muted-foreground">{entry.description}</span>
                </span>
              </label>
              {entry.availability !== 'available' && (
                <p className="text-warning-subtle-foreground">
                  {entry.reasons.map((reason) => tr('reason.' + reason)).join(' · ')}
                </p>
              )}
              {selected && (
                <div className="ms-6 space-y-1">
                  <p className="break-all text-muted-foreground">{selected.digest}</p>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      size="sm"
                      checked={selected.required}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        onChange({
                          ...member,
                          skills: member.skills.map((skill) =>
                            skill === selected ? { ...skill, required: checked === true } : skill
                          )
                        })
                      }
                    />
                    {tr('required')}
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() =>
                      onChange({ ...member, skills: member.skills.filter((skill) => skill !== selected) })
                    }>
                    {t('common.delete')}
                  </Button>
                </div>
              )}
            </div>
          )
        })}
        {member.skills
          .filter(
            (skill) =>
              !catalog?.entries.some(
                (entry) => entry.skillRef?.id === skill.id && entry.skillRef.digest === skill.digest
              )
          )
          .map((skill) => (
            <div key={skill.id} className="flex flex-wrap items-center gap-2 text-xs" role="alert">
              <span>
                {skill.id} · {tr('staleSkill')}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onChange({ ...member, skills: member.skills.filter((item) => item !== skill) })}>
                {t('common.delete')}
              </Button>
            </div>
          ))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tr('knowledge')}</legend>
        <p className="text-xs text-muted-foreground">{tr('knowledgeHelp')}</p>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || member.role === 'coordinator'}
          onClick={() => void selectKnowledge()}>
          {tr('chooseKnowledge')}
        </Button>
        {member.knowledge.map((item) => (
          <div key={item.path} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="break-all">{item.path}</span>
            <label className="flex items-center gap-2">
              <Checkbox
                size="sm"
                checked={item.required}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onChange({
                    ...member,
                    knowledge: member.knowledge.map((file) =>
                      file === item ? { ...file, required: checked === true } : file
                    )
                  })
                }
              />
              {tr('required')}
            </label>
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => onChange({ ...member, knowledge: member.knowledge.filter((file) => file !== item) })}>
              {t('common.delete')}
            </Button>
          </div>
        ))}
      </fieldset>
      {member.role !== 'coordinator' && (
        <Button size="sm" variant="outline" disabled={disabled} onClick={onRemove}>
          {tr('removeRole')}
        </Button>
      )}
    </fieldset>
  )
}
