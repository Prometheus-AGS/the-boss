import { defaultServiceInstances } from '@test-mocks/main/application'
import { MockMainPreferenceServiceUtils } from '@test-mocks/main/PreferenceService'
import type { MenuItemConstructorOptions } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BaseService } from '@main/core/lifecycle'
import { t } from '@main/i18n'

const { menu } = vi.hoisted(() => ({
  menu: {
    buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => ({ template })),
    setApplicationMenu: vi.fn()
  }
}))

vi.mock('electron', () => ({
  app: { name: 'Cherry Studio', getLocale: () => 'en-US', on: vi.fn(), off: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => null },
  Menu: menu
}))

import { AppMenuService } from '../AppMenuService'

const realPlatform = process.platform

describe('AppMenuService official website', () => {
  let service: AppMenuService

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    BaseService.resetInstances()
    MockMainPreferenceServiceUtils.resetMocks()
    service = new AppMenuService()
  })

  afterEach(async () => {
    await service._doDestroy()
    Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true })
  })

  it.each([
    ['zh-CN', 'https://cherryai.com.cn/docs'],
    ['zh-TW', 'https://cherryai.com.cn/docs'],
    ['en-US', 'https://cherryai.com/docs'],
    ['ja-JP', 'https://cherryai.com/docs']
  ] as const)('opens The Boss website and localized documentation for %s', async (language, docsUrl) => {
    MockMainPreferenceServiceUtils.setPreferenceValue('app.language', language)
    await service._doInit()
    const template = menu.buildFromTemplate.mock.calls.at(-1)?.[0] as MenuItemConstructorOptions[]
    const help = template.at(-1)?.submenu as MenuItemConstructorOptions[]

    for (const [label, url] of [
      [t('appMenu.website'), 'https://the-boss.know-me.tools'],
      [t('appMenu.documentation'), docsUrl]
    ]) {
      const item = help.find((entry) => entry.label === label)
      expect(item?.click).toBeTypeOf('function')
      item?.click?.(undefined as never, undefined, undefined as never)
      expect(defaultServiceInstances.MainWindowService.openWebsite).toHaveBeenCalledWith(url)
    }
  })
})
