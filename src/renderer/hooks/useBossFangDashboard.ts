import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useOptionalTabsContext } from '@renderer/hooks/tab'
import { toTransientMiniApp, useMiniAppPopup } from '@renderer/hooks/useMiniAppPopup'
import { ipcApi } from '@renderer/ipc'
import { loggerService } from '@renderer/services/LoggerService'
import { toast } from '@renderer/services/toast'

const logger = loggerService.withContext('BossFangDashboard')

export function useBossFangDashboard() {
  const { t } = useTranslation()
  const { openSmartMiniApp, openMiniAppKeepAlive } = useMiniAppPopup()
  const tabs = useOptionalTabsContext()
  const [opening, setOpening] = useState(false)

  const open = useCallback(async (): Promise<boolean> => {
    setOpening(true)
    try {
      const result = await ipcApi.request('bossfang.start')
      if (!result.success) {
        const key =
          result.reason === 'credentials_required'
            ? 'bossfang.credentialsRequired'
            : result.reason === 'external_unavailable'
              ? 'bossfang.externalUnavailable'
              : 'bossfang.startFailed'
        toast.error(t(key, { detail: result.message }))
        return false
      }
      const app = { appId: 'bossfang-dashboard', name: t('bossfang.title'), url: result.url }
      if (tabs?.openTab) openSmartMiniApp(app)
      else openMiniAppKeepAlive(toTransientMiniApp(app))
      return true
    } catch (error) {
      logger.error('Failed to open BossFang dashboard', error as Error)
      toast.error(t('bossfang.startFailed', { detail: error instanceof Error ? error.message : String(error) }))
      return false
    } finally {
      setOpening(false)
    }
  }, [openSmartMiniApp, openMiniAppKeepAlive, tabs, t])

  return { open, opening }
}
