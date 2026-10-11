import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { isLinux, isWin } from '@main/core/platform'

import { toAsarUnpackedPath } from './asar'

const require_ = createRequire(import.meta.url)

export function resolveClaudeExecutablePath(): string {
  const sdkRequire = createRequire(require_.resolve('@anthropic-ai/claude-agent-sdk'))
  const extension = isWin ? '.exe' : ''
  const nativePackages = isLinux
    ? [
        `@anthropic-ai/claude-agent-sdk-linux-${process.arch}-musl`,
        `@anthropic-ai/claude-agent-sdk-linux-${process.arch}`
      ]
    : [`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`]

  for (const packageName of nativePackages) {
    try {
      const packageDirectory = path.dirname(sdkRequire.resolve(`${packageName}/package.json`))
      const executable = path.join(toAsarUnpackedPath(packageDirectory), `claude${extension}`)
      if (fs.existsSync(executable)) return executable
    } catch {
      // Optional native packages are platform-specific; try the next candidate.
    }
  }

  throw new Error(
    `Claude Code native binary not found for ${process.platform}-${process.arch}. Reinstall @anthropic-ai/claude-agent-sdk with optional dependencies.`
  )
}

