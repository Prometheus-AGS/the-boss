import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Textarea } from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { UarTeamModelPicker } from '@renderer/components/uarTeams/UarTeamModelPicker'
import { ipcApi } from '@renderer/ipc'
import type { UarTeamModelSelection } from '@shared/types/uarTeams'
import { IntegrationChoice, IntegrationField } from './IntegrationFields'

type Preview = Awaited<ReturnType<typeof ipcApi.request<'prometheus.uar.representation.preview_role'>>>
const offices = ['ceo', 'cfo', 'cio', 'intelligence', 'security', 'marketing', 'product', 'custom']

export function UarExecutiveRoleCatalogPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`settings.prometheus.integration.uarAdmin.representation.${key}`)
  const id = useId()
  const [preset, setPreset] = useState('ceo')
  const [customOffice, setCustomOffice] = useState('custom-office')
  const [title, setTitle] = useState('')
  const [purpose, setPurpose] = useState('')
  const [instructions, setInstructions] = useState('')
  const [model, setModel] = useState<UarTeamModelSelection>()
  const [preview, setPreview] = useState<Preview>()
  const [bindingId, setBindingId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const office = preset === 'custom' ? customOffice : preset
  const input = { workspaceId, office, title, purpose, instructions }
  const change = (set: (value: string) => void) => (value: string) => {
    set(value); setPreview(undefined); setBindingId('')
  }
  const review = async () => {
    setBusy(true); setError(undefined); setBindingId('')
    try { setPreview(await ipcApi.request('prometheus.uar.representation.preview_role', input)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const install = async () => {
    if (!preview || !model || model.source !== 'uar' || !window.confirm(tr('catalog.installConfirm'))) return
    setBusy(true); setError(undefined)
    try {
      const binding = await ipcApi.request('prometheus.uar.representation.install_role', {
        ...input, reviewedDigest: preview.identity.digest,
        model: { ...model, source: 'uar' }
      })
      setBindingId(binding.id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  return <SettingGroup data-ui="uar-office-role-catalog">
    <SettingTitle>{tr('catalog.title')}</SettingTitle>
    <SettingDescription>{tr('catalog.help')}</SettingDescription>
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <IntegrationChoice label={tr('officePreset')} value={preset} onChange={change(setPreset)} disabled={busy}
        options={offices.map((value) => ({ value, label: tr(value === 'custom' ? 'custom' : `office.${value}`) }))} />
      {preset === 'custom' && <IntegrationField label={tr('catalog.slug')} value={customOffice} onChange={change(setCustomOffice)} disabled={busy} />}
      <IntegrationField label={tr('catalog.name')} value={title} onChange={change(setTitle)} disabled={busy} />
      <IntegrationField label={tr('purpose')} value={purpose} onChange={change(setPurpose)} disabled={busy} />
    </div>
    <label htmlFor={id} className="mt-4 block text-sm font-medium">{tr('catalog.instructions')}</label>
    <Textarea.Input id={id} className="mt-2" value={instructions} disabled={busy}
      onValueChange={change(setInstructions)} />
    <p className="mt-2 text-xs text-muted-foreground">{tr('catalog.authoringHelp')}</p>
    <Button className="mt-4" variant="outline" disabled={busy || !purpose.trim() || !office.trim() ||
      (preset === 'custom' && (!title.trim() || !instructions.trim()))} onClick={() => void review()}>{tr('catalog.review')}</Button>
    {preview && <div className="mt-4 space-y-3">
      <p className="break-all font-mono text-xs">{preview.identity.id}<br />{preview.identity.digest}</p>
      <details className="rounded-md border border-border p-3">
        <summary className="cursor-pointer text-sm">{tr('catalog.document')}</summary>
        <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({
          manifest: JSON.parse(preview.manifest), definitions: Object.fromEntries(
            Object.entries(preview.files).map(([path, source]) => [path, JSON.parse(source)]))
        }, null, 2)}</pre>
      </details>
      <UarTeamModelPicker value={model} disabled={busy} onChange={(value) => { setModel(value); setBindingId('') }} />
      <p className="text-xs text-muted-foreground">{tr('catalog.modelHelp')}</p>
      <Button disabled={busy || !model || model.source !== 'uar'} onClick={() => void install()}>{tr('catalog.install')}</Button>
    </div>}
    {bindingId && <p className="mt-4 break-all text-sm" role="status">{tr('catalog.installed')}<br />{bindingId}</p>}
    {error && <p className="mt-3 break-words text-sm text-error" role="alert">{error}</p>}
  </SettingGroup>
}
