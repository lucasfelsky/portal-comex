// S4 do Relatório de Carga: "folha" do FR.CMX.001, o que o Excel e a visão de impressão mostram.
// Módulo puro (sem React, sem firebase, sem fflate): o gerador do xlsx e a impressão leem a MESMA
// folha, então os dois não divergem. Números vêm de `deriveCargoReportRow`, que já dá precedência
// aos valores congelados ao concluir.
import {
  CARGO_CONFERENCE_STATUS,
  CARGO_REPORT_LIMITS,
  CARGO_REPORT_MAX_ROWS,
  RECEIPT_STATUS_OPTIONS,
  buildCargoReportPayload,
  computeCargoUnloadMinutes,
  deriveCargoReportRow,
  formatCargoReportTitle,
  normalizeCargoLabel,
  readDateTimeKey,
  resolveCargoReceivedDate,
} from './cargoReportFormModel'

export const CARGO_REPORT_FILE_PREFIX = 'FR.CMX.001 - RELATORIO DE CARGA - '
export const CARGO_REPORT_FILE_EXTENSION = '.xlsx'
export const CARGO_REPORT_FILE_NAME_MAX = 200
const FALLBACK_SUFFIX = 'SEM TITULO'
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const FORBIDDEN_FILE_CHARS = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|'])

// '2026-11-22' -> '22/11/2026'. Por `split`, nunca por `Date` (o fuso deslocaria o dia).
export function formatCargoDateBr(dateKey) {
  const match = DATE_KEY_PATTERN.exec(String(dateKey ?? ''))
  return match ? `${match[3]}/${match[2]}/${match[1]}` : ''
}

// '2026-11-24T08:15' -> '24/11/2026 08:15'. Por `split`, nunca por `Date`. Inválido -> ''.
export function formatCargoDateTimeBr(dateTimeKey) {
  const key = readDateTimeKey(dateTimeKey)
  return key ? `${formatCargoDateBr(key.slice(0, 10))} ${key.slice(11, 16)}` : ''
}

// Linha de descarga que o Excel leva no início de OBSERVAÇÕES (o modelo FR.CMX.001 não tem células para isso).
// Maiúsculas, como os rótulos do modelo. Sem início: ''. Fim antes do início não gera tempo total.
//   mesmo dia:       DESCARGA: 24/11/2026, 08:15 ÀS 10:40 · TEMPO TOTAL: 145 MIN
//   dias diferentes: DESCARGA: 24/11/2026 23:30 ATÉ 25/11/2026 01:10 · TEMPO TOTAL: 100 MIN
//   só início:       DESCARGA: INÍCIO 24/11/2026 08:15
export function formatCargoUnloadSummary(start, end) {
  const from = readDateTimeKey(start)
  if (!from) return ''
  const to = readDateTimeKey(end)
  if (!to) return `DESCARGA: INÍCIO ${formatCargoDateTimeBr(from)}`
  const minutes = computeCargoUnloadMinutes(from, to)
  const total = minutes === null ? '' : ` · TEMPO TOTAL: ${minutes} MIN`
  if (from.slice(0, 10) === to.slice(0, 10)) {
    return `DESCARGA: ${formatCargoDateBr(from.slice(0, 10))}, ${from.slice(11, 16)} ÀS ${to.slice(11, 16)}${total}`
  }
  return `DESCARGA: ${formatCargoDateTimeBr(from)} ATÉ ${formatCargoDateTimeBr(to)}${total}`
}

// Troca por espaço os caracteres proibidos em nome de arquivo e os de controle.
function sanitizeFileNamePart(value) {
  let result = ''
  for (const char of String(value ?? '')) {
    const code = char.charCodeAt(0)
    result += code < 32 || code === 127 || FORBIDDEN_FILE_CHARS.has(char) ? ' ' : char
  }
  return result.replace(/\s+/g, ' ').trim()
}

export function buildCargoReportFileName(titleSuffix) {
  const room = CARGO_REPORT_FILE_NAME_MAX - CARGO_REPORT_FILE_PREFIX.length - CARGO_REPORT_FILE_EXTENSION.length
  const suffix = sanitizeFileNamePart(titleSuffix).slice(0, room).trim() || FALLBACK_SUFFIX
  return `${CARGO_REPORT_FILE_PREFIX}${suffix}${CARGO_REPORT_FILE_EXTENSION}`
}

// Documento anexado pelo próprio Portal ("Salvar e fechar" do COMEX ou "Salvar e fechar conferência" da
// logística): nome padrão + enviado por admin ou logística.
export function isPortalGeneratedCargoReport(document) {
  const name = String(document?.name ?? '')
  return (
    document?.type === 'cargoReport' &&
    (document?.uploadedByRole === 'admin' || document?.uploadedByRole === 'logistica') &&
    name.startsWith(CARGO_REPORT_FILE_PREFIX) &&
    name.endsWith(CARGO_REPORT_FILE_EXTENSION)
  )
}

const ALERT_TEXT = {
  missingLot: (code) => `falta lote em ${code}`,
  missingPackageWeight: (code) => `falta peso da embalagem em ${code}`,
  noPackaging: (code) => `${code} sem embalagem cadastrada`,
}

// -> 'falta lote em RE5116, falta peso da embalagem em RE5116 e ZZ9999 sem embalagem cadastrada'
export function describeCargoReportAlerts(alerts) {
  const parts = (Array.isArray(alerts) ? alerts : [])
    .map((alert) => ALERT_TEXT[alert?.kind]?.(alert.code))
    .filter(Boolean)
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`
}

const RECEIPT_STATUS_VALUES = RECEIPT_STATUS_OPTIONS.map((option) => option.value)

// `form` é o estado da tela (ou o doc lido); `conference` traz o OK?, a contagem, as etiquetas WMS/SQ,
// quem conferiu e o rodapé do recebimento (S6/S7: tudo da logística; `wmsLabel/sqLabel/count` e
// `notes/receiptStatus/receivedDate/nfNumber` do `current` não valem). S8: descarga, tempo total e etiquetagem OK. DATA CONCLUSÃO = dia em que a
// logística fechou (`closedDate`) quando a conferência está fechada; senão, a do COMEX (`completedDate`).
export function buildCargoReportSheet(form, { process, conference, catalog } = {}) {
  // O payload normaliza texto e números (a tela guarda número como texto) e descarta linhas vazias.
  const { payload } = buildCargoReportPayload(form, {})
  const okByRowId = conference?.okByRowId ?? {}
  const countOkByRowId = conference?.countOkByRowId ?? {}
  const labelsByRowId = conference?.labelsByRowId ?? {}
  const alerts = []

  const rows = payload.rows.slice(0, CARGO_REPORT_MAX_ROWS).map((row) => {
    const derived = deriveCargoReportRow(row, catalog)
    if (row.dbcorpCode) {
      for (const kind of ['missingLot', 'missingPackageWeight', 'noPackaging']) {
        if (derived.alerts[kind]) alerts.push({ rowId: row.id, code: row.dbcorpCode, kind })
      }
    }
    return {
      id: row.id,
      po: row.po,
      dbcorpCode: row.dbcorpCode,
      supplierDescription: row.supplierDescription,
      sqDescription: row.sqDescription,
      ok: okByRowId[row.id] === true,
      supplierLot: row.supplierLot,
      lotSq: derived.lotSq,
      wmsLabel: normalizeCargoLabel(labelsByRowId[row.id]?.wms),
      sqLabel: normalizeCargoLabel(labelsByRowId[row.id]?.sq),
      quantityKg: row.quantityKg,
      countOk: countOkByRowId[row.id] === true,
      netWeightKg: derived.netWeightKg,
      packageWeightKg: row.packageWeightKg,
      packages: derived.packages,
    }
  })

  return {
    titleSuffix: payload.titleSuffix,
    title: formatCargoReportTitle(payload.titleSuffix),
    duimpNumber: String(process?.duimpNumber ?? '').trim(),
    cargoType: payload.cargoType,
    rows,
    notes: String(conference?.notes ?? '').trim().slice(0, CARGO_REPORT_LIMITS.notes),
    checkedByName: String(conference?.checkedByName ?? '').trim(),
    receiptStatus: RECEIPT_STATUS_VALUES.includes(conference?.receiptStatus) ? conference.receiptStatus : '',
    // S8: o dia do início da descarga; sem início, o valor gravado (legado).
    receivedDateBr: formatCargoDateBr(resolveCargoReceivedDate(conference ?? {})),
    unloadStartBr: formatCargoDateTimeBr(conference?.unloadStartAt),
    unloadEndBr: formatCargoDateTimeBr(conference?.unloadEndAt),
    unloadTotalMinutes: computeCargoUnloadMinutes(conference?.unloadStartAt, conference?.unloadEndAt),
    unloadSummary: formatCargoUnloadSummary(conference?.unloadStartAt, conference?.unloadEndAt),
    labelingOk: conference?.labelingOk === true,
    completedDateBr: formatCargoDateBr(
      conference?.status === CARGO_CONFERENCE_STATUS.closed ? conference.closedDate : payload.completedDate
    ),
    nfNumber: String(conference?.nfNumber ?? '').trim().slice(0, CARGO_REPORT_LIMITS.nf),
    alerts,
  }
}
