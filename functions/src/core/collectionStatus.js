// F17.4a (D-7): espelho PURO de `src/features/processes/processStatus.js`
// (canonicalizeCollectionStatus/getDisplayedCollectionStatus). Zero imports
// (nem `../core/shared.js`) - `functions/` nao importa de `src/`. O teste de
// paridade (`tests/unit/processStatus.collection.test.js`) compara os dois
// lados valor a valor.

function normalizeComparableTextMirror(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function canonicalizeCollectionStatusMirror(status) {
  const normalizedStatus = normalizeComparableTextMirror(status).trim()

  if (normalizedStatus === 'aguardando agendamento') {
    return 'Aguardando agendamento de coleta'
  }

  if (
    normalizedStatus === 'carga recebida' ||
    normalizedStatus === 'carga em conferencia/etiquetagem'
  ) {
    return 'Carga recebida, em conferência'
  }

  return String(status ?? '')
}

const COLLECTION_STATUS_DISPLAY_LABELS_MIRROR = {
  'Carga em processo de Entrada': 'Carga em processo de entrada',
}

export function getDisplayedCollectionStatusMirror(status) {
  const canonicalStatus = canonicalizeCollectionStatusMirror(status)
  const normalizedStatus = normalizeComparableTextMirror(canonicalStatus)

  if (
    normalizedStatus === 'veiculo no cd para descarga' ||
    normalizedStatus === 'carga sendo descarregada no cd'
  ) {
    return 'Carga sendo descarregada'
  }

  if (normalizedStatus === 'carga a caminho do cd') return 'Carga a caminho do CD'
  if (normalizedStatus === 'carga recebida, em conferencia') {
    return 'Carga recebida, em conferência'
  }

  const trimmed = String(canonicalStatus ?? '').trim()
  return COLLECTION_STATUS_DISPLAY_LABELS_MIRROR[trimmed] || trimmed
}

export function hasCollectionStatusChangedMirror(before, after) {
  const canonicalBefore = canonicalizeCollectionStatusMirror(before)
  const canonicalAfter = canonicalizeCollectionStatusMirror(after)

  return canonicalBefore !== canonicalAfter && canonicalAfter !== ''
}
