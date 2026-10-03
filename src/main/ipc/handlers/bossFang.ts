import { application } from '@application'
import type { bossFangRequestSchemas } from '@shared/ipc/schemas/bossFang'
import type { IpcHandlersFor } from '@shared/ipc/types'
import { redactSecretText } from '@shared/utils/redaction'

export const bossFangHandlers: IpcHandlersFor<typeof bossFangRequestSchemas> = {
  'bossfang.start': () => application.get('BossFangService').start(),
  'bossfang.status': () => application.get('BossFangService').getStatus(),
  'bossfang.configure_credentials': async (input) => {
    await application.get('BossFangService').configureCredentials(input)
    return { success: true }
  },
  'bossfang.stop': async () => {
    try {
      await application.get('BossFangService').stop()
      return { success: true }
    } catch (error) {
      return { success: false, message: redactSecretText(error instanceof Error ? error.message : String(error)) }
    }
  }
}
