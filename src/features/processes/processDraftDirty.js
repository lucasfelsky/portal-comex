// UX-3a (D6): comparacao normalizada e pura entre o draft do formulario de
// processo e a baseline gravada ao entrar em create/edit. NAO usa
// `sanitizeDraft`/`sanitizeProcessItems` (o segundo gera id com
// `Date.now()` - nao deterministico, viraria falso-positivo de "sujo").
//
// Regras: strings sao comparadas com `trim`; `null`/`undefined`/`''` sao
// equivalentes entre si; numero e string numerica sao equivalentes
// (`'5'` == `5`), mas `''` (vira `null`) e `0` NAO sao equivalentes;
// arrays sao comparados por ordem; objetos pela uniao das chaves; funcoes
// sao ignoradas.

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeScalar(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  if (value === null || value === undefined) return null
  return value
}

function isNumericCandidate(value) {
  if (typeof value === 'number') return !Number.isNaN(value)
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed === '') return false
  return !Number.isNaN(Number(trimmed))
}

export function areProcessDraftsEquivalent(a, b) {
  if (typeof a === 'function' || typeof b === 'function') return true

  if (Array.isArray(a) || Array.isArray(b)) {
    const arrA = Array.isArray(a) ? a : []
    const arrB = Array.isArray(b) ? b : []
    if (arrA.length !== arrB.length) return false
    return arrA.every((item, index) => areProcessDraftsEquivalent(item, arrB[index]))
  }

  if (isPlainObject(a) || isPlainObject(b)) {
    const objA = isPlainObject(a) ? a : {}
    const objB = isPlainObject(b) ? b : {}
    const keys = new Set([...Object.keys(objA), ...Object.keys(objB)])
    for (const key of keys) {
      if (typeof objA[key] === 'function' || typeof objB[key] === 'function') continue
      if (!areProcessDraftsEquivalent(objA[key], objB[key])) return false
    }
    return true
  }

  const normalizedA = normalizeScalar(a)
  const normalizedB = normalizeScalar(b)

  if (normalizedA === null && normalizedB === null) return true
  if (normalizedA === null || normalizedB === null) return false

  if (isNumericCandidate(normalizedA) && isNumericCandidate(normalizedB)) {
    return Number(normalizedA) === Number(normalizedB)
  }

  return normalizedA === normalizedB
}
