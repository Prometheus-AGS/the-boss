import { application } from '@application'
import type { bossFangRequestSchemas } from '@shared/ipc/schemas/bossFang'
import type { IpcHandlersFor } from '@shared/ipc/types'
import { redactSecretText } from '@shared/utils/redaction'
export const bossFangHandlers: IpcHandlersFor<typeof bossFangRequestSchemas> = {
  'bossfang.start': () => application.get('BossFangService').start(),
  'bossfang.status': () => application.get('BossFangService').getStatus(),
  'bossfang.configure': (input) => application.get('BossFangService').configure(input),
  'bossfang.configure_credentials': async (input) => {
    await application.get('BossFangService').configureCredentials(input)
    return { success: true }
  },
  'bossfang.restart': () => application.get('BossFangService').restart(),
  'bossfang.stop': async () => {
    try {
      await application.get('BossFangService').stop()
      return { success: true }
    } catch (error) {
      return { success: false, message: redactSecretText(error instanceof Error ? error.message : String(error)) }
    }
  },
  'bossfang.connect': () => application.get('BossFangService').connect(),
  'bossfang.disconnect': () => application.get('BossFangService').disconnect(),
  'bossfang.models': () => application.get('BossFangService').models(),
  'bossfang.diagnostic.start': ({ model }) => application.get('BossFangService').diagnostics.start(model),
  'bossfang.diagnostic.status': ({ id }) => application.get('BossFangService').diagnostics.restore(id),
  'bossfang.diagnostic.cancel': ({ id }) => application.get('BossFangService').diagnostics.cancel(id),
  'bossfang.diagnostic.export': async ({ id }, { senderId }) => {
    if (!senderId) throw new Error('Diagnostic export requires an application window')
    return application
      .get('BossFangService')
      .exportLogs(senderId, id ? await application.get('BossFangService').diagnostics.restore(id) : undefined)
  }
}
