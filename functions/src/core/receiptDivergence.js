// F17.4b (D6/D8): espelho PURO de
// `src/features/processes/receiptDivergence.js`. Zero imports (nem
// `../core/shared.js`) - `functions/` nao importa de `src/`. O teste de
// paridade (`tests/unit/receiptDivergence.test.js`) compara os dois lados.

export const RECEIPT_DIVERGENCE_TYPES_MIRROR = ['Avaria', 'Falta', 'Sobra', 'Lote']
export const MAX_RECEIPT_DIVERGENCE_NOTES_MIRROR = 2000

export function normalizeReceiptDivergenceFieldsMirror(p) {
  const receiptDivergence = p?.receiptDivergence === true

  if (!receiptDivergence) {
    return {
      receiptDivergence: false,
      receiptDivergenceType: '',
      receiptDivergenceNotes: '',
    }
  }

  const rawType = p?.receiptDivergenceType
  const receiptDivergenceType = RECEIPT_DIVERGENCE_TYPES_MIRROR.includes(rawType) ? rawType : ''

  const receiptDivergenceNotes = String(p?.receiptDivergenceNotes ?? '')
    .trim()
    .slice(0, MAX_RECEIPT_DIVERGENCE_NOTES_MIRROR)

  return {
    receiptDivergence: true,
    receiptDivergenceType,
    receiptDivergenceNotes,
  }
}

export function isReceiptDivergenceReportedMirror(before, after) {
  return before?.receiptDivergence !== true && after?.receiptDivergence === true
}
