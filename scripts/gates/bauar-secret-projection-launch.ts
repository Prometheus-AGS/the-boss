import assert from 'node:assert/strict'

import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'

export async function launchProjectionDesktop(profile: string, sidecar: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, NODE_ENV: 'development', CS_DEV_USER_DATA_SUFFIX: profile, THE_BOSS_UAR_SIDECAR_PATH: sidecar },
    timeout: 60_000
  })
  try {
    let page: Page | undefined
    await expect.poll(() => {
      page = app.windows().find((candidate) => candidate.url().includes('/windows/main/index.html'))
      return Boolean(page)
    }, { timeout: 60_000 }).toBe(true)
    assert(page)
    await page.locator('#root').waitFor({ state: 'visible', timeout: 60_000 })
    return { app, page }
  } catch (error) {
    await app.close()
    throw error
  }
}
