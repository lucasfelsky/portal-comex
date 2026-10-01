export const MOJIBAKE_PATTERN_FRONTEND = /[A-Za-z0-9][\u00c3\u00c2\u00e2][^\s]/
const MOJIBAKE_PATTERN = MOJIBAKE_PATTERN_FRONTEND
const MOJIBAKE_GLOBAL_PATTERN = new RegExp(MOJIBAKE_PATTERN_FRONTEND.source, 'g')

function countMojibakeMarkers(value) {
  const matches = String(value ?? '').match(MOJIBAKE_GLOBAL_PATTERN)
  return matches?.length ?? 0
}

const NAMED_HTML_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  middot: '·',
  bull: '•',
  deg: '°',
  ordm: 'º',
  ordf: 'ª',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  aacute: 'á',
  Aacute: 'Á',
  agrave: 'à',
  Agrave: 'À',
  acirc: 'â',
  Acirc: 'Â',
  atilde: 'ã',
  Atilde: 'Ã',
  eacute: 'é',
  Eacute: 'É',
  ecirc: 'ê',
  Ecirc: 'Ê',
  iacute: 'í',
  Iacute: 'Í',
  oacute: 'ó',
  Oacute: 'Ó',
  ocirc: 'ô',
  Ocirc: 'Ô',
  otilde: 'õ',
  Otilde: 'Õ',
  uacute: 'ú',
  Uacute: 'Ú',
  uuml: 'ü',
  Uuml: 'Ü',
  ccedil: 'ç',
  Ccedil: 'Ç',
}

const HTML_ENTITY_PATTERN = /&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/g

function isValidCodePoint(code) {
  if (code === 9 || code === 10 || code === 13) return true
  if (code < 0x20 || code > 0x10ffff) return false
  return code < 0xd800 || code > 0xdfff
}

// Decodifica entidades HTML (numericas e as nomeadas mais comuns) em UMA passada,
// sem DOM e sem cascata ("&amp;#8211;" vira "&#8211;"). Entidade desconhecida fica intacta.
export function decodeHtmlEntities(value) {
  if (typeof value !== 'string') return value
  if (!value.includes('&')) return value

  return value.replace(HTML_ENTITY_PATTERN, (match, body) => {
    if (body.charAt(0) === '#') {
      const isHex = body.charAt(1) === 'x'
      const code = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10)
      return isValidCodePoint(code) ? String.fromCodePoint(code) : match
    }

    return Object.prototype.hasOwnProperty.call(NAMED_HTML_ENTITIES, body)
      ? NAMED_HTML_ENTITIES[body]
      : match
  })
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
