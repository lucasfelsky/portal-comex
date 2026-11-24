// S4 do Relatório de Carga: "folha" do FR.CMX.001, o que o Excel e a visão de impressão mostram.
// Módulo puro (sem React, sem firebase, sem fflate): o gerador do xlsx e a impressão leem a MESMA
// folha, então os dois não divergem. Números vêm de `deriveCargoReportRow`, que já dá precedência
// aos valores congelados ao concluir.
import {
  CARGO_REPORT_MAX_ROWS,
  buildCargoReportPayload,
  deriveCargoReportRow,
  formatCargoReportTitle,
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

// Documento anexado pelo próprio Portal ("Concluir e anexar"): nome padrão + enviado por admin.
export function isPortalGeneratedCargoReport(document) {
  const name = String(document?.name ?? '')
  return (
    document?.type === 'cargoReport' &&
    document?.uploadedByRole === 'admin' &&
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

// `form` é o estado da tela (ou o doc lido); `conference` traz o OK?, a contagem, as etiquetas WMS/SQ
// e quem conferiu (S6: tudo da logística; `wmsLabel/sqLabel/count` das linhas do `current` não valem).
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
      wmsLabel: labelsByRowId[row.id]?.wms ?? '',
      sqLabel: labelsByRowId[row.id]?.sq ?? '',
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
    notes: payload.notes,
    checkedByName: String(conference?.checkedByName ?? '').trim(),
    labeledBy: payload.labeledBy,
    labelMadeBy: payload.labelMadeBy,
    receiptStatus: payload.receiptStatus,
    receivedDateBr: formatCargoDateBr(payload.receivedDate),
    completedDateBr: formatCargoDateBr(payload.completedDate),
    nfNumber: payload.nfNumber,
    alerts,
  }
}
