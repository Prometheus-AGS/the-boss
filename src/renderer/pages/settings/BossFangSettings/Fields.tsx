import { useId } from 'react'

import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cherrystudio/ui'
export function Field({
  label,
  value,
  onChange,
  type = 'text',
  token,
  help
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'password' | 'number'
  token: string
  help?: string
}) {
  const id = useId()
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        data-ui={token}
        value={value}
        type={type}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={type === 'password' ? 'new-password' : 'off'}
        aria-describedby={help ? id + '-help' : undefined}
      />
      {help && (
        <p id={id + '-help'} className="text-sm text-muted-foreground">
          {help}
        </p>
      )}
    </div>
  )
}
export function Choice({
  label,
  value,
  onChange,
  options,
  token
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  token: string
}) {
  const id = useId()
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} data-ui={token}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((x) => (
            <SelectItem data-value={x.value} key={x.value} value={x.value}>
              {x.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
