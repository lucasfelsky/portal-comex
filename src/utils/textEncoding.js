export const MOJIBAKE_PATTERN_FRONTEND = /[A-Za-z0-9][\u00c3\u00c2\u00e2][^\s]/
const MOJIBAKE_PATTERN = MOJIBAKE_PATTERN_FRONTEND
const MOJIBAKE_GLOBAL_PATTERN = new RegExp(MOJIBAKE_PATTERN_FRONTEND.source, 'g')

function countMojibakeMarkers(value) {
  const matches = String(value ?? '').match(MOJIBAKE_GLOBAL_PATTERN)
  return matches?.length ?? 0
}

export function repairTextEncoding(value) {
  if (typeof value !== 'string') return value
  if (!MOJIBAKE_PATTERN.test(value)) return value

  try {
    const bytes = Uint8Array.from(Array.from(value, (char) => char.charCodeAt(0) & 0xff))
    const repaired = new TextDecoder('utf-8', { fatal: false }).decode(bytes)

    if (!repaired) return value
    if (countMojibakeMarkers(repaired) > countMojibakeMarkers(value)) return value

    return repaired
  } catch {
    return value
  }
}
