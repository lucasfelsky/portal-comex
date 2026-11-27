// Fatia D (e-mail e aviso do fechamento da conferência): seção "Contagem" (pallets parciais e lotes com unidades
// divergentes). Módulo PURO e FOLHA: não importa nada do repo (nem firebase-admin), para ser testado sem mocks e
// importado por `cargoConferenceDamage.js`, `cargoReportEmail.js` e `documents.js` sem ciclo.
//
// Dados (doc `processes/{id}/cargoReport/conference`, as duas chaves são OPCIONAIS; conferência antiga sem elas lê como
// "nada contado"): `unitsByRowId` { [rowId]: int 0..99999 } (total de unidades do lote) e `partialPallets`
// [{ id, parts: [{ rowId, units }] }] (até 50; 1 ou 2 partes). Os leitores abaixo ESPELHAM `readUnitsMap` e
// `readPartialPallets` de `src/features/processes/cargoConferenceUnits.js` (Fatia B): o teste de paridade
// (`tests/unit/cargoConferenceCountParity.test.js`) trava as duas pontas.
//
// O esperado por lote espelha o cliente com catálogo vazio (D-23): `frozenPackages` (número finito) ou
// `quantityKg / frozenNetWeightKg`, lido como inteiro com tolerância de 1e-6; nulo ou fracionário = sem divergência.
//
// O corpo da notificação leva a seção sob o marcador "Contagem:" (ANTES de "Avarias e ressalvas:"). Cada leitor de seção
// (`extractCargoNoticeSectionLines`) para na próxima linha que abre com um marcador conhecido, então nenhuma seção engole
// a outra, em nenhuma ordem. Texto dinâmico (nome, lote) passa por `clipText`, que colapsa espaço e quebra de linha:
// nada consegue abrir uma linha com um marcador.

export const CARGO_COUNT_SECTION_MARKER = 'Contagem:'
// Mesmo texto de `CARGO_DAMAGE_SECTION_MARKER` (`cargoConferenceDamage.js`); duplicado para manter este módulo folha
// (o teste confere a igualdade).
export const CARGO_NOTICE_DAMAGE_MARKER = 'Avarias e ressalvas:'
export const CARGO_NOTICE_SECTION_MARKERS = [CARGO_COUNT_SECTION_MARKER, CARGO_NOTICE_DAMAGE_MARKER]

export const CARGO_COUNT_NOTICE_MAX_LOTS = 10
export const CARGO_COUNT_NOTICE_MAX_PARTIALS = 10
export const CARGO_COUNT_NOTICE_NAME_MAX = 120
export const CARGO_COUNT_NOTICE_LOT_MAX = 60

export const CARGO_COUNT_PARTIALS_LABEL = 'Pallets parciais:'
export const CARGO_COUNT_DIVERGENT_LABEL = 'Unidades divergentes:'

// Limites da Fatia B (rules + cliente).
const UNITS_ROW_MAX = 99999
const UNITS_MAP_MAX = 200
const PARTIAL_PALLETS_MAX = 50
const PARTIAL_PARTS_MAX = 2
const PARTIAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function pluralize(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

// Colapsa espaço e quebra de linha (nada abre uma linha nova no corpo) e corta por PONTOS DE CÓDIGO (não parte emoji).
function clipText(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  const chars = Array.from(text)
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : text
}

// ---------- leitores (espelho da Fatia B) ----------

// { [rowId]: int 0..99999 }. Outro tipo ou fora da faixa sai; só as linhas de `rowIds`; até 200 entradas.
export function readCargoUnitsMap(value, rowIds) {
  const result = {}
  if (!isPlainObject(value)) return result
  const allowed = rowIds === undefined || rowIds === null ? null : new Set(rowIds)
  let count = 0
  for (const [rowId, units] of Object.entries(value)) {
    if (allowed && !allowed.has(rowId)) continue
    if (!Number.isInteger(units) || units < 0 || units > UNITS_ROW_MAX) continue
    result[rowId] = units
    count += 1
    if (count >= UNITS_MAP_MAX) break
  }
  return result
}

function readPartialEntry(raw, allowed) {
  if (!isPlainObject(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id : ''
  if (!PARTIAL_ID_PATTERN.test(id)) return null
  if (!Array.isArray(raw.parts) || raw.parts.length < 1 || raw.parts.length > PARTIAL_PARTS_MAX) return null
  const parts = []
  const seen = new Set()
  for (const part of raw.parts) {
    if (!isPlainObject(part) || typeof part.rowId !== 'string' || part.rowId === '') continue
    if (!Number.isInteger(part.units) || part.units < 1 || part.units > UNITS_ROW_MAX || seen.has(part.rowId)) continue
    if (allowed && !allowed.has(part.rowId)) continue
    seen.add(part.rowId)
    parts.push({ rowId: part.rowId, units: part.units })
  }
  return parts.length > 0 ? { id, parts } : null
}

// Lista válida de parciais (até 50, ids únicos). Parte de linha que não existe mais sai; o parcial que fica com 1 parte
// vira "pallet incompleto" e continua contando 1; sem partes, some (D-6).
export function readCargoPartialPallets(value, rowIds) {
  if (!Array.isArray(value)) return []
  const allowed = rowIds === undefined || rowIds === null ? null : new Set(rowIds)
  const result = []
  const ids = new Set()
  for (const raw of value) {
    const entry = readPartialEntry(raw, allowed)
    if (!entry || ids.has(entry.id)) continue
    ids.add(entry.id)
    result.push(entry)
    if (result.length >= PARTIAL_PALLETS_MAX) break
  }
  return result
}

// ---------- esperado e divergência (D-23) ----------

// Nº de embalagens como inteiro esperado; nulo ou fracionário = sem esperado (D-11). A tolerância cobre o ruído de ponto
// flutuante da divisão.
export function readExpectedUnits(packages) {
  if (!isFiniteNumber(packages) || packages < 0) return null
  const rounded = Math.round(packages)
  return Math.abs(packages - rounded) < 1e-6 ? rounded : null
}

// Esperado do lote nas functions: `frozenPackages` (número finito) ou `quantityKg / frozenNetWeightKg` (números finitos,
// nenhum 0). Sem congelado, `null` (limitação conhecida D-23: o cliente consulta o catálogo de embalagens ao vivo).
export function resolveCargoRowExpectedUnits(row) {
  if (!isPlainObject(row)) return null
  let packages = null
  if (isFiniteNumber(row.frozenPackages)) {
    packages = row.frozenPackages
  } else if (isFiniteNumber(row.quantityKg) && isFiniteNumber(row.frozenNetWeightKg)) {
    if (row.quantityKg !== 0 && row.frozenNetWeightKg !== 0) {
      const result = row.quantityKg / row.frozenNetWeightKg
      packages = Number.isFinite(result) ? result : null
    }
  }
  return readExpectedUnits(packages)
}

// Divergente = contou (maior que 0) e o total é diferente do esperado. Sem esperado, 0 ou sem contagem: não diverge.
export function isCargoRowUnitsDivergent(units, expected) {
  return Number.isInteger(units) && units > 0 && Number.isInteger(expected) && units !== expected
}

// ---------- resumo ----------

function describeLot(entry) {
  const name = clipText(entry?.label, CARGO_COUNT_NOTICE_NAME_MAX) || `Item ${entry?.index ?? ''}`.trim()
  const lot = clipText(entry?.lot, CARGO_COUNT_NOTICE_LOT_MAX)
  return `${name} · ${lot ? `Lote ${lot}` : 'Sem lote informado'}`
}

// `noticeRows` = linhas preenchidas na ordem do relatório (`listCargoNoticeRows`): `{ row, rowId, index, label, lot }`.
// Devolve `{ partials: [{ parts: [{ label, units }] }], divergent: [{ label, counted, expected }], partialCount,
// divergentCount }`; `label` = "Nome · Lote X" (ou "Sem lote informado"). Parte de linha vazia ou removida sai.
export function summarizeCargoConferenceCount(conferenceData, noticeRows) {
  const rows = []
  const byRowId = new Map()
  for (const entry of Array.isArray(noticeRows) ? noticeRows : []) {
    if (!isPlainObject(entry) || typeof entry.rowId !== 'string' || entry.rowId === '' || byRowId.has(entry.rowId)) continue
    byRowId.set(entry.rowId, entry)
    rows.push(entry)
  }
  const rowIds = rows.map((entry) => entry.rowId)
  const unitsMap = readCargoUnitsMap(conferenceData?.unitsByRowId, rowIds)

  const partials = readCargoPartialPallets(conferenceData?.partialPallets, rowIds).map((partial) => ({
    parts: partial.parts.map((part) => ({ label: describeLot(byRowId.get(part.rowId)), units: part.units })),
  }))

  const divergent = []
  for (const entry of rows) {
    const counted = unitsMap[entry.rowId]
    if (counted === undefined) continue
    const expected = resolveCargoRowExpectedUnits(entry.row)
    if (isCargoRowUnitsDivergent(counted, expected)) divergent.push({ label: describeLot(entry), counted, expected })
  }
  return { partials, divergent, partialCount: partials.length, divergentCount: divergent.length }
}

// ---------- linhas do aviso ----------

function describeDifference(counted, expected) {
  if (expected > counted) {
    const missing = expected - counted
    return missing === 1 ? 'falta 1' : `faltam ${missing}`
  }
  return `${counted - expected} a mais`
}

function buildPartialLine(partial) {
  return `• ${partial.parts.map((part) => `${part.label} (${part.units} un.)`).join(' + ')}`
}

function buildDivergentLine(item) {
  return `• ${item.label}: ${pluralize(item.counted, 'contada', 'contadas')} de ${pluralize(item.expected, 'esperada', 'esperadas')} (${describeDifference(item.counted, item.expected)}).`
}

// Linhas da seção ([] sem parcial e sem divergência): cabeçalho, linha de pallets (só se `palletsLine` for informada: a
// seção de avarias já a traz quando existe), "Pallets parciais:" (até 10 + "+ N pallets parciais no Portal.") e
// "Unidades divergentes:" (até 10 lotes + "+ N lotes no Portal.").
export function buildCargoConferenceCountLines(summary, { palletsLine } = {}) {
  const partials = Array.isArray(summary?.partials) ? summary.partials : []
  const divergent = Array.isArray(summary?.divergent) ? summary.divergent : []
  if (partials.length === 0 && divergent.length === 0) return []

  const headerParts = []
  if (partials.length > 0) headerParts.push(pluralize(partials.length, 'pallet parcial', 'pallets parciais'))
  if (divergent.length > 0) {
    headerParts.push(pluralize(divergent.length, 'lote com unidades divergentes', 'lotes com unidades divergentes'))
  }
  const lines = [`${CARGO_COUNT_SECTION_MARKER} ${headerParts.join(', ')}.`]
  if (typeof palletsLine === 'string' && palletsLine.trim() !== '') lines.push(palletsLine.trim())

  if (partials.length > 0) {
    lines.push(CARGO_COUNT_PARTIALS_LABEL)
    for (const partial of partials.slice(0, CARGO_COUNT_NOTICE_MAX_PARTIALS)) lines.push(buildPartialLine(partial))
    const hidden = partials.length - CARGO_COUNT_NOTICE_MAX_PARTIALS
    if (hidden > 0) lines.push(`+ ${pluralize(hidden, 'pallet parcial', 'pallets parciais')} no Portal.`)
  }
  if (divergent.length > 0) {
    lines.push(CARGO_COUNT_DIVERGENT_LABEL)
    for (const item of divergent.slice(0, CARGO_COUNT_NOTICE_MAX_LOTS)) lines.push(buildDivergentLine(item))
    const hidden = divergent.length - CARGO_COUNT_NOTICE_MAX_LOTS
    if (hidden > 0) lines.push(`+ ${pluralize(hidden, 'lote', 'lotes')} no Portal.`)
  }
  return lines
}

// ---------- leitura de volta do corpo da notificação ----------

// Lê a seção que abre com `marker` até a próxima linha que abre com outro marcador conhecido (ou o fim). Corpo sem o
// marcador, vazio ou que não é texto -> `[]`. Linhas vazias saem.
export function extractCargoNoticeSectionLines(body, marker) {
  if (typeof body !== 'string' || body === '') return []
  const lines = body.split(/\r?\n/)
  const start = lines.findIndex((line) => line.startsWith(marker))
  if (start < 0) return []
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (CARGO_NOTICE_SECTION_MARKERS.some((known) => lines[index].startsWith(known))) {
      end = index
      break
    }
  }
  return lines.slice(start, end).map((line) => line.trimEnd()).filter((line) => line.trim() !== '')
}

export function extractCargoConferenceCountLines(body) {
  return extractCargoNoticeSectionLines(body, CARGO_COUNT_SECTION_MARKER)
}

// ---------- parser do formato fixo (D-21): alimenta o HTML com a pílula ----------

const DIVERGENT_LINE_PATTERN = /^• (.+): (\d+) contadas? de (\d+) esperadas? \((?:(faltam? (\d+))|((\d+) a mais))\)\.$/
const PARTIAL_PART_PATTERN = /^(.+) \((\d+) un\.\)$/

// Transforma as linhas da seção em blocos para o HTML:
//   { kind: 'heading', text }                 cabeçalho sem "Contagem: "
//   { kind: 'label', text }                   "Pallets parciais" / "Unidades divergentes" (sem os dois-pontos)
//   { kind: 'partial', parts: [{ label, units }] }
//   { kind: 'divergent', label, counted, expected, difference }   `difference` = "faltam 10" | "falta 1" | "2 a mais"
//   { kind: 'text', text }                    qualquer outra linha (linha de pallets, "+ N ... no Portal.", fora do formato)
// Linha fora do formato NUNCA perde conteúdo (vira `text`); a pílula só sai quando a diferença confere com o dado.
export function parseCargoConferenceCountLines(lines) {
  const blocks = []
  for (const raw of Array.isArray(lines) ? lines : []) {
    const line = typeof raw === 'string' ? raw.trim() : ''
    if (!line) continue
    if (line.startsWith(CARGO_COUNT_SECTION_MARKER)) {
      blocks.push({ kind: 'heading', text: line.slice(CARGO_COUNT_SECTION_MARKER.length).trim() })
      continue
    }
    if (line === CARGO_COUNT_PARTIALS_LABEL || line === CARGO_COUNT_DIVERGENT_LABEL) {
      blocks.push({ kind: 'label', text: line.slice(0, -1) })
      continue
    }
    const divergent = DIVERGENT_LINE_PATTERN.exec(line)
    if (divergent) {
      const counted = Number(divergent[2])
      const expected = Number(divergent[3])
      const missing = divergent[5] === undefined ? null : Number(divergent[5])
      const extra = divergent[7] === undefined ? null : Number(divergent[7])
      const consistent = missing !== null ? expected - counted === missing : counted - expected === extra
      if (consistent && missing !== 0 && extra !== 0) {
        blocks.push({ kind: 'divergent', label: divergent[1], counted, expected, difference: divergent[4] ?? divergent[6] })
        continue
      }
    }
    if (line.startsWith('• ')) {
      const parts = line.slice(2).split(/(?<=un\.\)) \+ /).map((piece) => PARTIAL_PART_PATTERN.exec(piece))
      if (parts.length > 0 && parts.every(Boolean)) {
        blocks.push({ kind: 'partial', parts: parts.map((match) => ({ label: match[1], units: Number(match[2]) })) })
        continue
      }
    }
    blocks.push({ kind: 'text', text: line })
  }
  return blocks
}
