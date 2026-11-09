import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

async function readDiscoveryJson(pathname: string): Promise<unknown> {
  try {
    const response = await fetch(`http://127.0.0.1:1906${pathname}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(2000)
    })
    if (!response.ok || !response.body) return undefined
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 1024 * 1024) {
        await reader.cancel()
        return undefined
      }
      text += decoder.decode(value, { stream: true })
    }
    return JSON.parse(text + decoder.decode()) as unknown
  } catch {
    return undefined
  }
}

/** Discovery is only a hint. Authentication and capability checks still gate use. */
export async function probeLocalUar(): Promise<'detected' | 'not-detected'> {
  const schema = await readDiscoveryJson('/.well-known/uar-config')
  if (schema && typeof schema === 'object') {
    const root = schema as { title?: unknown; properties?: Record<string, unknown>; $defs?: Record<string, unknown> }
    const server = root.$defs?.ServerConfig as { properties?: Record<string, unknown> } | undefined
    if (
      root.title === 'AppConfig' &&
      root.properties?.knowledge_bases &&
      root.properties?.native_tools &&
      root.properties?.skill_evolution &&
      server?.properties?.host &&
      server.properties.port
    )
      return 'detected'
  }
  const card =
    (await readDiscoveryJson('/.well-known/agent.json')) ?? (await readDiscoveryJson('/.well-known/agent-card.json'))
  if (card && typeof card === 'object') {
    const value = card as { name?: unknown; skills?: unknown }
    if (
      value.name === 'UAR Compiler Agent' &&
      Array.isArray(value.skills) &&
      value.skills.some(
        (skill: unknown) =>
          skill !== null && typeof skill === 'object' && (skill as { id?: unknown }).id === 'uar.compile'
      )
    )
      return 'detected'
  }
  return 'not-detected'
}

export async function prepareIngestionDirectory(dataRoot: string, configured: string): Promise<string> {
  if (configured && !path.isAbsolute(configured)) {
    throw new Error(`UAR ingestion directory requires an absolute path: ${configured}. Update it in UAR settings.`)
  }
  const directory = configured ? path.normalize(configured) : path.join(dataRoot, 'ingest')
  const probe = path.join(directory, `.boss-write-check-${randomUUID()}`)
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await writeFile(probe, '', { flag: 'wx', mode: 0o600 })
    await unlink(probe)
  } catch (error) {
    throw new Error(
      `UAR ingestion directory is not writable: ${directory}. Choose a writable directory in UAR settings.`,
      {
        cause: error
      }
    )
  }
  return directory
}
