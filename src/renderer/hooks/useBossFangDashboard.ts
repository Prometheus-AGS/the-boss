import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMiniAppPopup } from '@renderer/hooks/useMiniAppPopup'
import { ipcApi } from '@renderer/ipc'
import { loggerService } from '@renderer/services/LoggerService'
import { toast } from '@renderer/services/toast'

const logger = loggerService.withContext('BossFangDashboard')

export function useBossFangDashboard() {
  const { t } = useTranslation()
  const { openSmartMiniApp } = useMiniAppPopup()
  const [opening, setOpening] = useState(false)

  const open = useCallback(async (): Promise<boolean> => {
    setOpening(true)
    try {
      const result = await ipcApi.request('bossfang.start')
      if (!result.success) {
        const key = result.reason === 'credentials_required' ? 'bossfang.credentialsRequired' : 'bossfang.startFailed'
        toast.error(t(key, { detail: result.message }))
        return false
      }
      openSmartMiniApp({ appId: 'bossfang-dashboard', name: t('bossfang.title'), url: result.url })
      return true
    } catch (error) {
      logger.error('Failed to open BossFang dashboard', error as Error)
      toast.error(t('bossfang.startFailed', { detail: error instanceof Error ? error.message : String(error) }))
      return false
    } finally {
      setOpening(false)
    }
  }, [openSmartMiniApp, t])

  return { open, opening }
}
