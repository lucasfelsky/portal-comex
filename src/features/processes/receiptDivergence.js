// F17.4b (D3): divergencia no recebimento - funcoes puras, ZERO imports.
// Reusadas pelo repositorio (`processesRepository.js`), pelo editor
// (`ReceiptDivergenceFields.jsx`) e pela leitura (`ProcessOperationalDetails.jsx`).
//
// Regra de import: este modulo NAO importa de `processStatus.js`,
// `pendingFields.js`, `deriveProcessStatus.js`, `processCategories.js`,
// `utils/collectionWindows`, `utils/postReceiptImages` nem
// `processesRepository` - `tests/ui/ProcessesPage.test.jsx` mocka esses
// modulos com uma lista fechada de exports.
//
// Os dados NAO sao apagados so' porque o status de coleta voltou (so' zeram
// quando a flag `receiptDivergence` e' desmarcada) - ver `saveProcessCollectionStatus`.

export const RECEIPT_DIVERGENCE_TYPES = ['Avaria', 'Falta', 'Sobra']
export const MAX_RECEIPT_DIVERGENCE_NOTES = 2000

export function normalizeReceiptDivergenceFields(p, { trimText = true } = {}) {
  const receiptDivergence = p?.receiptDivergence === true

  if (!receiptDivergence) {
    return {
      receiptDivergence: false,
      receiptDivergenceType: '',
      receiptDivergenceNotes: '',
    }
  }

  const rawType = p?.receiptDivergenceType
  const receiptDivergenceType = RECEIPT_DIVERGENCE_TYPES.includes(rawType) ? rawType : ''

  const rawNotes = String(p?.receiptDivergenceNotes ?? '')
  const receiptDivergenceNotes = (trimText ? rawNotes.trim() : rawNotes).slice(
    0,
    MAX_RECEIPT_DIVERGENCE_NOTES
  )

  return {
    receiptDivergence: true,
    receiptDivergenceType,
    receiptDivergenceNotes,
  }
}

export function hasReceiptDivergence(p) {
  return p?.receiptDivergence === true
}
