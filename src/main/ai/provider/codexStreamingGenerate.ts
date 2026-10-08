/** Codex's Responses endpoint requires streaming even for AI SDK doGenerate calls. */
export function codexStreamingGenerateBody(body: BodyInit | null | undefined): {
  body: BodyInit | null | undefined
  collectResponse: boolean
} {
  if (typeof body !== 'string') return { body, collectResponse: false }

  let request: unknown
  try {
    request = JSON.parse(body)
  } catch {
    return { body, collectResponse: false }
  }
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { body, collectResponse: false }
  }
  const json = request as Record<string, unknown>
  if (json.stream !== false && json.stream !== undefined) return { body, collectResponse: false }

  return { body: JSON.stringify({ ...json, stream: true }), collectResponse: true }
}

/** Return the completed Responses object as JSON so the SDK retains its V3 parsing. */
export async function codexStreamingGenerateResponse(response: Response): Promise<Response> {
  if (!response.ok) return response

  const events = (await response.text()).split(/\r?\n\r?\n/)
  const completedItems = new Map<number, unknown>()
  for (const frame of events) {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (!data || data === '[DONE]') continue

    const event = JSON.parse(data) as {
      type?: string
      output_index?: number
      item?: unknown
      response?: { output?: unknown[]; error?: { code?: string } }
      error?: { code?: string }
    }
    if (event.type === 'response.output_item.done' && event.output_index !== undefined && event.item !== undefined) {
      completedItems.set(event.output_index, event.item)
    }
    if (event.type === 'response.failed' || event.type === 'error') {
      const code = event.response?.error?.code ?? event.error?.code
      throw new Error(
        typeof code === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(code)
          ? `Codex response stream failed (${code})`
          : 'Codex response stream failed'
      )
    }
    if (event.type !== 'response.completed' && event.type !== 'response.incomplete') continue
    if (!event.response) throw new Error('Codex response stream ended without a response object')

    // Codex can omit output[] from the terminal event even after emitting completed items.
    const output = event.response.output?.length
      ? event.response.output
      : [...completedItems].sort(([left], [right]) => left - right).map(([, item]) => item)

    const headers = new Headers(response.headers)
    headers.set('content-type', 'application/json')
    headers.delete('content-length')
    headers.delete('content-encoding')
    return new Response(JSON.stringify({ ...event.response, output }), {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  }

  throw new Error('Codex response stream ended without a final response')
}
