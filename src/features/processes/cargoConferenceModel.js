import { CARGO_CONFERENCE_STATUS, isCargoReportRowEmpty } from './cargoReportFormModel'

// S9-F do Relatório de Carga: regras da conferência da logística compartilhadas entre o formulário do computador
// (CargoReportForm) e a aba Conferência do celular. Módulo puro (sem React e sem Firebase): estado vazio, chave
// de "sujo", marcas por linha, progresso e a lista de pendências do fechamento.

export const EMPTY_CARGO_CONFERENCE = {
  revision: 0,
  status: CARGO_CONFERENCE_STATUS.open,
  okByRowId: {},
  countOkByRowId: {},
  labelsByRowId: {},
  checkedByName: '',
  receiptStatus: '',
  receivedDate: '',
  nfNumber: '',
  notes: '',
  unloadStartAt: '',
  unloadEndAt: '',
  labelingOk: false,
  closedDate: '',
  closedById: '',
  closedByName: '',
  closedDocumentId: '',
  updatedAt: null,
  updatedByName: '',
}

// Chave de comparação do que a logística pode ter alterado (ignora metadados de leitura).
export function cargoConferenceKey(conference, rows) {
  const marks = rows.map((row) => [
    row.id,
    conference.okByRowId?.[row.id] === true,
    conference.countOkByRowId?.[row.id] === true,
    String(conference.labelsByRowId?.[row.id]?.wms ?? '').trim(),
    String(conference.labelsByRowId?.[row.id]?.sq ?? '').trim(),
  ])
  // "Conferido por" é automático (não digitado): fora da chave. O rodapé do recebimento entra.
  return JSON.stringify({
    marks,
    receiptStatus: conference.receiptStatus ?? '',
    receivedDate: conference.receivedDate ?? '',
    unloadStartAt: conference.unloadStartAt ?? '',
    unloadEndAt: conference.unloadEndAt ?? '',
    labelingOk: conference.labelingOk === true,
    nfNumber: String(conference.nfNumber ?? '').trim(),
    notes: String(conference.notes ?? '').trim(),
  })
}

// `mapName`: 'okByRowId' (OK?) ou 'countOkByRowId' (Contagem). Alterna só a linha pedida.
export function toggleCargoConferenceFlag(conference, mapName, rowId) {
  return { ...conference, [mapName]: { ...conference[mapName], [rowId]: conference[mapName]?.[rowId] !== true } }
}

// `field`: 'wms' ou 'sq'. O valor entra como veio; a gravação normaliza (MAIÚSCULAS, 120 caracteres).
export function setCargoConferenceLabel(conference, rowId, field, value) {
  return {
    ...conference,
    labelsByRowId: {
      ...conference.labelsByRowId,
      [rowId]: { wms: '', sq: '', ...conference.labelsByRowId?.[rowId], [field]: value },
    },
  }
}

// OK? e Contagem em todas as linhas; as etiquetas ficam como estão.
export function markAllCargoRowsOk(conference, rows) {
  const okByRowId = { ...conference.okByRowId }
  const countOkByRowId = { ...conference.countOkByRowId }
  for (const row of rows) {
    okByRowId[row.id] = true
    countOkByRowId[row.id] = true
  }
  return { ...conference, okByRowId, countOkByRowId }
}

// Linha conferida = OK? e Contagem marcados.
export function isCargoRowConferred(conference, rowId) {
  return conference?.okByRowId?.[rowId] === true && conference?.countOkByRowId?.[rowId] === true
}

export function summarizeCargoConferenceProgress(rows, conference) {
  const list = Array.isArray(rows) ? rows : []
  return { done: list.filter((row) => isCargoRowConferred(conference, row.id)).length, total: list.length }
}

function pluralLines(count, text) {
  return `${count} ${count === 1 ? 'linha' : 'linhas'} ${text}`
}

// Pendências do fechamento (não bloqueiam). O computador junta com ", " (o celular não fecha mais a conferência).
export function listCargoConferencePendings(rows, conference) {
  const filledRows = (Array.isArray(rows) ? rows : []).filter((row) => !isCargoReportRowEmpty(row))
  const withoutOk = filledRows.filter((row) => conference.okByRowId?.[row.id] !== true).length
  const withoutCount = filledRows.filter((row) => conference.countOkByRowId?.[row.id] !== true).length
  return [
    withoutOk > 0 ? pluralLines(withoutOk, 'sem OK?') : '',
    withoutCount > 0 ? pluralLines(withoutCount, 'sem contagem') : '',
    conference.receiptStatus ? '' : 'Status do recebimento não informado',
    // S8: pendências (não bloqueiam). Não existe pendência separada de "Data de recebimento": ela é o dia do início.
    conference.unloadStartAt ? '' : 'Início da descarga não informado',
    conference.unloadStartAt && !conference.unloadEndAt ? 'Fim da descarga não informado' : '',
    conference.labelingOk ? '' : 'Etiquetagem sem OK',
    String(conference.nfNumber ?? '').trim() ? '' : 'Nº da NF não informado',
  ].filter(Boolean)
}
