// F17.2b (D-1..D-4): anuencias `licenses[]` multi-orgao - fonte unica
// (opcoes, normalizacao, compat de leitura MAPA, gate de coleta). Funcao
// pura (sem React, sem firebase) - roda no app E no script de migracao
// (Node puro).
//
// Regra de import (D-1): este modulo NAO importa nada (nem
// `processStatus.js`/`processCategories.js`, que sao mockados em
// `tests/ui/ProcessesPage.test.jsx`) - categoria e texto comparados por
// normalizacao/string literal locais.

export const LICENSE_AGENCY_OPTIONS = [
  'MAPA',
  'ANVISA',
  'Polícia Federal',
  'Exército',
  'IBAMA',
  'INMETRO',
  'Outro',
]

export const LICENSE_STATUS_OPTIONS = [
  'Aguardando registro',
  'Em análise',
  'Em exigência',
  'Selecionada para vistoria',
  'Vistoria agendada',
  'Vistoria realizada',
  'Deferida',
  'Indeferida',
]

export const MAX_LICENSES = 10
export const LEGACY_MAPA_LICENSE_ID = 'LIC-MAPA'

function normalizeComparableText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

function isMaritimeCategoryLocal(category) {
  return category === 'FCL' || category === 'LCL' || category === 'CONSOLIDADO'
}

function normalizeAgency(value) {
  const normalized = normalizeComparableText(value)
  const match = LICENSE_AGENCY_OPTIONS.find(
    (option) => normalizeComparableText(option) === normalized
  )
  return match ?? 'Outro'
}

function normalizeStatus(value) {
  const normalized = normalizeComparableText(value)
  const match = LICENSE_STATUS_OPTIONS.find(
    (option) => normalizeComparableText(option) === normalized
  )
  return match ?? 'Aguardando registro'
}

function normalizeLicenseId(value, index) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || `LIC-${index + 1}`
}

/**
 * D-2: normaliza `licenses[]` pro shape canonico (ordem de chaves fixa - a
 * paridade com `functions/` compara por `JSON.stringify`).
 */
export function normalizeLicenses(raw) {
  const array = Array.isArray(raw) ? raw : []

  return array.slice(0, MAX_LICENSES).map((license, index) => {
    const status = normalizeStatus(license?.status)
    const inspectionScheduledAt = ['Vistoria agendada', 'Vistoria realizada', 'Deferida', 'Indeferida'].includes(
      status
    )
      ? String(license?.inspectionScheduledAt ?? '').trim()
      : ''
    const rawDeferredAt = String(license?.deferredAt ?? '').trim()
    const deferredAt =
      status === 'Deferida' && /^\d{4}-\d{2}-\d{2}/.test(rawDeferredAt)
        ? rawDeferredAt.slice(0, 10)
        : ''

    return {
      id: normalizeLicenseId(license?.id, index),
      agency: normalizeAgency(license?.agency),
      lpcoNumber: String(license?.lpcoNumber ?? '').trim(),
      status,
      inspectionScheduledAt,
      deferredAt,
      notes: String(license?.notes ?? '').trim().slice(0, 500),
    }
  })
}

/**
 * D-3: compat de leitura - mapeia o valor exato (apos trim) de `mapaStatus`
 * legado para um status canonico de `licenses[]`. Retorna `{ status, known }`
 * - `known: false` bloqueia a coleta (mesmo efeito do legado) e preserva o
 * valor original em `notes` (via `buildLegacyMapaLicense`).
 */
export function mapLegacyMapaStatus(value) {
  const trimmed = String(value ?? '').trim()

  if (trimmed === 'Aguardando MAPA') return { status: 'Em análise', known: true }
  if (trimmed === 'Selecionado para Vistoria') return { status: 'Selecionada para vistoria', known: true }
  if (trimmed === 'Vistoria agendada, aguardando realização') {
    return { status: 'Vistoria agendada', known: true }
  }
  if (trimmed === 'Vistoria realizada, aguardando deferimento da LPCO') {
    return { status: 'Vistoria realizada', known: true }
  }
  if (trimmed === 'Liberado') return { status: 'Deferida', known: true }
  if (trimmed === 'LPCO deferida, MAPA liberado') return { status: 'Deferida', known: true }

  return { status: 'Em análise', known: false }
}

export function buildLegacyMapaLicense(process) {
  const mapaStatus = String(process?.mapaStatus ?? '').trim()
  const { status, known } = mapLegacyMapaStatus(mapaStatus)

  return {
    id: LEGACY_MAPA_LICENSE_ID,
    agency: 'MAPA',
    lpcoNumber: '',
    status,
    inspectionScheduledAt:
      status === 'Vistoria agendada' ? String(process?.mapaInspectionScheduledAt ?? '').trim() : '',
    deferredAt: '',
    notes: known ? '' : `Status MAPA legado: ${mapaStatus}`,
  }
}

/**
 * D-3: `licenses` array (mesmo vazio) e' AUTORITATIVO - `licenses: []`
 * intencional nunca e' ressuscitado pelo `mapaStatus` legado.
 */
export function getEffectiveLicenses(process) {
  if (Array.isArray(process?.licenses)) return process.licenses

  if (isMaritimeCategoryLocal(process?.category) && String(process?.mapaStatus ?? '').trim() !== '') {
    return [buildLegacyMapaLicense(process)]
  }

  return []
}

export function isLicenseDeferred(status) {
  return normalizeComparableText(status) === 'deferida'
}

export function isLicenseRejected(status) {
  return normalizeComparableText(status) === 'indeferida'
}

/**
 * D-4: gate de coleta - lista vazia libera (nenhuma anuencia exigida).
 */
export function areLicensesCleared(process) {
  return getEffectiveLicenses(process).every((license) => isLicenseDeferred(license?.status))
}

export function hasRejectedLicense(process) {
  return getEffectiveLicenses(process).some((license) => isLicenseRejected(license?.status))
}

export function createEmptyLicense(id) {
  return {
    id,
    agency: 'MAPA',
    lpcoNumber: '',
    status: 'Aguardando registro',
    inspectionScheduledAt: '',
    deferredAt: '',
    notes: '',
  }
}
