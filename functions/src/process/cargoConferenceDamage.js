// S11 (J1): lógica PURA das fotos de avaria da Conferência do Relatório de Carga (sem firebase-admin nem
// firebase-functions: testada em `tests/unit` sem mocks).
//
// Dados: `processes/{id}/cargoReport/conference.damageByRowId` = `{ [rowId]: { flagged, note, photos: Photo[] } }`,
// `Photo = { id, path, thumbPath, width, height, size, uploadedAt, byId }` (shape fixado em
// `src/features/processes/cargoConferenceIssues.js`). Arquivos em
// `processes/{processId}/cargo-conference/{rowId}/{ts}-{uid}-{photoId}[-t].jpg` (rowId saneado em `[\w-]`).
// O Storage não lê o Firestore: o vínculo foto <-> processo/linha é conferido aqui, a partir do doc da conferência.
//
// S10-J2 (aviso ao COMEX com avarias + espelho para técnico/faturamento): `summarizeCargoConferenceDamage` resume as
// avarias a partir de `conference` + `current`; `buildCargoConferenceDamageLines`/`Text` montam a seção do aviso;
// `extractCargoConferenceDamageLines` a lê de volta do `body` da notificação; `buildCargoDamageMirror` monta o espelho
// `processes/{id}/cargoReport/damage` (SEM caminho de arquivo, `byId`, NF, etiquetas nem descarga).

import {
  buildCargoConferenceCountLines,
  extractCargoNoticeSectionLines,
  readCargoPartialPallets,
  summarizeCargoConferenceCount,
} from './cargoConferenceCount.js'
import { DOCUMENT_READER_ROLES } from './documentIndex.js'

export const CARGO_CONFERENCE_PHOTO_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/
// Teto de caminhos apagados por gravação (5 fotos x 2 arquivos x 200 linhas é o máximo teórico das rules; o cliente
// limita a 30 fotos). Acima disso o resto fica órfão (some com o processo) e o trigger registra o aviso.
export const CARGO_CONFERENCE_MAX_REMOVED_PATHS = 200

const ALLOWED_DOWNLOAD_ROLES = ['admin', 'logistica']

// S10-J2: tetos do aviso e do espelho (mesmos do cliente: 5 fotos por item, 30 por conferência, nota de 1.000).
export const CARGO_DAMAGE_PHOTOS_PER_ROW = 5
export const CARGO_DAMAGE_PHOTOS_PER_CONFERENCE = 30
export const CARGO_DAMAGE_NOTE_MAX = 1000
export const CARGO_DAMAGE_NOTICE_MAX_ITEMS = 10
export const CARGO_DAMAGE_NOTICE_NOTE_MAX = 200
export const CARGO_DAMAGE_NOTICE_LABEL_MAX = 120
// Início da seção no corpo do aviso: o e-mail aos usuários a procura no `body` (sem leitura extra).
export const CARGO_DAMAGE_SECTION_MARKER = 'Avarias e ressalvas:'
const CARGO_PALLETS_ROW_MAX = 999
const CARGO_PALLETS_EXPECTED_MAX = 9999

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

// Mesmo saneamento do cliente (`buildCargoPhotoPaths`): só `[\w-]`; o resto vira "-".
export function sanitizeCargoPhotoPathSegment(value, fallback = 'item') {
  const text = String(value ?? '').trim().replace(/[^\w-]+/g, '-')
  return text || fallback
}

export function cargoConferencePhotoPrefix(processId) {
  return `processes/${processId}/cargo-conference/`
}

function isActiveCorporateToken(token) {
  if (!/^\s*ativo\s*$/i.test(String(token.status ?? ''))) return false
  return String(token.email ?? '').toLowerCase().endsWith('@sqquimica.com')
}

// Perfis que baixam a foto direto da conferência: admin e logística ativos com e-mail corporativo. Técnico e
// faturamento passam por `canDownloadCargoConferencePhotosAsReader` + o espelho `cargoReport/damage`.
export function canDownloadCargoConferencePhotos(token) {
  if (!isPlainObject(token)) return false
  if (typeof token.role !== 'string' || !ALLOWED_DOWNLOAD_ROLES.includes(token.role)) return false
  return isActiveCorporateToken(token)
}

// S10-J2: técnico e faturamento (`DOCUMENT_READER_ROLES`) ativos com e-mail corporativo. Só baixam foto que está no
// espelho e ainda na conferência (o handler confere os dois).
export function canDownloadCargoConferencePhotosAsReader(token) {
  if (!isPlainObject(token)) return false
  if (typeof token.role !== 'string' || !DOCUMENT_READER_ROLES.includes(token.role)) return false
  return isActiveCorporateToken(token)
}

// A foto de `photoId` consta no espelho `cargoReport/damage` (lista de fotos dos itens, sem caminho).
export function isPhotoInCargoDamageMirror(mirror, photoId) {
  if (typeof photoId !== 'string' || !CARGO_CONFERENCE_PHOTO_ID_PATTERN.test(photoId)) return false
  if (!isPlainObject(mirror) || !Array.isArray(mirror.items)) return false
  return mirror.items.some(
    (item) => isPlainObject(item) && Array.isArray(item.photos) && item.photos.some((photo) => photo?.id === photoId)
  )
}

// Caminho do arquivo dentro do processo: `processes/{id}/cargo-conference/{rowId}/{arquivo}`, sem `..`, `//`, `\` ou
// NUL (mesmo teste de `resolveProcessDocumentStoragePath`). Com `rowId`, o segmento da linha tem de ser o da linha
// (saneado) dona da foto. Inválido -> null.
export function resolveCargoConferencePhotoPath(processId, path, rowId) {
  const storagePath = typeof path === 'string' ? path : ''
  if (!processId || !storagePath) return null
  const prefix = cargoConferencePhotoPrefix(processId)
  if (!storagePath.startsWith(prefix)) return null
  const hasUnsafeSegment = storagePath.includes('..')
    || storagePath.includes('//')
    || storagePath.includes(String.fromCharCode(92))
    || storagePath.includes(String.fromCharCode(0))
  if (hasUnsafeSegment) return null
  const segments = storagePath.slice(prefix.length).split('/')
  if (segments.length !== 2 || !segments[0] || !segments[1]) return null
  if (rowId !== undefined && segments[0] !== sanitizeCargoPhotoPathSegment(rowId)) return null
  return storagePath
}

function listRowPhotos(conferenceData) {
  const map = conferenceData?.damageByRowId
  if (!isPlainObject(map)) return []
  const result = []
  for (const [rowId, entry] of Object.entries(map)) {
    if (!isPlainObject(entry) || !Array.isArray(entry.photos)) continue
    for (const photo of entry.photos) {
      if (isPlainObject(photo)) result.push({ rowId, photo })
    }
  }
  return result
}

// Procura a foto pelo id em toda a conferência. Não achou (ou id inválido) -> null.
export function findCargoConferencePhoto(conferenceData, photoId) {
  if (typeof photoId !== 'string' || !CARGO_CONFERENCE_PHOTO_ID_PATTERN.test(photoId)) return null
  const found = listRowPhotos(conferenceData).find(({ photo }) => photo.id === photoId)
  return found ?? null
}

// Caminho do arquivo a servir (`full` = foto reduzida; `thumb` = miniatura) já validado contra o processo e a linha.
export function resolveCargoConferencePhotoFile(processId, found, size) {
  if (!found) return null
  const raw = size === 'thumb' ? found.photo.thumbPath : found.photo.path
  return resolveCargoConferencePhotoPath(processId, raw, found.rowId)
}

function collectPaths(conferenceData, { processId } = {}) {
  const all = new Set()
  const owned = new Set()
  for (const { rowId, photo } of listRowPhotos(conferenceData)) {
    for (const raw of [photo.path, photo.thumbPath]) {
      if (typeof raw !== 'string' || !raw) continue
      all.add(raw)
      if (processId && resolveCargoConferencePhotoPath(processId, raw, rowId)) owned.add(raw)
    }
  }
  return { all, owned }
}

// Arquivos a apagar do Storage: estavam no doc "antes" e não estão no "depois" (foto removida). Travas:
// - "depois" sem a chave `damageByRowId` (ou doc apagado) NUNCA apaga nada (uma gravação sem a chave não é remoção);
// - só caminhos do próprio processo/linha (metadado adulterado não aponta para fora);
// - caminho ainda referenciado no "depois" (foto movida de linha) não sai.
export function listRemovedCargoConferencePhotoPaths(before, after, processId) {
  if (!processId || !isPlainObject(before) || !isPlainObject(after)) return []
  if (!('damageByRowId' in after) || !isPlainObject(after.damageByRowId)) return []
  const kept = collectPaths(after).all
  const removed = [...collectPaths(before, { processId }).owned].filter((path) => !kept.has(path))
  return removed.slice(0, CARGO_CONFERENCE_MAX_REMOVED_PATHS)
}

// ---------- S10-J2: resumo das avarias, seção do aviso e espelho ----------

function readText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function readPositiveInt(value) {
  return Number.isInteger(value) && value > 0 ? value : null
}

// Mesma regra do cliente (`isCargoReportRowEmpty`): linha sem nenhum texto nem número não conta.
const ROW_TEXT_FIELDS = [
  'po', 'dbcorpCode', 'supplierDescription', 'sqDescription', 'supplierLot', 'wmsLabel', 'sqLabel',
]
const ROW_NUMBER_FIELDS = ['quantityKg', 'count', 'packageWeightKg']

function isBlankNumeric(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

function isCargoRowEmpty(row) {
  return (
    ROW_TEXT_FIELDS.every((field) => String(row?.[field] ?? '').trim() === '')
    && ROW_NUMBER_FIELDS.every((field) => isBlankNumeric(row?.[field]))
  )
}

// Fotos do item: id válido e único, até 5 por item e `budget` no total da conferência.
function readSummaryPhotos(value, budget) {
  const photos = []
  const seen = new Set()
  for (const raw of Array.isArray(value) ? value : []) {
    if (photos.length >= CARGO_DAMAGE_PHOTOS_PER_ROW || photos.length >= budget) break
    if (!isPlainObject(raw)) continue
    const id = raw.id
    if (typeof id !== 'string' || !CARGO_CONFERENCE_PHOTO_ID_PATTERN.test(id) || seen.has(id)) continue
    seen.add(id)
    photos.push({ id, width: readPositiveInt(raw.width), height: readPositiveInt(raw.height) })
  }
  return photos
}

function readExpectedPallets(value) {
  return Number.isInteger(value) && value >= 1 && value <= CARGO_PALLETS_EXPECTED_MAX ? value : null
}

// Linhas preenchidas do `current.rows`, na ordem do relatório e já com rowId: `{ row, rowId, index, label, lot }`.
// `index` = posição entre as linhas preenchidas (base 1); rótulo = descrição SQ, senão a do fornecedor, senão "Item N".
// Linha vazia (regra do cliente) ou sem id fica de fora. Fonte única das avarias e da Contagem (Fatia D).
export function listCargoNoticeRows(currentData) {
  const rows = (Array.isArray(currentData?.rows) ? currentData.rows : []).filter(
    (row) => isPlainObject(row) && !isCargoRowEmpty(row)
  )
  const result = []
  rows.forEach((row, position) => {
    const rowId = readText(row.id)
    if (!rowId) return
    const index = position + 1
    result.push({
      row,
      rowId,
      index,
      label: readText(row.sqDescription) || readText(row.supplierDescription) || `Item ${index}`,
      lot: readText(row.supplierLot),
    })
  })
  return result
}

// Resume as avarias da conferência fechada. Lê `current.rows` (linhas preenchidas, na ordem do relatório),
// `current.expectedPallets`, `conference.palletsByRowId`, `conference.partialPallets` e `conference.damageByRowId`. Item
// com avaria = marcado, com observação escrita ou com foto (mesma regra do cliente); linha que já não existe no
// `current` fica de fora. Rótulo = descrição SQ, senão a do fornecedor, senão "Item N".
// `pallets.state`: semTotal | confere | divergente. Fatia D (D-7/D-27): `counted` inclui os pallets parciais válidos
// (cada um conta 1) e `pallets.partial` traz quantos são (a chave só existe quando há parcial: sem parcial o resumo é o de
// antes).
export function summarizeCargoConferenceDamage(conferenceData, currentData) {
  const noticeRows = listCargoNoticeRows(currentData)
  const damageMap = isPlainObject(conferenceData?.damageByRowId) ? conferenceData.damageByRowId : {}
  const palletsMap = isPlainObject(conferenceData?.palletsByRowId) ? conferenceData.palletsByRowId : {}

  const items = []
  let photoCount = 0
  let counted = 0

  noticeRows.forEach(({ row, rowId, index, label }) => {
    const pallets = palletsMap[rowId]
    if (Number.isInteger(pallets) && pallets >= 0 && pallets <= CARGO_PALLETS_ROW_MAX) counted += pallets

    const entry = damageMap[rowId]
    if (!isPlainObject(entry)) return
    const note = readText(entry.note).slice(0, CARGO_DAMAGE_NOTE_MAX)
    const flagged = entry.flagged === true
    const photos = readSummaryPhotos(entry.photos, CARGO_DAMAGE_PHOTOS_PER_CONFERENCE - photoCount)
    if (!flagged && !note && photos.length === 0) return

    photoCount += photos.length
    items.push({
      rowId,
      index,
      label,
      code: readText(row.dbcorpCode),
      note,
      flagged,
      photoCount: photos.length,
      photos,
    })
  })

  const partial = readCargoPartialPallets(conferenceData?.partialPallets, noticeRows.map((entry) => entry.rowId)).length
  counted += partial

  const expected = readExpectedPallets(currentData?.expectedPallets)
  const state = expected === null ? 'semTotal' : counted === expected ? 'confere' : 'divergente'
  return {
    items,
    itemCount: items.length,
    photoCount,
    pallets: { counted, expected, state, ...(partial > 0 ? { partial } : {}) },
  }
}

function pluralize(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

// "Pallets: 23 contados de 25 informados pelo COMEX (divergente)." Sem total do COMEX: null (nada a dizer). Com pallets
// parciais no total (Fatia D): "... (confere), inclui 2 parciais."
export function formatCargoDamagePalletsLine(pallets) {
  if (!isPlainObject(pallets) || pallets.state === 'semTotal' || pallets.expected === null || pallets.expected === undefined) {
    return null
  }
  const state = pallets.state === 'confere' ? 'confere' : 'divergente'
  const partial = Number.isInteger(pallets.partial) && pallets.partial > 0
    ? `, inclui ${pluralize(pallets.partial, 'parcial', 'parciais')}`
    : ''
  return `Pallets: ${pluralize(pallets.counted, 'contado', 'contados')} de ${pluralize(pallets.expected, 'informado', 'informados')} pelo COMEX (${state})${partial}.`
}

function clipText(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  const chars = Array.from(text)
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : text
}

function buildItemLine(item) {
  const fallbackLabel = `Item ${item.index}`
  const cleanLabel = clipText(item.label, CARGO_DAMAGE_NOTICE_LABEL_MAX)
  const label = cleanLabel && cleanLabel !== fallbackLabel ? ` · ${cleanLabel}` : ''
  const photoCount = Number.isInteger(item.photoCount) ? item.photoCount : (item.photos?.length ?? 0)
  const photos = photoCount > 0 ? ` · ${pluralize(photoCount, 'foto', 'fotos')}` : ''
  const note = clipText(item.note, CARGO_DAMAGE_NOTICE_NOTE_MAX)
  let detail = note
  if (!detail) detail = photoCount > 0 ? '(sem observação)' : 'avaria registrada, sem observação'
  return `• ${fallbackLabel}${label}${photos}: ${detail}`
}

// Linhas da seção do aviso (`[]` sem avaria): cabeçalho, pallets (se o COMEX informou o total), até 10 itens (nota
// cortada em 200 caracteres) e o resto como "+ N itens no Portal.".
export function buildCargoConferenceDamageLines(summary) {
  const items = Array.isArray(summary?.items) ? summary.items : []
  if (items.length === 0) return []

  const itemsWord = pluralize(items.length, 'item', 'itens')
  const photoCount = Number.isInteger(summary.photoCount) ? summary.photoCount : 0
  const header = photoCount > 0
    ? `${CARGO_DAMAGE_SECTION_MARKER} ${itemsWord}, ${pluralize(photoCount, 'foto', 'fotos')} no Portal.`
    : `${CARGO_DAMAGE_SECTION_MARKER} ${itemsWord}.`

  const lines = [header]
  const palletsLine = formatCargoDamagePalletsLine(summary.pallets)
  if (palletsLine) lines.push(palletsLine)
  for (const item of items.slice(0, CARGO_DAMAGE_NOTICE_MAX_ITEMS)) lines.push(buildItemLine(item))
  const hidden = items.length - CARGO_DAMAGE_NOTICE_MAX_ITEMS
  if (hidden > 0) lines.push(`+ ${pluralize(hidden, 'item', 'itens')} no Portal.`)
  return lines
}

export function buildCargoConferenceDamageText(lines) {
  const list = (Array.isArray(lines) ? lines : []).filter((line) => typeof line === 'string' && line.trim() !== '')
  return list.length === 0 ? '' : list.join('\n')
}

// Lê a seção de volta do `body` da notificação: do início da linha "Avarias e ressalvas:" até o fim OU até a próxima
// linha que abre com outro marcador de seção ("Contagem:", Fatia D). `body` de hoje (sem a seção), vazio ou que não é
// texto -> `[]`; corpo antigo (sem "Contagem:") -> o mesmo resultado de antes.
export function extractCargoConferenceDamageLines(body) {
  return extractCargoNoticeSectionLines(body, CARGO_DAMAGE_SECTION_MARKER)
}

// Fatia D: as duas seções do aviso a partir de `conference` + `current`. `countLines` (Contagem, [] sem parcial e sem
// divergência), `damageLines` (Avarias, [] sem avaria), `divergent` (há lote com unidades divergentes: o assunto ganha o
// sufixo) e os resumos (para o log, só números). A linha de pallets fica SÓ numa das seções: na de avarias quando ela
// existe; na Contagem quando não há avaria.
export function buildCargoConferenceNoticeSections(conferenceData, currentData) {
  const damageSummary = summarizeCargoConferenceDamage(conferenceData, currentData)
  const damageLines = buildCargoConferenceDamageLines(damageSummary)
  const countSummary = summarizeCargoConferenceCount(conferenceData, listCargoNoticeRows(currentData))
  const countLines = buildCargoConferenceCountLines(countSummary, {
    palletsLine: damageLines.length === 0 ? formatCargoDamagePalletsLine(damageSummary.pallets) : null,
  })
  return { countLines, damageLines, divergent: countSummary.divergentCount > 0, damageSummary, countSummary }
}

// Espelho `processes/{id}/cargoReport/damage` (10 chaves). Só o necessário para Técnico/Faturamento: nada de caminho de
// arquivo, `byId`, NF, etiquetas nem descarga. `updatedAt` vai `null`: o trigger troca por `serverTimestamp()`.
export function buildCargoDamageMirror(summary, conferenceData) {
  const items = Array.isArray(summary?.items) ? summary.items : []
  const pallets = isPlainObject(summary?.pallets) ? summary.pallets : {}
  const revision = conferenceData?.revision
  return {
    schemaVersion: 1,
    conferenceRevision: Number.isInteger(revision) && revision >= 0 ? revision : 0,
    closedDate: readText(conferenceData?.closedDate).slice(0, 10),
    closedByName: readText(conferenceData?.closedByName).slice(0, 200),
    receiptStatus: readText(conferenceData?.receiptStatus).slice(0, 40),
    pallets: {
      counted: Number.isInteger(pallets.counted) ? pallets.counted : 0,
      expected: Number.isInteger(pallets.expected) ? pallets.expected : null,
    },
    items: items.map((item) => ({
      rowId: item.rowId,
      index: item.index,
      label: String(item.label ?? '').slice(0, 200),
      code: String(item.code ?? '').slice(0, 100),
      note: String(item.note ?? ''),
      flagged: item.flagged === true,
      photos: (Array.isArray(item.photos) ? item.photos : []).map((photo) => ({
        id: photo.id,
        width: photo.width ?? null,
        height: photo.height ?? null,
      })),
    })),
    itemCount: items.length,
    photoCount: Number.isInteger(summary?.photoCount) ? summary.photoCount : 0,
    updatedAt: null,
  }
}

// O espelho é regravado quando a conferência está `fechada` e o fechamento é novo: doc criado já fechado, vinda de
// outro status ou com outra revisão. Fechada -> fechada na mesma revisão não regrava; reabrir não mexe.
export function shouldWriteCargoDamageMirror(before, after) {
  if (!isPlainObject(after) || after.status !== 'fechada') return false
  if (!isPlainObject(before)) return true
  return before.status !== 'fechada' || before.revision !== after.revision
}
