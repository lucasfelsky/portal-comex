// F17.2b (D-8): espelho PURO de `src/features/processes/licenses.js`
// (D-1..D-4). Zero imports (nem `../core/shared.js`) - `functions/` nao
// importa de `src/`. O teste de paridade (`tests/unit/processMilestones.test.js`)
// compara os dois lados via `JSON.stringify`.

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

export function normalizeLicensesMirror(raw) {
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

export function mapLegacyMapaStatusMirror(value) {
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

function buildLegacyMapaLicenseMirror(process) {
  const mapaStatus = String(process?.mapaStatus ?? '').trim()
  const { status, known } = mapLegacyMapaStatusMirror(mapaStatus)

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

function getEffectiveLicensesMirror(process) {
  if (Array.isArray(process?.licenses)) return process.licenses

  if (isMaritimeCategoryLocal(process?.category) && String(process?.mapaStatus ?? '').trim() !== '') {
    return [buildLegacyMapaLicenseMirror(process)]
  }

  return []
}

export function isLicenseDeferredMirror(status) {
  return normalizeComparableText(status) === 'deferida'
}

export function isLicenseRejectedMirror(status) {
  return normalizeComparableText(status) === 'indeferida'
}

/**
 * D-8: shape/ordem de chaves identicos a
 * `normalizeLicenses(getEffectiveLicenses(process))` do lado `src/`.
 */
export function getComparableLicensesMirror(process) {
  return normalizeLicensesMirror(getEffectiveLicensesMirror(process))
}
