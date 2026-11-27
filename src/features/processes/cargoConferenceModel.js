import {
  cargoRowPallets,
  hasCargoRowIssue,
  hasCargoRowIssueNote,
  summarizeCargoPallets,
} from './cargoConferenceIssues'
import { countCargoRowsWithPhotoWithoutNote } from './cargoConferencePhotos'
import {
  getCargoRowUnits,
  isCargoRowUnitsDivergent,
  listCargoPartialPallets,
  partialPalletsOfRow,
} from './cargoConferenceUnits'
import { CARGO_CONFERENCE_STATUS, isCargoReportRowEmpty } from './cargoReportFormModel'

// S9-F do Relatório de Carga: regras da conferência da logística compartilhadas entre o formulário do computador
// (CargoReportForm) e a aba Conferência do celular. Módulo puro (sem React e sem Firebase): estado vazio, chave
// de "sujo", marcas por linha, progresso e as regras do fechamento (S10-I: pallets, divergência e avaria).

export const EMPTY_CARGO_CONFERENCE = {
  revision: 0,
  status: CARGO_CONFERENCE_STATUS.open,
  okByRowId: {},
  countOkByRowId: {},
  palletsByRowId: {},
  unitsByRowId: {},
  partialPallets: [],
  damageByRowId: {},
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

// Nome do item na tela: descrição SQ, senão a do fornecedor, senão "Item N".
export function describeCargoRow(row, number) {
  return String(row?.sqDescription ?? '').trim() || String(row?.supplierDescription ?? '').trim() || `Item ${number}`
}

// Chave de comparação do que a logística pode ter alterado (ignora metadados de leitura).
export function cargoConferenceKey(conference, rows) {
  const marks = rows.map((row) => [
    row.id,
    conference.okByRowId?.[row.id] === true,
    conference.countOkByRowId?.[row.id] === true,
    cargoRowPallets(conference, row.id).count,
    hasCargoRowIssue(conference, row.id),
    String(conference.damageByRowId?.[row.id]?.note ?? '').trim(),
    (conference.damageByRowId?.[row.id]?.photos ?? []).map((photo) => photo?.id),
    String(conference.labelsByRowId?.[row.id]?.wms ?? '').trim(),
    String(conference.labelsByRowId?.[row.id]?.sq ?? '').trim(),
    getCargoRowUnits(conference, row.id),
  ])
  // "Conferido por" é automático (não digitado): fora da chave. O rodapé do recebimento entra.
  return JSON.stringify({
    marks,
    partials: listCargoPartialPallets(conference, rows.map((row) => row.id)),
    receiptStatus: conference.receiptStatus ?? '',
    receivedDate: conference.receivedDate ?? '',
    unloadStartAt: conference.unloadStartAt ?? '',
    unloadEndAt: conference.unloadEndAt ?? '',
    labelingOk: conference.labelingOk === true,
    nfNumber: String(conference.nfNumber ?? '').trim(),
    notes: String(conference.notes ?? '').trim(),
  })
}

// `mapName`: 'okByRowId' (OK?). Alterna só a linha pedida. A contagem é o contador de pallets (`cargoConferenceIssues`).
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

// OK? em todas as linhas; os pallets não são marcáveis em lote e as etiquetas ficam como estão.
export function markAllCargoRowsOk(conference, rows) {
  const okByRowId = { ...conference.okByRowId }
  for (const row of rows) okByRowId[row.id] = true
  return { ...conference, okByRowId }
}

// Linha conferida = OK? marcado e pelo menos 1 pallet contado, INTEIRO ou PARCIAL (Fatia B: o pallet parcial vale como
// pallet contado). Relatório antigo (Contagem OK, sem número) conta como contado enquanto a linha não ganha um número.
export function isCargoRowConferred(conference, rowId) {
  if (conference?.okByRowId?.[rowId] !== true) return false
  if (partialPalletsOfRow(conference, rowId).length > 0) return true
  const { count, legacyOk } = cargoRowPallets(conference, rowId)
  return count !== null ? count >= 1 : legacyOk
}

export function summarizeCargoConferenceProgress(rows, conference) {
  const list = Array.isArray(rows) ? rows : []
  return { done: list.filter((row) => isCargoRowConferred(conference, row.id)).length, total: list.length }
}

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function lowerFirst(text) {
  return text.charAt(0).toLocaleLowerCase('pt-BR') + text.slice(1)
}

// Regras do fechamento da conferência. Só o computador fecha; o celular usa a mesma função para MOSTRAR o que falta.
//   blocking: impede o fechar (divergência de pallets sem observação escrita em nenhum item);
//   pendings: avisos que não bloqueiam ("Dá para fechar assim");
//   hints: os mesmos pontos em frase curta, para o aviso do celular ao salvar (bloqueio primeiro).
// `expectedUnitsByRowId` (Fatia B, opcional): { [rowId]: Nº de emb. inteiro | null }; os lotes com unidades contadas
// diferentes do esperado entram como pendência "N lote(s) com unidades divergentes" (D-16: não bloqueia; sem esperado,
// sem contagem ou 0 não diverge).
export function evaluateCargoConferenceClose(rows, conference, { expectedPallets = null, expectedUnitsByRowId = null } = {}) {
  const filled = (Array.isArray(rows) ? rows : []).filter((row) => !isCargoReportRowEmpty(row))
  const summary = summarizeCargoPallets(filled, conference, expectedPallets)
  const withoutMark = filled.filter((row) => !isCargoRowConferred(conference, row.id)).length
  const unitsDivergent = filled.filter((row) =>
    isCargoRowUnitsDivergent(getCargoRowUnits(conference, row.id), expectedUnitsByRowId?.[row.id])
  ).length
  const issueCount = filled.filter((row) => hasCargoRowIssue(conference, row.id)).length
  const hasNote = filled.some((row) => hasCargoRowIssueNote(conference, row.id))
  const photoWithoutNote = countCargoRowsWithPhotoWithoutNote(filled, conference)
  const palletsText = `${summary.counted} contados de ${summary.expected} informados pelo COMEX`

  const blocking = []
  const pendings = []
  const hints = []
  if (summary.state === 'divergente' && !hasNote) {
    blocking.push(
      `Pallets divergentes: ${palletsText}. Para fechar, escreva uma observação em pelo menos um item explicando a diferença ou a avaria.`
    )
    hints.push(
      `pallets divergentes (${summary.counted} de ${summary.expected}) sem observação em nenhum item — escreva uma observação no item`
    )
  }

  const entries = [
    withoutMark > 0
      ? [
          `${plural(withoutMark, 'item', 'itens')} sem OK? ou sem pallets contados`,
          `${plural(withoutMark, 'item', 'itens')} sem OK? ou sem pallets`,
        ]
      : null,
    unitsDivergent > 0 ? [`${plural(unitsDivergent, 'lote', 'lotes')} com unidades divergentes`] : null,
    summary.state === 'divergente' && hasNote
      ? [
          `Pallets divergentes: ${palletsText} (com observação)`,
          `pallets divergentes (${summary.counted} de ${summary.expected}), com observação`,
        ]
      : null,
    summary.state === 'semTotal' ? ['Total de pallets não informado pelo COMEX'] : null,
    issueCount > 0 && conference.receiptStatus !== 'com_ressalva'
      ? [
          `${plural(issueCount, 'item', 'itens')} com avaria registrada, mas o status do recebimento não é "Com ressalva"`,
          `${plural(issueCount, 'item', 'itens')} com avaria e status diferente de "Com ressalva"`,
        ]
      : null,
    // S10-J1b: foto sem observação escrita (não bloqueia).
    photoWithoutNote > 0
      ? [
          `${plural(photoWithoutNote, 'item', 'itens')} com foto, mas sem observação`,
          `${plural(photoWithoutNote, 'item', 'itens')} com foto sem observação`,
        ]
      : null,
    conference.receiptStatus ? null : ['Status do recebimento não informado'],
    // S8: pendências (não bloqueiam). Não existe pendência separada de "Data de recebimento": ela é o dia do início.
    conference.unloadStartAt ? null : ['Início da descarga não informado'],
    conference.unloadStartAt && !conference.unloadEndAt ? ['Fim da descarga não informado'] : null,
    conference.labelingOk ? null : ['Etiquetagem sem OK'],
    String(conference.nfNumber ?? '').trim() ? null : ['Nº da NF não informado'],
  ]
  for (const entry of entries) {
    if (!entry) continue
    pendings.push(entry[0])
    hints.push(entry[1] ?? lowerFirst(entry[0]))
  }
  return { blocking, pendings, hints }
}

// Pendências do fechamento (não bloqueiam); o bloqueio vem de `evaluateCargoConferenceClose`.
export function listCargoConferencePendings(rows, conference, options) {
  return evaluateCargoConferenceClose(rows, conference, options).pendings
}

