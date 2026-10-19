import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMiniAppPopup } from '@renderer/hooks/useMiniAppPopup'
import { useWindowFrame } from '@renderer/hooks/useWindowFrame'
import { ipcApi } from '@renderer/ipc'
import { loggerService } from '@renderer/services/LoggerService'
import { popup } from '@renderer/services/popup'
import { toast } from '@renderer/services/toast'

const logger = loggerService.withContext('BossFangDashboard')

export function useBossFangDashboard() {
  const { t } = useTranslation()
  const { openSmartMiniApp } = useMiniAppPopup()
  const { mode } = useWindowFrame()
  const [opening, setOpening] = useState(false)

  const open = useCallback(async (): Promise<boolean> => {
    setOpening(true)
    try {
      if (!customElements.get('webview')) {
        const reload = await popup.confirm({
          title: t('bossfang.dashboardReloadRequired'),
          content: t('bossfang.dashboardReloadHelp'),
          okText: t('bossfang.reloadWindow'),
          cancelText: t('common.cancel')
        })
        if (reload) {
          if (mode === 'window') window.location.reload()
          else await ipcApi.request('window.main.reload')
        }
        return false
      }
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
      openSmartMiniApp(app)
      return true
    } catch (error) {
      logger.error('Failed to open BossFang dashboard', error as Error)
      toast.error(t('bossfang.startFailed', { detail: error instanceof Error ? error.message : String(error) }))
      return false
    } finally {
      setOpening(false)
    }
  }, [openSmartMiniApp, mode, t])

  return { open, opening }
}
