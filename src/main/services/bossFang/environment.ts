import { randomBytes } from 'node:crypto'
import path from 'node:path'

import { parse as parseToml } from 'smol-toml'

import { loggerService } from '@logger'
import { mergeBinaryExecutionEnv, mergePathSuffixes } from '@main/utils/binaryEnv'
import { resolveClaudeExecutablePath } from '@main/utils/claudeExecutable'
import { getPathFromEnvironment, getShellEnv } from '@main/utils/shellEnv'

const logger = loggerService.withContext('BossFangEnvironment')

export async function buildManagedEnvironment(
  directory: string,
  dashboardPassword: string,
  nativeConfig: string
): Promise<NodeJS.ProcessEnv> {
  let configuredApiKey: unknown
  try {
    configuredApiKey = parseToml(nativeConfig).api_key
  } catch {
    // Parser diagnostics can contain source lines with credentials.
    throw new Error('BossFang configuration could not be parsed')
  }
  const hasConfiguredApiKey = typeof configuredApiKey === 'string' && configuredApiKey.trim().length > 0
  const shellEnv = await getShellEnv()
  // Capture executable lookup without importing unrelated login-shell credentials.
  let env = mergeBinaryExecutionEnv({
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined &&
          entry[0].toLowerCase() !== 'path' &&
          !entry[0].startsWith('LIBREFANG_') &&
          !['LITER_LLM_MASTER_KEY', 'KNOW_ME_GITOPS_TOKEN'].includes(entry[0]) &&
          !/(_API_KEY|_API_TOKEN|_ACCESS_TOKEN|_SECRET_KEY)$/.test(entry[0])
      )
    ),
    PATH: getPathFromEnvironment(shellEnv) ?? ''
  })
  try {
    // Explicit native provider paths and installed CLIs retain precedence over the bundled fallback.
    env = mergePathSuffixes(env, [path.dirname(resolveClaudeExecutablePath())])
  } catch (error) {
    logger.warn('Bundled Claude executable unavailable; using configured executable or shell PATH', { error })
  }
  return {
    ...env,
    LIBREFANG_HOME: directory,
    LIBREFANG_DASHBOARD_PASS: dashboardPassword,
    // Native loading resolves literal keys and vault references without an overriding env key.
    ...(!hasConfiguredApiKey ? { LIBREFANG_API_KEY: randomBytes(32).toString('hex') } : {})
  }
}
