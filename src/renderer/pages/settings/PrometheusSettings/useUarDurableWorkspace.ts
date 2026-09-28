import { useCallback, useEffect, useState } from 'react'

import { ipcApi } from '@renderer/ipc'
import type { UarDurableWorkspaceSnapshot } from '@shared/types/uarDurableAdministration'

export function useUarDurableWorkspace(workspaceId: string) {
  const [snapshot, setSnapshot] = useState<UarDurableWorkspaceSnapshot>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [refreshRequired, setRefreshRequired] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const next = await ipcApi.request('prometheus.uar.durable.read', { workspaceId })
      setSnapshot(next)
      setRefreshRequired(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setRefreshRequired(true)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async <T>(operation: () => Promise<T>, successMessage: string, onSuccess?: (result: T) => void) => {
    setBusy(true)
    setError(undefined)
    setStatus(undefined)
    try {
      const result = await operation()
      const next = await ipcApi.request('prometheus.uar.durable.read', { workspaceId })
      setSnapshot(next)
      onSuccess?.(result)
      setStatus(successMessage)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setRefreshRequired(true)
    } finally {
      setBusy(false)
    }
  }

  return { snapshot, loading, busy, error, status, refreshRequired, refresh, run }
}
