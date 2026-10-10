import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const gateRequire = createRequire(join(process.cwd(), 'package.json'))
const cases = ['missing', 'empty', 'whitespace', 'approve', 'deny', 'reconnect', 'edited', 'cancel', 'unavailable']

async function main(): Promise<void> {
  if (!process.env.THE_BOSS_UAR_SIDECAR_PATH) throw new Error('THE_BOSS_UAR_SIDECAR_PATH is required')
  const requested = process.env.BAUAR_APPROVAL_CASES?.split(',').map((value) => value.trim())
  if (requested && (requested.some((value) => !cases.includes(value)) || new Set(requested).size !== requested.length)) {
    throw new Error('BAUAR_APPROVAL_CASES must select distinct authored approval scenarios')
  }
  const selected = requested ? cases.filter((scenario) => requested.includes(scenario)) : cases
  const cli = gateRequire.resolve('@playwright/test/cli')
  for (const scenario of selected) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [
        cli, 'test', '--config', 'tests/e2e/gates/playwright.config.ts',
        '--output', `tests/e2e/gates/artifacts/bauar-approval-client/${scenario}`
      ], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          THE_BOSS_E2E_GATE: 'uarExperienceGate.test.ts',
          BAUAR_APPROVAL_CASE: scenario
        },
        stdio: 'inherit'
      })
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        if (code === 0) resolve()
        else reject(new Error(`Approval case ${scenario} failed (${signal ?? code})`))
      })
    })
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
