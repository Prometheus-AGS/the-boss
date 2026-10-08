import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { UarTeamGuidance } from '@renderer/components/uarTeams/UarTeamGuidance'
import { uarTeamAuthoringError } from '@renderer/components/uarTeams/uarTeamError'
import { ipcApi } from '@renderer/ipc'
import { uarGuidanceRoles, type UarGuidanceMapping } from '@shared/types/uarTeamGuidance'
import {
  uarAuthoredTeamSchema,
  type UarAuthoredTeam,
  type UarAuthoredTeamRevision,
  type UarTeamAuthoringSnapshot,
  type UarTeamSkillCatalog
} from '@shared/types/uarTeams'

import { UarTeamMemberEditor } from './UarTeamMemberEditor'

export function UarTeamAuthoringPanel({
  workspaceId,
  onChanged
}: {
  workspaceId: string
  onChanged: () => Promise<void>
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t('settings.prometheus.integration.uarAdmin.teams.authoring.' + key)
  const navigate = useNavigate()
  const id = useId()
  const [snapshot, setSnapshot] = useState<UarTeamAuthoringSnapshot>()
  const [catalog, setCatalog] = useState<UarTeamSkillCatalog>()
  const [draft, setDraft] = useState<UarAuthoredTeam>()
  const [saved, setSaved] = useState<UarAuthoredTeamRevision>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [skillError, setSkillError] = useState<string>()
  const [deployed, setDeployed] = useState<string>()
  const report = (cause: unknown) =>
    setError(uarTeamAuthoringError(cause instanceof Error ? cause.message : String(cause), tr))
  const refresh = useCallback(async () => {
    try {
      setSnapshot(await ipcApi.request('prometheus.uar.teams.authoring', {}))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    try {
      setCatalog(await ipcApi.request('prometheus.uar.teams.skills', {}))
      setSkillError(undefined)
    } catch (cause) {
      setSkillError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const dirty = draft && JSON.stringify(draft) !== JSON.stringify(saved?.team)
  const valid = draft && uarAuthoredTeamSchema.safeParse(draft).success
  const save = async () => {
    if (!draft || busy) return
    setBusy(true)
    setError(undefined)
    setDeployed(undefined)
    try {
      const next = await ipcApi.request('prometheus.uar.teams.save_authoring', {
        team: draft,
        expectedRevision: saved?.revision ?? 0
      })
      setSaved(next)
      setDraft(next.team)
      await refresh()
    } catch (cause) {
      report(cause)
    } finally {
      setBusy(false)
    }
  }
  const deploy = async () => {
    if (!saved || dirty || busy) return
    setBusy(true)
    setError(undefined)
    try {
      const binding = await ipcApi.request('prometheus.uar.teams.deploy_authored', {
        workspaceId,
        teamId: saved.team.id,
        revision: saved.revision
      })
      setDeployed(binding.id)
      await onChanged()
    } catch (cause) {
      report(cause)
    } finally {
      setBusy(false)
    }
  }
  const applyGuidance = (mappings: UarGuidanceMapping[]) => {
    if (!draft?.reviewedGuidance) return
    const roles = uarGuidanceRoles(draft.reviewedGuidance)
    const members = [...draft.members]
    for (const mapping of mappings) {
      const proposal = roles.find((role) => role.id === mapping.sourceRole)
      if (!proposal || mapping.memberRole === 'coordinator') return
      const index = members.findIndex((member) => member.role === mapping.memberRole)
      if (index < 0) return
      members[index] = {
        ...members[index],
        responsibility: proposal.description,
        instructions: proposal.prompt,
        modelPolicyMode: 'manual' as const
      }
    }
    setDraft({ ...draft, members, guidanceMappings: mappings })
  }
  return (
    <SettingGroup data-ui="team-authoring">
      <SettingTitle>{tr('title')}</SettingTitle>
      <SettingDescription>{tr('help')}</SettingDescription>
      <div className="mt-4 flex flex-wrap gap-2">
        {snapshot?.templates.map((template) => (
          <Button
            key={template.template}
            size="sm"
            variant="outline"
            disabled={busy}
            data-ui={'team-authoring-new-' + template.template}
            onClick={() => {
              setDraft({ ...template, id: crypto.randomUUID() })
              setSaved(undefined)
              setError(undefined)
              setDeployed(undefined)
            }}>
            {tr(template.template)}
          </Button>
        ))}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void refresh()}>
          {t('common.refresh')}
        </Button>
      </div>
      <div className="mt-3 space-y-1">
        <label htmlFor={id + '-revision'} className="block text-sm font-medium">
          {tr('savedTeams')}
        </label>
        <Select
          value={saved ? saved.team.id + ':' + saved.revision : ''}
          disabled={busy}
          onValueChange={(value) => {
            const selected = snapshot?.revisions.find((item) => item.team.id + ':' + item.revision === value)
            if (selected) {
              setSaved(selected)
              setDraft(structuredClone(selected.team))
              setDeployed(undefined)
              setError(undefined)
            }
          }}>
          <SelectTrigger id={id + '-revision'} data-ui="team-authoring-select">
            <SelectValue placeholder={tr('chooseTeam')} />
          </SelectTrigger>
          <SelectContent>
            {snapshot?.revisions.map((item) => (
              <SelectItem
                key={item.team.id + ':' + item.revision}
                value={item.team.id + ':' + item.revision}
                data-authored-team-id={item.team.id}
                data-authored-revision={item.revision}>
                {item.team.title} · {item.package.version}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {draft && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={id + '-title'} className="mb-1 block text-sm font-medium">
                {tr('name')}
              </label>
              <Input
                id={id + '-title'}
                data-ui="team-authoring-name"
                value={draft.title}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </div>
            <div>
              <label htmlFor={id + '-purpose'} className="mb-1 block text-sm font-medium">
                {tr('purpose')}
              </label>
              <Input
                id={id + '-purpose'}
                data-ui="team-authoring-purpose"
                value={draft.purpose}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, purpose: event.target.value })}
              />
            </div>
          </div>
          <label htmlFor={id + '-shared'} className="block text-sm font-medium">
            {tr('sharedInstructions')}
          </label>
          <Textarea.Input
            id={id + '-shared'}
            data-ui="team-authoring-shared"
            rows={3}
            value={draft.instructions}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
          />
          <p className="text-xs text-muted-foreground">{tr('scopeHelp')}</p>
          <UarTeamGuidance
            key={draft.reviewedGuidance?.digest ?? 'empty'}
            value={draft.reviewedGuidance}
            mappings={draft.guidanceMappings ?? []}
            members={draft.members}
            disabled={busy}
            onError={report}
            onReview={(reviewedGuidance) => setDraft({ ...draft, reviewedGuidance, guidanceMappings: [] })}
            onApply={applyGuidance}
          />
          {draft.members.map((member, index) => {
            const mapping = draft.guidanceMappings?.find((item) => item.memberRole === member.role)
            const guidanceRole = draft.reviewedGuidance && mapping
              ? uarGuidanceRoles(draft.reviewedGuidance).find((role) => role.id === mapping.sourceRole)
              : undefined
            return <UarTeamMemberEditor
              key={index}
              member={member}
              catalog={catalog}
              workspaceId={workspaceId}
              guidanceRole={guidanceRole}
              disabled={busy}
              onError={report}
              onChange={(next) =>
                setDraft({
                  ...draft,
                  members: draft.members.map((item, at) => (at === index ? next : item)),
                  ...(draft.guidanceMappings ? {
                    guidanceMappings: draft.guidanceMappings.map((item) => item.memberRole === member.role
                      ? { ...item, memberRole: next.role } : item)
                  } : {})
                })
              }
              onRemove={() => setDraft({
                ...draft,
                members: draft.members.filter((_, at) => at !== index),
                ...(draft.guidanceMappings ? {
                  guidanceMappings: draft.guidanceMappings.filter((item) => item.memberRole !== member.role)
                } : {})
              })}
            />
          })}
          <Button
            size="sm"
            variant="outline"
            disabled={busy || draft.members.length >= 6}
            onClick={() =>
              setDraft({
                ...draft,
                members: [
                  ...draft.members,
                  {
                    role: 'member-' + draft.members.length,
                    responsibility: '',
                    instructions: '',
                    tools: [],
                    skills: [],
                    knowledge: []
                  }
                ]
              })
            }>
            {tr('addRole')}
          </Button>
          {!valid && (
            <p className="text-xs text-muted-foreground" role="status">
              {tr('incomplete')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button data-ui="team-authoring-save" disabled={busy || !dirty || !valid} onClick={() => void save()}>
              {busy ? t('common.loading') : tr(saved ? 'saveRevision' : 'save')}
            </Button>
            <Button
              variant="outline"
              data-ui="team-authoring-deploy"
              disabled={
                busy ||
                !saved ||
                Boolean(dirty) ||
                draft.members.some((member) => !member.model || (member.reviewedModelPolicy && !member.modelPolicyMode))
              }
              onClick={() => void deploy()}>
              {tr('deploy')}
            </Button>
            <Button
              variant="ghost"
              data-ui="team-authoring-work"
              disabled={!deployed || busy}
              onClick={() => void navigate({ to: '/app/agents', search: { mode: 'teams', workspaceId } })}>
              {tr('openWork')}
            </Button>
          </div>
          {saved && (
            <p
              className="break-all text-xs text-muted-foreground"
              data-ui="team-authoring-identity"
              data-definition-digest={saved.definition.digest}
              data-package-digest={saved.package.digest}>
              {saved.package.version} · {saved.definition.digest}
              <br />
              {saved.package.digest}
            </p>
          )}
          {deployed && (
            <p
              role="status"
              className="break-all text-sm text-success"
              data-ui="team-authoring-deployed"
              data-binding-id={deployed}>
              {tr('deployed')} · {deployed}
            </p>
          )}
        </div>
      )}
      {skillError && (
        <p role="status" className="mt-3 break-words text-xs text-warning-subtle-foreground">
          {tr('skillsUnavailable')} · {skillError}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 break-words text-sm text-error">
          {error}
        </p>
      )}
    </SettingGroup>
  )
}
