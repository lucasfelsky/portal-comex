import { isCargoReportRowEmpty } from './cargoReportFormModel'

// S10-I do Relatório de Carga: contador de pallets por item, total de pallets informado pelo COMEX, observação de
// avaria/ressalva por item e a regra que compara a soma com o total. Módulo puro (sem React e sem Firebase), usado
// pela aba Conferência do celular e pelo formulário do computador.
// Dados (doc `conference`): `palletsByRowId` { [rowId]: int 0..999 } e `damageByRowId` { [rowId]: { flagged, note,
// photos[] } }. Doc `current`: `expectedPallets` int 1..9999 | null. As rules só validam o formato do mapa; os valores
// de cada entrada são lidos e podados aqui. O legado `countOkByRowId` (Contagem OK, sem número) continua lido.

export const CARGO_PALLETS_ROW_MAX = 999
export const CARGO_PALLETS_EXPECTED_MAX = 9999
export const CARGO_ISSUE_NOTE_MAX = 1000
export const CARGO_PHOTOS_PER_ROW = 5
export const CARGO_PHOTOS_PER_CONFERENCE = 30
const PHOTO_PATH_MAX = 300
const PHOTO_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toRowIdSet(rowIds) {
  if (rowIds === undefined || rowIds === null) return null
  return new Set(rowIds)
}

function isRowPallets(value) {
  return Number.isInteger(value) && value >= 0 && value <= CARGO_PALLETS_ROW_MAX
}

// { [rowId]: int 0..999 }. Outro tipo ou fora da faixa sai; com `rowIds`, só as linhas que existem.
export function readPalletsMap(value, rowIds) {
  const result = {}
  if (!isPlainObject(value)) return result
  const allowed = toRowIdSet(rowIds)
  for (const [rowId, count] of Object.entries(value)) {
    if (allowed && !allowed.has(rowId)) continue
    if (isRowPallets(count)) result[rowId] = count
  }
  return result
}

// Total do COMEX: int 1..9999; qualquer outra coisa (0, decimal, texto, null) = não informado.
export function readExpectedPallets(value) {
  return Number.isInteger(value) && value >= 1 && value <= CARGO_PALLETS_EXPECTED_MAX ? value : null
}

function readPhotoText(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length >= 1 && text.length <= PHOTO_PATH_MAX ? text : ''
}

// Foto de avaria (shape fixado aqui e usado pelas fotos da próxima fatia). Inválida -> null.
export function normalizeCargoPhoto(raw) {
  if (!isPlainObject(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id : ''
  const path = readPhotoText(raw.path)
  const thumbPath = readPhotoText(raw.thumbPath)
  const byId = typeof raw.byId === 'string' ? raw.byId.trim().slice(0, 128) : ''
  const isPositive = (value) => Number.isInteger(value) && value > 0
  if (!PHOTO_ID_PATTERN.test(id) || !path || !thumbPath) return null
  if (!isPositive(raw.width) || !isPositive(raw.height)) return null
  if (!Number.isInteger(raw.size) || raw.size < 0 || !Number.isInteger(raw.uploadedAt) || raw.uploadedAt < 0) return null
  return { id, path, thumbPath, width: raw.width, height: raw.height, size: raw.size, uploadedAt: raw.uploadedAt, byId }
}

function readPhotos(value) {
  const photos = []
  const seen = new Set()
  for (const raw of Array.isArray(value) ? value : []) {
    const photo = normalizeCargoPhoto(raw)
    if (!photo || seen.has(photo.id)) continue
    seen.add(photo.id)
    photos.push(photo)
    if (photos.length >= CARGO_PHOTOS_PER_ROW) break
  }
  return photos
}

// { [rowId]: { flagged, note, photos } }: nota aparada e cortada em 1.000, fotos válidas e únicas (até 5); a entrada
// vazia (sem avaria marcada, sem nota e sem foto) some. Com `rowIds`, só as linhas que existem.
export function readDamageMap(value, rowIds) {
  const result = {}
  if (!isPlainObject(value)) return result
  const allowed = toRowIdSet(rowIds)
  for (const [rowId, entry] of Object.entries(value)) {
    if (allowed && !allowed.has(rowId)) continue
    if (!isPlainObject(entry)) continue
    const flagged = entry.flagged === true
    const note = typeof entry.note === 'string' ? entry.note.trim().slice(0, CARGO_ISSUE_NOTE_MAX) : ''
    const photos = readPhotos(entry.photos)
    if (flagged || note || photos.length > 0) result[rowId] = { flagged, note, photos }
  }
  return result
}

// ---------- contador por item ----------

// `count`: nº de pallets contados (null = nunca contado; 0 = zerado de propósito); `legacyOk`: relatório antigo com
// "Contagem OK" e sem número (conta como conferido, nunca vira número).
export function cargoRowPallets(conference, rowId) {
  const count = conference?.palletsByRowId?.[rowId]
  if (isRowPallets(count)) return { count, legacyOk: false }
  return { count: null, legacyOk: conference?.countOkByRowId?.[rowId] === true }
}

// Define o contador da linha (0..999) e tira dela o legado "Contagem OK".
export function setCargoRowPallets(conference, rowId, next) {
  const parsed = Number.isFinite(next) ? Math.trunc(next) : 0
  const count = Math.min(CARGO_PALLETS_ROW_MAX, Math.max(0, parsed))
  const countOkByRowId = { ...conference.countOkByRowId }
  delete countOkByRowId[rowId]
  return { ...conference, palletsByRowId: { ...conference.palletsByRowId, [rowId]: count }, countOkByRowId }
}

export function stepCargoRowPallets(conference, rowId, delta) {
  const { count } = cargoRowPallets(conference, rowId)
  return setCargoRowPallets(conference, rowId, (count ?? 0) + delta)
}

// ---------- observação (avaria / ressalva) por item ----------

export function readCargoRowIssue(conference, rowId) {
  const entry = conference?.damageByRowId?.[rowId]
  if (!isPlainObject(entry)) return { flagged: false, note: '', photos: [] }
  return {
    flagged: entry.flagged === true,
    note: String(entry.note ?? ''),
    photos: Array.isArray(entry.photos) ? entry.photos : [],
  }
}

// Aplica uma mudança parcial (`flagged`, `note`, `photos`); a entrada que fica vazia sai do mapa. A nota entra como
// veio (sem aparar: a pessoa está digitando); a gravação apara.
export function patchCargoRowIssue(conference, rowId, patch = {}) {
  const entry = { ...readCargoRowIssue(conference, rowId), ...patch }
  const damageByRowId = { ...conference.damageByRowId }
  if (!entry.flagged && entry.note === '' && entry.photos.length === 0) delete damageByRowId[rowId]
  else damageByRowId[rowId] = entry
  return { ...conference, damageByRowId }
}

// Item "com avaria/ressalva": avaria marcada, observação escrita ou foto.
export function hasCargoRowIssue(conference, rowId) {
  const { flagged, note, photos } = readCargoRowIssue(conference, rowId)
  return flagged || note.trim() !== '' || photos.length > 0
}

function filledRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => !isCargoReportRowEmpty(row))
}

export function listCargoIssueRows(rows, conference) {
  return filledRows(rows).filter((row) => hasCargoRowIssue(conference, row.id))
}

// Item com observação ESCRITA (só texto libera o fechamento com divergência).
export function hasCargoRowIssueNote(conference, rowId) {
  return readCargoRowIssue(conference, rowId).note.trim() !== ''
}

// ---------- soma x total do COMEX ----------

// { counted, expected, state: 'semTotal' | 'confere' | 'divergente', difference }. Só as linhas preenchidas entram na
// soma; `expectedPallets` não inteiro 1..9999 = sem total. Divergente = soma diferente do total (inclusive 0 contados).
export function summarizeCargoPallets(rows, conference, expectedPallets) {
  const counted = filledRows(rows).reduce((sum, row) => sum + (cargoRowPallets(conference, row.id).count ?? 0), 0)
  const expected = readExpectedPallets(expectedPallets)
  if (expected === null) return { counted, expected, state: 'semTotal', difference: 0 }
  return { counted, expected, state: counted === expected ? 'confere' : 'divergente', difference: counted - expected }
}

function palletsWord(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

// "Pallets da carga: 23 contados de 25 informados pelo COMEX." Com `withState` (padrão), a divergência fecha com
// " Divergente."; o celular passa `withState: false` porque mostra o selo ao lado.
export function formatCargoPalletsSummary(summary, { withState = true } = {}) {
  const counted = palletsWord(summary.counted, 'contado', 'contados')
  if (summary.state === 'semTotal') return `Pallets da carga: ${counted}. Total não informado pelo COMEX.`
  const base = `Pallets da carga: ${counted} de ${palletsWord(summary.expected, 'informado', 'informados')} pelo COMEX.`
  return summary.state === 'divergente' && withState ? `${base} Divergente.` : base
}

// ---------- status sugerido ----------

export function hasAnyCargoIssue(conference) {
  return Object.keys(conference?.damageByRowId ?? {}).some((rowId) => hasCargoRowIssue(conference, rowId))
}

// Quando a conferência passa de "nenhum item com avaria" para "algum item com avaria" e o status do recebimento está
// vazio, o status vira "Com ressalva" (a pessoa pode trocar). Status já escolhido nunca muda sozinho.
export function applyCargoIssueStatusSuggestion(previous, next) {
  if (!hasAnyCargoIssue(previous) && hasAnyCargoIssue(next) && next.receiptStatus === '') {
    return { conference: { ...next, receiptStatus: 'com_ressalva' }, suggested: true }
  }
  return { conference: next, suggested: false }
}
