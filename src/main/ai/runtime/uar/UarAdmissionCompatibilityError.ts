import { t } from '@main/i18n'

export const UAR_TOOL_ADMISSION_V2_CAPABILITY = 'tool_admission_v2'

export class UarAdmissionCompatibilityError extends Error {
  constructor(version: string) {
    super(t('uar.toolAdmissionV2Required', { version }))
  }
}
