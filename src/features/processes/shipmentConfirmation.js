// F17.2d-1 (D-1/D-2): "Embarque confirmado" (Q5) - SEM campo novo. O
// checkbox e' derivado de `hasText(shippedAt)`; a acao de marcar/desmarcar
// copia/limpa `shippedAt` a partir do ETD. Modulo ZERO imports - seguro
// para o mock fechado de `tests/ui/ProcessesPage.test.jsx:68-125`.

// D-1: mesmo padrao de `getLocalDateKey` ja usado em
// `ProcessTransitFields.jsx:8-13` - PROIBIDO `toISOString()` (bug de fuso,
// meia-noite UTC vira o dia anterior em BRT).
export function getLocalDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isShipmentConfirmed(p) {
  return String(p?.shippedAt ?? '').trim() !== ''
}

// D-2: `shippedAt` gravado a mao (F17.2a) e' a data REAL; o ETD e'
// estimativa. Confirmado com os dois valores diferentes -> doc legado
// divergente (nada e' reescrito automaticamente).
export function hasShipmentDateDivergence(p) {
  return isShipmentConfirmed(p) && p?.shippedAt !== p?.etd
}

// `checked` com ETD vazio e' no-op (nao ha' data pra copiar); marcar copia
// o ETD pra `shippedAt`; desmarcar e' a acao explicita que zera `shippedAt`.
export function applyShipmentConfirmation(draft, checked) {
  if (checked) {
    if (!String(draft?.etd ?? '').trim()) return draft
    return { ...draft, shippedAt: draft.etd }
  }
  return { ...draft, shippedAt: '' }
}

// Editar o ETD so' sincroniza `shippedAt` quando ja estava sincronizado
// (confirmado e `shippedAt === etd`) e o novo valor nao e' vazio - limpar
// o ETD NUNCA apaga `shippedAt` (evita regressao acidental do status).
export function applyEtdEdit(draft, value) {
  const next = { ...draft, etd: value }
  const wasSynced = isShipmentConfirmed(draft) && draft.shippedAt === draft.etd
  if (wasSynced && String(value ?? '').trim()) {
    next.shippedAt = value
  }
  return next
}

export function isFutureShipment(p, today = getLocalDateKey(new Date())) {
  return isShipmentConfirmed(p) && p.shippedAt > today
}
