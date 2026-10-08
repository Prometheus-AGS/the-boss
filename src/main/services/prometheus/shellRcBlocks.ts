const startMarker = '# The Boss managed commands'
const endMarker = '# End The Boss managed commands'

type BlockRange = { start: number; end: number; contentEnd: number }

function ranges(bytes: Buffer): BlockRange[] {
  const found: BlockRange[] = []
  let opened: number | undefined
  for (let offset = 0; offset < bytes.length;) {
    const newline = bytes.indexOf(10, offset)
    const end = newline < 0 ? bytes.length : newline + 1
    let contentEnd = newline < 0 ? end : newline
    if (contentEnd > offset && bytes[contentEnd - 1] === 13) contentEnd--
    const line = bytes.subarray(offset, contentEnd).toString('utf8')
    if (line === startMarker) {
      if (opened !== undefined) throw new Error('Shell startup file has nested managed markers; no changes made')
      opened = offset
    } else if (line === endMarker) {
      if (opened === undefined) throw new Error('Shell startup file has an unmatched managed marker; no changes made')
      found.push({ start: opened, end, contentEnd })
      opened = undefined
    } else if (/^(?:#\s*)?(?:End )?The Boss managed/.test(line.trimStart())) {
      throw new Error('Shell startup file has a torn managed marker; no changes made')
    }
    offset = end
  }
  if (opened !== undefined) throw new Error('Shell startup file has an unmatched managed marker; no changes made')
  return found
}

function blockBytes(block: string): Buffer {
  const bytes = Buffer.from(block, 'utf8')
  const blocks = ranges(bytes)
  if (blocks.length !== 1 || blocks[0].start !== 0 || blocks[0].end !== bytes.length) {
    throw new Error('Invalid shell managed block')
  }
  return bytes.subarray(0, blocks[0].contentEnd)
}

export function containsManagedBlock(bytes: Buffer, block: string): boolean {
  const expected = blockBytes(block)
  const blocks = ranges(bytes)
  return blocks.length === 1 && bytes.subarray(blocks[0].start, blocks[0].contentEnd).equals(expected)
}

export function replaceManagedBlocks(bytes: Buffer, block: string | null): Buffer {
  const expected = block === null ? null : blockBytes(block)
  const blocks = ranges(bytes)
  if (blocks.length === 0) {
    if (expected === null) return bytes
    const separator = bytes.length > 0 && bytes[bytes.length - 1] !== 10 ? Buffer.from('\n') : Buffer.alloc(0)
    return Buffer.concat([bytes, separator, expected, Buffer.from('\n')])
  }
  if (expected !== null && blocks.length === 1 && containsManagedBlock(bytes, block!)) return bytes
  const parts: Buffer[] = []
  let offset = 0
  blocks.forEach((range, index) => {
    parts.push(bytes.subarray(offset, range.start))
    if (index === 0 && expected !== null) {
      parts.push(expected, bytes.subarray(range.contentEnd, range.end))
    }
    offset = range.end
  })
  parts.push(bytes.subarray(offset))
  return Buffer.concat(parts)
}
