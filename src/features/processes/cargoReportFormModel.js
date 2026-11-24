// S3 do Relatório de Carga: formulário FR.CMX.001 (rev. 005) preenchido no Portal.
// Módulo puro (sem React, sem firebase): papéis, fórmulas que espelham o Excel R5 (lote SQ,
// peso líquido por lookup, nº de embalagens), alertas, normalização e montagem dos payloads
// gravados em `processes/{id}/cargoReport/current` e `.../conference`.
// As colunas calculadas (lote SQ, peso líquido, nº de embalagens) NUNCA são gravadas.
// S7: "Salvar e fechar" por área. COMEX fecha o `current` (`status: 'concluido'`); a logística grava e
// fecha o `conference` (`status: 'fechada'`). Etiqueta WMS/SQ sempre em MAIÚSCULAS.
import { getItemPackaging, normalizeItemCode, parseCatalogWeight } from './cargoReportCatalog'

export const CARGO_REPORT_FORM_CODE = 'FR.CMX.001'
export const CARGO_REPORT_FORM_REVISION = '005'
export const CARGO_REPORT_SCHEMA_VERSION = 1
// Teto de segurança do Portal (UI, importador, repositório e rules). O modelo FR.CMX.001 tem 28 linhas de
// dados numa página; acima disso o Excel e a impressão ganham linhas extras e várias páginas.
export const CARGO_REPORT_MAX_ROWS = 200
export const CARGO_REPORT_TEMPLATE_ROWS = 28
export const CARGO_REPORT_TITLE_PREFIX = 'RELATÓRIO DE CARGA - '
export const CARGO_REPORT_LIMITS = { text: 120, description: 200, notes: 2000, nf: 40, rowId: 64 }
export const CARGO_REPORT_CONFLICT_CODE = 'cargoReport/revision-conflict'
export const CARGO_REPORT_ATTACHED_NOT_SAVED_CODE = 'cargoReport/attached-not-saved'
export const CARGO_REPORT_ROWS_LIMIT_MESSAGE =
  'O relatório já tem 200 linhas, o limite do Portal. Para mais itens, gere um segundo relatório.'
export const CARGO_REPORT_INVALID_NUMBER_MESSAGE = 'Número inválido'

export const CARGO_TYPE_OPTIONS = [
  { value: 'FCL', label: 'FCL' },
  { value: 'LCL', label: 'LCL' },
  { value: 'CONSOLIDADO', label: 'CONSOLIDADO', shortLabel: 'CONS.' },
  { value: 'AEREO', label: 'AÉREO' },
]

export const RECEIPT_STATUS_OPTIONS = [
  { value: '', label: 'Não informado' },
  { value: 'sem_ressalva', label: 'Sem ressalva' },
  { value: 'com_ressalva', label: 'Com ressalva' },
]

const CARGO_TYPE_VALUES = CARGO_TYPE_OPTIONS.map((option) => option.value)
const RECEIPT_STATUS_VALUES = RECEIPT_STATUS_OPTIONS.map((option) => option.value)
const STATUS_VALUES = ['rascunho', 'concluido']
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
// S8: `YYYY-MM-DDTHH:mm` (hora de parede de Brasília, sem fuso); aceita segundos e frações, que são cortados.
const DATE_TIME_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/
// Descarga mais longa que 24 h é erro de digitação (limite só no cliente; as rules não calculam duração).
export const CARGO_UNLOAD_MAX_MINUTES = 1440

// Campos de texto e numéricos da linha (a ordem espelha as 13 chaves aceitas pelas rules).
const ROW_TEXT_FIELDS = [
  ['po', 'text'],
  ['dbcorpCode', 'text'],
  ['supplierDescription', 'description'],
  ['sqDescription', 'description'],
  ['supplierLot', 'text'],
  ['wmsLabel', 'text'],
  ['sqLabel', 'text'],
]
const ROW_NUMBER_FIELDS = ['quantityKg', 'count', 'packageWeightKg']

// ---------- papéis ----------

export function canEditCargoReport(role) {
  return role === 'admin'
}

export function canConferCargoReport(role) {
  return role === 'admin' || role === 'logistica'
}

// ---------- S7: estados por área ----------
// Derivados de 2 docs: `current.status` (rascunho | concluido) e `conference.status` (aberta | fechada).
//   rascunho     = COMEX em rascunho (conferência aguarda)
//   comexFechado = COMEX fechado, logística conferindo
//   concluido    = COMEX e logística fechados
export const CARGO_CONFERENCE_STATUS = { open: 'aberta', closed: 'fechada' }
export const CARGO_STAGE = { draft: 'rascunho', comexClosed: 'comexFechado', done: 'concluido' }

export function getCargoReportStage(currentStatus, conferenceStatus) {
  if (currentStatus !== 'concluido') return CARGO_STAGE.draft
  return conferenceStatus === CARGO_CONFERENCE_STATUS.closed ? CARGO_STAGE.done : CARGO_STAGE.comexClosed
}

// Logística salva a conferência (sem fechar) nos estados 1 e 2; o admin nunca grava o conteúdo dela.
export function canSaveCargoConference(role, stage) {
  return role === 'logistica' && (stage === CARGO_STAGE.draft || stage === CARGO_STAGE.comexClosed)
}

// Só a logística fecha, e só depois que o COMEX fechou a parte dele.
export function canCloseCargoConference(role, stage) {
  return role === 'logistica' && stage === CARGO_STAGE.comexClosed
}

// Só o admin reabre: a conferência (estado 3 -> 2) e a parte do COMEX (estados 2 e 3 -> 1).
export function canReopenCargoConference(role, stage) {
  return role === 'admin' && stage === CARGO_STAGE.done
}

export function canReopenCargoReportComex(role, stage) {
  return role === 'admin' && (stage === CARGO_STAGE.comexClosed || stage === CARGO_STAGE.done)
}

// Etiqueta WMS/SQ: sempre MAIÚSCULAS (pt-BR: ç -> Ç, ã -> Ã), sem espaços nas pontas, até 120 caracteres.
// O corte vale DEPOIS das maiúsculas (ß -> SS muda o tamanho).
export function normalizeCargoLabel(value) {
  return String(value ?? '')
    .toLocaleUpperCase('pt-BR')
    .trim()
    .slice(0, CARGO_REPORT_LIMITS.text)
}

export function canOpenCargoReport(role) {
  return role === 'admin' || role === 'logistica'
}

// ---------- linhas ----------

export function createCargoReportRowId() {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `r-${uuid}`
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createEmptyCargoReportRow(id = createCargoReportRowId()) {
  return {
    id,
    po: '',
    dbcorpCode: '',
    supplierDescription: '',
    sqDescription: '',
    supplierLot: '',
    wmsLabel: '',
    sqLabel: '',
    quantityKg: null,
    count: null,
    packageWeightKg: null,
    frozenNetWeightKg: null,
    frozenPackages: null,
  }
}

function clip(value, max) {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

function readText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function readNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : null
}

function readDateKey(value) {
  return typeof value === 'string' && DATE_KEY_PATTERN.test(value) ? value : ''
}

// S8: início/fim da descarga como texto `YYYY-MM-DDTHH:mm`. Ano 2020–2099 (igual às rules), mês, dia, hora e
// minuto em faixa; o calendário não é conferido (2026-02-30 passa, como em `receivedDate`).
export function readDateTimeKey(value) {
  const match = typeof value === 'string' ? DATE_TIME_KEY_PATTERN.exec(value) : null
  if (!match) return ''
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const valid =
    year >= 2020 && year <= 2099 && month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour <= 23 && minute <= 59
  return valid ? value.slice(0, 16) : ''
}

// '2026-11-24T08:15' -> '2026-11-24'; inválido -> ''.
export function cargoDatePart(value) {
  return readDateTimeKey(value).slice(0, 10)
}

// "Data de recebimento" é fixa: o dia do início da descarga. Sem início, vale o valor já gravado (legado).
export function resolveCargoReceivedDate({ unloadStartAt, receivedDate } = {}) {
  return cargoDatePart(unloadStartAt) || readDateKey(receivedDate)
}

// Minutos de parede entre dois `YYYY-MM-DDTHH:mm`, pelos componentes do texto (independe do fuso do aparelho;
// nunca `new Date(texto)`). Inválido, vazio ou fim antes do início -> null.
export function computeCargoUnloadMinutes(start, end) {
  const from = readDateTimeKey(start)
  const to = readDateTimeKey(end)
  if (!from || !to) return null
  const toUtc = (key) => {
    const [year, month, day, hour, minute] = [key.slice(0, 4), key.slice(5, 7), key.slice(8, 10), key.slice(11, 13), key.slice(14, 16)].map(Number)
    return Date.UTC(year, month - 1, day, hour, minute)
  }
  const minutes = (toUtc(to) - toUtc(from)) / 60000
  return minutes >= 0 ? minutes : null
}

export const CARGO_UNLOAD_MESSAGES = {
  missingStart: 'Informe o início da descarga.',
  endBeforeStart: 'O fim da descarga deve ser igual ou posterior ao início.',
  tooLong: 'A descarga passa de 24 horas. Confira as datas.',
}

// -> { start, end } com a mensagem de cada campo ('' = sem erro). Fim sem início: erro no Início; fim antes do
// início e mais de 24 h: erro no Fim. Só início, só fim vazio ou os dois vazios não são erro.
export function validateCargoUnload({ unloadStartAt, unloadEndAt } = {}) {
  const result = { start: '', end: '' }
  const start = readDateTimeKey(unloadStartAt)
  const end = readDateTimeKey(unloadEndAt)
  if (!end) return result
  if (!start) {
    result.start = CARGO_UNLOAD_MESSAGES.missingStart
    return result
  }
  const minutes = computeCargoUnloadMinutes(start, end)
  if (minutes === null) result.end = CARGO_UNLOAD_MESSAGES.endBeforeStart
  else if (minutes > CARGO_UNLOAD_MAX_MINUTES) result.end = CARGO_UNLOAD_MESSAGES.tooLong
  return result
}

function readRowId(value) {
  const id = typeof value === 'string' ? value.trim() : ''
  return id.length >= 1 && id.length <= CARGO_REPORT_LIMITS.rowId ? id : createCargoReportRowId()
}

function readLastGenerated(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const keys = ['documentId', 'revision', 'at', 'byId']
  return keys.every((key) => key in value) && Object.keys(value).length === keys.length ? { ...value } : null
}

function normalizeRowFromDoc(raw) {
  const row = createEmptyCargoReportRow(readRowId(raw?.id))
  for (const [field, limit] of ROW_TEXT_FIELDS) {
    row[field] = readText(raw?.[field], CARGO_REPORT_LIMITS[limit])
  }
  row.quantityKg = readNumber(raw?.quantityKg)
  row.packageWeightKg = readNumber(raw?.packageWeightKg)
  row.count = readCount(raw?.count)
  row.frozenNetWeightKg = readNumber(raw?.frozenNetWeightKg)
  row.frozenPackages = readNumber(raw?.frozenPackages)
  return row
}

function sanitizeEnum(value, allowed) {
  return typeof value === 'string' && allowed.includes(value) ? value : ''
}

function toDateOrNull(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value.toDate === 'function') return value.toDate()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// Form a partir do doc lido. Tolerante: chave ausente ou de tipo errado vira `''`/`null`.
export function fromCargoReportDoc(data) {
  const doc = data && typeof data === 'object' ? data : {}
  const rows = Array.isArray(doc.rows) ? doc.rows.slice(0, CARGO_REPORT_MAX_ROWS) : []

  return {
    revision: Number.isInteger(doc.revision) && doc.revision >= 0 ? doc.revision : 0,
    status: STATUS_VALUES.includes(doc.status) ? doc.status : 'rascunho',
    cargoType: sanitizeEnum(doc.cargoType, CARGO_TYPE_VALUES),
    titleSuffix: readText(doc.titleSuffix, CARGO_REPORT_LIMITS.text),
    rows: rows.map(normalizeRowFromDoc),
    // `notes`, `receiptStatus`, `receivedDate` e `nfNumber` são legado do `current` (S7: quem edita é a logística,
    // no doc `conference`); o valor lido volta intacto no próximo salvar para não apagar dado.
    notes: readText(doc.notes, CARGO_REPORT_LIMITS.notes),
    nfNumber: readText(doc.nfNumber, CARGO_REPORT_LIMITS.nf),
    receiptStatus: sanitizeEnum(doc.receiptStatus, RECEIPT_STATUS_VALUES),
    receivedDate: readDateKey(doc.receivedDate),
    completedDate: readDateKey(doc.completedDate),
    catalogVersion: Number.isInteger(doc.catalogVersion) && doc.catalogVersion >= 0 ? doc.catalogVersion : 0,
    lastGenerated: readLastGenerated(doc.lastGenerated),
    updatedAt: toDateOrNull(doc.updatedAt),
    updatedByName: readText(doc.updatedByName, CARGO_REPORT_LIMITS.text),
  }
}

// Form NÃO salvo (revision 0), pré-preenchido com os dados do processo.
export function buildInitialCargoReport(process) {
  const category = typeof process?.category === 'string' ? process.category : ''
  const processNumber = clip(process?.processNumber, CARGO_REPORT_LIMITS.text)
  const items = Array.isArray(process?.items) ? process.items.slice(0, CARGO_REPORT_MAX_ROWS) : []

  const rows = items.map((item) => {
    const row = createEmptyCargoReportRow()
    row.po = clip(category === 'CONSOLIDADO' ? item?.poNumber : process?.processNumber, CARGO_REPORT_LIMITS.text)
    row.sqDescription = clip(item?.commercialName, CARGO_REPORT_LIMITS.description)
    const quantity = Number(item?.quantity)
    row.quantityKg = Number.isFinite(quantity) && quantity > 0 ? quantity : null
    return row
  })

  return {
    revision: 0,
    status: 'rascunho',
    cargoType: CARGO_TYPE_VALUES.includes(category) ? category : '',
    titleSuffix: clip(process?.name, CARGO_REPORT_LIMITS.text) || processNumber,
    rows,
    notes: '',
    nfNumber: '',
    receiptStatus: '',
    receivedDate: '',
    completedDate: '',
    catalogVersion: 0,
    lastGenerated: null,
    updatedAt: null,
    updatedByName: '',
  }
}

// ---------- números ----------

// -> number | null (vazio) | NaN (inválido). Mesmo parser da tabela Item x Emb.
export function parseCargoNumber(text) {
  return parseCatalogWeight(text)
}

// Contagem: inteiro >= 0, senão NaN.
export function parseCargoCount(text) {
  const value = parseCatalogWeight(text)
  if (value === null || Number.isNaN(value)) return value
  return Number.isInteger(value) && value >= 0 ? value : Number.NaN
}

// `decimals` fixa as casas; sem ele vale `minDecimals` (0) até `maxDecimals` (3). `null` -> ''.
export function formatCargoNumber(value, { decimals, minDecimals = 0, maxDecimals = 3 } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  const minimum = decimals ?? minDecimals
  const maximum = decimals ?? maxDecimals
  return value.toLocaleString('pt-BR', { minimumFractionDigits: minimum, maximumFractionDigits: maximum })
}

// Os campos numéricos ficam como texto durante a edição; aqui viram número ou `null` (vazio/inválido).
function numericOrNull(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = parseCargoNumber(value)
    return parsed === null || Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function isBlankNumeric(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

// ---------- fórmulas (espelham o Excel R5) ----------

// `H = G & LEFT(B,3)`. Diferença deliberada: com o lote do fornecedor vazio o resultado é `''`
// (o Excel mostraria só as 3 letras do PO).
export function computeLotSq(supplierLot, po) {
  const lot = String(supplierLot ?? '').trim()
  if (!lot) return ''
  return lot + String(po ?? '').trim().slice(0, 3)
}

// `M = VLOOKUP(C, 'Item x Emb.'!A:D, 4, 0)`. O valor congelado (S4) tem precedência.
export function resolveNetWeightKg(row, catalog) {
  if (typeof row?.frozenNetWeightKg === 'number' && Number.isFinite(row.frozenNetWeightKg)) {
    return row.frozenNetWeightKg
  }
  return getItemPackaging(catalog, row?.dbcorpCode)?.netWeightKg ?? null
}

// `O = K/M`, sem arredondar no dado.
export function computePackages(quantityKg, netWeightKg) {
  const quantity = numericOrNull(quantityKg)
  const net = numericOrNull(netWeightKg)
  if (quantity === null || net === null || quantity === 0 || net === 0) return null
  const result = quantity / net
  return Number.isFinite(result) ? result : null
}

export function deriveCargoReportRow(row, catalog) {
  const netWeightKg = resolveNetWeightKg(row, catalog)
  const frozenPackages =
    typeof row?.frozenPackages === 'number' && Number.isFinite(row.frozenPackages) ? row.frozenPackages : null
  const packages = frozenPackages ?? computePackages(row?.quantityKg, netWeightKg)
  const hasCode = normalizeItemCode(row?.dbcorpCode) !== ''

  return {
    lotSq: computeLotSq(row?.supplierLot, row?.po),
    netWeightKg,
    packages,
    alerts: {
      missingLot: hasCode && String(row?.supplierLot ?? '').trim() === '',
      missingPackageWeight: hasCode && numericOrNull(row?.packageWeightKg) === null,
      noPackaging: hasCode && (getItemPackaging(catalog, row?.dbcorpCode) === null || netWeightKg === null),
    },
  }
}

export function countCargoReportAlerts(rows, catalog) {
  let total = 0
  for (const row of Array.isArray(rows) ? rows : []) {
    const { alerts } = deriveCargoReportRow(row, catalog)
    total += Object.values(alerts).filter(Boolean).length
  }
  return total
}

// ---------- payloads ----------

export function isCargoReportRowEmpty(row) {
  return (
    ROW_TEXT_FIELDS.every(([field]) => String(row?.[field] ?? '').trim() === '') &&
    ROW_NUMBER_FIELDS.every((field) => isBlankNumeric(row?.[field]))
  )
}

export function formatCargoReportTitle(titleSuffix) {
  return CARGO_REPORT_TITLE_PREFIX + String(titleSuffix ?? '')
}

function buildPayloadRow(row, errors) {
  const payloadRow = { id: readRowId(row?.id) }
  for (const [field, limit] of ROW_TEXT_FIELDS) {
    payloadRow[field] = clip(row?.[field], CARGO_REPORT_LIMITS[limit])
  }

  const parsers = { quantityKg: parseCargoNumber, packageWeightKg: parseCargoNumber, count: parseCargoCount }
  for (const field of ROW_NUMBER_FIELDS) {
    const raw = row?.[field]
    const parsed = isBlankNumeric(raw) ? null : parsers[field](raw)
    if (Number.isNaN(parsed)) {
      errors.push({ rowId: payloadRow.id, field, message: CARGO_REPORT_INVALID_NUMBER_MESSAGE })
      payloadRow[field] = null
    } else {
      payloadRow[field] = parsed
    }
  }

  payloadRow.frozenNetWeightKg = readNumber(row?.frozenNetWeightKg)
  payloadRow.frozenPackages = readNumber(row?.frozenPackages)
  return payloadRow
}

// -> { payload, errors }. Sem `updatedAt/ById/ByName` (o repositório acrescenta) e sem coluna calculada.
export function buildCargoReportPayload(form, { catalogVersion = 0 } = {}) {
  const errors = []
  const filledRows = (Array.isArray(form?.rows) ? form.rows : []).filter((row) => !isCargoReportRowEmpty(row))
  if (filledRows.length > CARGO_REPORT_MAX_ROWS) {
    errors.push({ field: 'rows', message: CARGO_REPORT_ROWS_LIMIT_MESSAGE })
  }

  const rows = filledRows.slice(0, CARGO_REPORT_MAX_ROWS).map((row) => buildPayloadRow(row, errors))
  const revision = Number.isInteger(form?.revision) && form.revision >= 0 ? form.revision : 0

  const payload = {
    schemaVersion: CARGO_REPORT_SCHEMA_VERSION,
    formCode: CARGO_REPORT_FORM_CODE,
    formRevision: CARGO_REPORT_FORM_REVISION,
    revision: revision + 1,
    status: STATUS_VALUES.includes(form?.status) ? form.status : 'rascunho',
    cargoType: sanitizeEnum(form?.cargoType, CARGO_TYPE_VALUES),
    titleSuffix: clip(form?.titleSuffix, CARGO_REPORT_LIMITS.text),
    rows,
    notes: clip(form?.notes, CARGO_REPORT_LIMITS.notes),
    receiptStatus: sanitizeEnum(form?.receiptStatus, RECEIPT_STATUS_VALUES),
    receivedDate: readDateKey(form?.receivedDate),
    completedDate: readDateKey(form?.completedDate),
    nfNumber: clip(form?.nfNumber, CARGO_REPORT_LIMITS.nf),
    catalogVersion: Number.isInteger(catalogVersion) && catalogVersion >= 0 ? catalogVersion : 0,
    lastGenerated: readLastGenerated(form?.lastGenerated),
  }

  return { payload, errors }
}

// S6/S7/S8: o que é da logística no doc `conference`. Coluna nova "da logística" = 1 item aqui + 1 chave
// nas rules (`isValidCargoReportConference`) + a fixture do audit-vault.
// Mapas `{ [rowId]: boolean }` (OK? e contagem OK) e campos de texto por linha (etiquetas WMS e SQ).
export const CONFERENCE_FLAG_MAPS = ['okByRowId', 'countOkByRowId']
export const CONFERENCE_LABEL_FIELDS = ['wms', 'sq']

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

// Conferência da logística (18 chaves; o repositório acrescenta `updatedAt/ById/ByName`): poda chaves de
// linhas que não existem mais, força booleanos, grava as etiquetas em MAIÚSCULAS (até 120) e o rodapé do
// recebimento normalizado. S8: início/fim da descarga (texto sem fuso), etiquetagem OK e `receivedDate` derivado
// do dia do início (sem início, o valor carregado/legado). O tempo total NÃO é gravado. `checkedByName` é SEMPRE `actorName` (quem salva): a tela não deixa digitar e
// a rule exige `checkedByName == myName()`. `labelsByRowId` só guarda linha com alguma etiqueta preenchida.
export function buildConferencePayload(
  {
    okByRowId,
    countOkByRowId,
    labelsByRowId,
    receiptStatus,
    receivedDate,
    unloadStartAt,
    unloadEndAt,
    labelingOk,
    nfNumber,
    notes,
    revision,
  },
  rows,
  { actorName = '' } = {}
) {
  const sources = { okByRowId, countOkByRowId }
  const maps = Object.fromEntries(CONFERENCE_FLAG_MAPS.map((name) => [name, {}]))
  const labels = {}
  const labelSource = isPlainObject(labelsByRowId) ? labelsByRowId : {}

  for (const row of Array.isArray(rows) ? rows : []) {
    const id = row?.id
    if (typeof id !== 'string') continue
    for (const name of CONFERENCE_FLAG_MAPS) {
      const source = isPlainObject(sources[name]) ? sources[name] : {}
      if (hasOwn(source, id)) maps[name][id] = Boolean(source[id])
    }
    const entry = isPlainObject(labelSource[id]) ? labelSource[id] : null
    if (!entry) continue
    const normalized = Object.fromEntries(CONFERENCE_LABEL_FIELDS.map((field) => [field, normalizeCargoLabel(entry[field])]))
    if (CONFERENCE_LABEL_FIELDS.some((field) => normalized[field] !== '')) labels[id] = normalized
  }

  return {
    schemaVersion: CARGO_REPORT_SCHEMA_VERSION,
    revision: (Number.isInteger(revision) && revision >= 0 ? revision : 0) + 1,
    status: CARGO_CONFERENCE_STATUS.open,
    okByRowId: maps.okByRowId,
    countOkByRowId: maps.countOkByRowId,
    labelsByRowId: labels,
    checkedByName: clip(actorName, CARGO_REPORT_LIMITS.text),
    receiptStatus: sanitizeEnum(receiptStatus, RECEIPT_STATUS_VALUES),
    receivedDate: resolveCargoReceivedDate({ unloadStartAt, receivedDate }),
    nfNumber: clip(nfNumber, CARGO_REPORT_LIMITS.nf),
    notes: clip(notes, CARGO_REPORT_LIMITS.notes),
    unloadStartAt: readDateTimeKey(unloadStartAt),
    unloadEndAt: readDateTimeKey(unloadEndAt),
    labelingOk: labelingOk === true,
    closedDate: '',
    closedById: '',
    closedByName: '',
    closedDocumentId: '',
  }
}

// Fechamento da conferência: mesmo conteúdo + status `fechada` e a trilha de quem fechou. O repositório
// preenche `closedDocumentId` com o id do Excel anexado (a rule exige que seja documento `cargoReport` dela).
export function buildClosedConferencePayload(input, rows, { actorName = '', actorUid = '', today = '' } = {}) {
  return {
    ...buildConferencePayload(input, rows, { actorName }),
    status: CARGO_CONFERENCE_STATUS.closed,
    closedDate: readDateKey(today),
    closedById: String(actorUid ?? ''),
    closedByName: clip(actorName, CARGO_REPORT_LIMITS.text),
    closedDocumentId: '',
  }
}

function readFlagMap(value) {
  const result = {}
  if (isPlainObject(value)) {
    for (const [id, flag] of Object.entries(value)) {
      if (typeof flag === 'boolean') result[id] = flag
    }
  }
  return result
}

function readLabel(value) {
  return typeof value === 'string' ? normalizeCargoLabel(value) : ''
}

function readLabelsMap(value) {
  const result = {}
  if (!isPlainObject(value)) return result
  for (const [id, entry] of Object.entries(value)) {
    if (!isPlainObject(entry)) continue
    result[id] = Object.fromEntries(CONFERENCE_LABEL_FIELDS.map((field) => [field, readLabel(entry[field])]))
  }
  return result
}

// Conferência anterior à S6 (sem a chave `labelsByRowId`): as etiquetas que o COMEX digitou nas linhas
// do `current` pré-preenchem a tela. A 1ª gravação da conferência as persiste; `count` antigo (número
// de embalagens) não tem tradução para "Contagem OK" e é ignorado.
function labelsFromLegacyRows(legacyRows) {
  const result = {}
  for (const row of Array.isArray(legacyRows) ? legacyRows : []) {
    const id = typeof row?.id === 'string' ? row.id : ''
    if (!id) continue
    const wms = readLabel(row.wmsLabel)
    const sq = readLabel(row.sqLabel)
    if (wms || sq) result[id] = { wms, sq }
  }
  return result
}

// Conferência lida do doc (chave órfã é ignorada na leitura pela tela). Doc legado:
//   - sem `status` = `aberta`;
//   - sem `receiptStatus` (anterior à S7): o rodapé do recebimento (Observações, status, data e NF) vem do
//     `current` (`legacyCurrent`); a 1ª gravação da logística o persiste e daí em diante o legado não é lido.
export function fromConferenceDoc(data, legacyRows = [], legacyCurrent = null) {
  const doc = isPlainObject(data) ? data : {}
  const footerSource = hasOwn(doc, 'receiptStatus') ? doc : isPlainObject(legacyCurrent) ? legacyCurrent : {}
  const isClosed = doc.status === CARGO_CONFERENCE_STATUS.closed
  return {
    revision: Number.isInteger(doc.revision) && doc.revision >= 0 ? doc.revision : 0,
    status: isClosed ? CARGO_CONFERENCE_STATUS.closed : CARGO_CONFERENCE_STATUS.open,
    okByRowId: readFlagMap(doc.okByRowId),
    countOkByRowId: readFlagMap(doc.countOkByRowId),
    labelsByRowId: hasOwn(doc, 'labelsByRowId') ? readLabelsMap(doc.labelsByRowId) : labelsFromLegacyRows(legacyRows),
    checkedByName: readText(doc.checkedByName, CARGO_REPORT_LIMITS.text),
    receiptStatus: sanitizeEnum(footerSource.receiptStatus, RECEIPT_STATUS_VALUES),
    receivedDate: readDateKey(footerSource.receivedDate),
    nfNumber: readText(footerSource.nfNumber, CARGO_REPORT_LIMITS.nf),
    notes: readText(footerSource.notes, CARGO_REPORT_LIMITS.notes),
    // S8: doc anterior (sem as chaves) lê como vazio / sem OK.
    unloadStartAt: readDateTimeKey(doc.unloadStartAt),
    unloadEndAt: readDateTimeKey(doc.unloadEndAt),
    labelingOk: doc.labelingOk === true,
    closedDate: isClosed ? readDateKey(doc.closedDate) : '',
    closedById: isClosed ? readText(doc.closedById, CARGO_REPORT_LIMITS.text) : '',
    closedByName: isClosed ? readText(doc.closedByName, CARGO_REPORT_LIMITS.text) : '',
    closedDocumentId: isClosed ? readText(doc.closedDocumentId, 128) : '',
    updatedAt: toDateOrNull(doc.updatedAt),
    updatedByName: readText(doc.updatedByName, CARGO_REPORT_LIMITS.text),
  }
}

// ---------- S4: concluir e reabrir ----------

export function canConcludeCargoReport(role) {
  return role === 'admin'
}

// `YYYY-MM-DD` no fuso local (getFullYear/getMonth/getDate): nunca via UTC.
export function toCargoDateKey(date) {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Congela o peso líquido e o nº de embalagens de cada linha com a tabela vigente. Valor já
// congelado é mantido. `null` quando o item não tem embalagem cadastrada ou falta quantidade.
export function freezeCargoReportRows(rows, catalog) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const frozenNetWeightKg = resolveNetWeightKg(row, catalog)
    const keptPackages = readNumber(row?.frozenPackages)
    return {
      ...row,
      frozenNetWeightKg,
      frozenPackages: keptPackages ?? computePackages(row?.quantityKg, frozenNetWeightKg),
    }
  })
}

// -> { payload, errors }. Mesma validação do rascunho; `lastGenerated` fica como veio (o
// repositório o substitui depois do anexo).
export function buildConcludedCargoReportPayload(form, { catalogVersion = 0, catalog = null, today = '' } = {}) {
  const { payload, errors } = buildCargoReportPayload(
    { ...form, status: 'concluido', completedDate: today },
    { catalogVersion }
  )
  return { payload: { ...payload, rows: freezeCargoReportRows(payload.rows, catalog) }, errors }
}

// Reabrir volta a calcular pela tabela atual: zera os valores congelados e a data de conclusão.
export function buildReopenedCargoReportPayload(form, { catalogVersion = 0 } = {}) {
  const { payload, errors } = buildCargoReportPayload({ ...form, status: 'rascunho', completedDate: '' }, { catalogVersion })
  const rows = payload.rows.map((row) => ({ ...row, frozenNetWeightKg: null, frozenPackages: null }))
  return { payload: { ...payload, rows }, errors }
}
