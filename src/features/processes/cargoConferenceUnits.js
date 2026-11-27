// Conferência por item (Fatia B do Relatório de Carga): unidades contadas por lote e pallet parcial. Módulo puro (sem
// React e sem Firebase) e SEM import dos outros módulos da conferência (é folha: o modelo, o formulário do computador e
// os totais importam daqui, nunca o contrário).
// Dados (doc `conference`, as duas chaves são OPCIONAIS: conferência antiga sem elas lê como "nada contado"):
//   - `unitsByRowId` { [rowId]: int 0..99999 }: "Unidades contadas" = TOTAL do lote (todas as embalagens), já com as
//     unidades que estão em pallet parcial. Ausente = nunca contado; 0 e ausente NÃO são divergentes (D-8/D-11).
//   - `partialPallets` [{ id, parts: [{ rowId, units }] }]: até 50; `parts` com 1 ou 2 partes (rowId distintos, units
//     int 1..99999). 1 parcial = 1 pallet físico na carga, aparece nos dois lotes; o pallet com 1 parte é "pallet
//     incompleto". Uma linha pode estar em mais de um parcial.
// As rules só validam tipo e tamanho (mapa <= 200, lista <= 50); cada entrada é lida e podada AQUI, na leitura e na
// gravação: a parte de linha que não existe mais (lote removido ou dividido pelo COMEX) sai; o parcial que fica com 1
// parte vira "pallet incompleto" e continua contando 1; sem partes, some (D-6).

export const CARGO_UNITS_ROW_MAX = 99999
export const CARGO_UNITS_MAP_MAX = 200
export const CARGO_PARTIAL_PALLETS_MAX = 50
export const CARGO_PARTIAL_PARTS_MAX = 2
export const CARGO_PARTIAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toRowIdSet(rowIds) {
  if (rowIds === undefined || rowIds === null) return null
  return new Set(rowIds)
}

function isUnits(value) {
  return Number.isInteger(value) && value >= 0 && value <= CARGO_UNITS_ROW_MAX
}

function isPartUnits(value) {
  return Number.isInteger(value) && value >= 1 && value <= CARGO_UNITS_ROW_MAX
}

// ---------- unidades por lote ----------

// { [rowId]: int 0..99999 }. Outro tipo ou fora da faixa sai; com `rowIds`, só as linhas que existem; até 200 entradas.
export function readUnitsMap(value, rowIds) {
  const result = {}
  if (!isPlainObject(value)) return result
  const allowed = toRowIdSet(rowIds)
  let count = 0
  for (const [rowId, units] of Object.entries(value)) {
    if (allowed && !allowed.has(rowId)) continue
    if (!isUnits(units)) continue
    result[rowId] = units
    count += 1
    if (count >= CARGO_UNITS_MAP_MAX) break
  }
  return result
}

// Unidades contadas do lote; `null` = nunca contado.
export function getCargoRowUnits(conference, rowId) {
  const units = conference?.unitsByRowId?.[rowId]
  return isUnits(units) ? units : null
}

// Define o total de unidades do lote (0..99999). `null`, vazio ou não numérico tira a entrada (volta a "nunca contado").
export function setCargoRowUnits(conference, rowId, next) {
  const unitsByRowId = { ...conference?.unitsByRowId }
  const parsed = typeof next === 'number' ? next : typeof next === 'string' && next.trim() !== '' ? Number(next) : Number.NaN
  if (!Number.isFinite(parsed)) {
    delete unitsByRowId[rowId]
  } else {
    unitsByRowId[rowId] = Math.min(CARGO_UNITS_ROW_MAX, Math.max(0, Math.trunc(parsed)))
  }
  return { ...conference, unitsByRowId }
}

export function stepCargoRowUnits(conference, rowId, delta) {
  return setCargoRowUnits(conference, rowId, (getCargoRowUnits(conference, rowId) ?? 0) + delta)
}

// Nº de embalagens do relatório (`derived.packages`) como inteiro esperado; nulo ou fracionário = sem esperado (D-11).
// A tolerância cobre o ruído de ponto flutuante da divisão (quantidade / peso líquido).
export function readExpectedUnits(packages) {
  if (typeof packages !== 'number' || !Number.isFinite(packages) || packages < 0) return null
  const rounded = Math.round(packages)
  return Math.abs(packages - rounded) < 1e-6 ? rounded : null
}

// Divergente = contou (maior que 0) e o total é diferente do esperado. Sem esperado, 0 ou sem contagem: não diverge.
export function isCargoRowUnitsDivergent(units, expected) {
  return Number.isInteger(units) && units > 0 && Number.isInteger(expected) && units !== expected
}

// { [rowId]: int | null } com o esperado de cada linha, a partir das linhas e dos `derived` (mesma ordem).
export function expectedUnitsFromDerived(rows, derived) {
  const result = {}
  const list = Array.isArray(rows) ? rows : []
  list.forEach((row, index) => {
    if (typeof row?.id === 'string') result[row.id] = readExpectedUnits(derived?.[index]?.packages)
  })
  return result
}

// ---------- pallet parcial ----------

function readPartialEntry(raw, allowed) {
  if (!isPlainObject(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id : ''
  if (!CARGO_PARTIAL_ID_PATTERN.test(id)) return null
  if (!Array.isArray(raw.parts) || raw.parts.length < 1 || raw.parts.length > CARGO_PARTIAL_PARTS_MAX) return null
  const parts = []
  const seen = new Set()
  for (const part of raw.parts) {
    if (!isPlainObject(part) || typeof part.rowId !== 'string' || part.rowId === '') continue
    if (!isPartUnits(part.units) || seen.has(part.rowId)) continue
    if (allowed && !allowed.has(part.rowId)) continue
    seen.add(part.rowId)
    parts.push({ rowId: part.rowId, units: part.units })
  }
  return parts.length > 0 ? { id, parts } : null
}

// Lista válida de parciais (até 50, ids únicos). Com `rowIds`, a parte de linha que não existe sai (D-6).
export function readPartialPallets(value, rowIds) {
  if (!Array.isArray(value)) return []
  const allowed = toRowIdSet(rowIds)
  const result = []
  const ids = new Set()
  for (const raw of value) {
    const entry = readPartialEntry(raw, allowed)
    if (!entry || ids.has(entry.id)) continue
    ids.add(entry.id)
    result.push(entry)
    if (result.length >= CARGO_PARTIAL_PALLETS_MAX) break
  }
  return result
}

export function listCargoPartialPallets(conference, rowIds) {
  return readPartialPallets(conference?.partialPallets, rowIds)
}

// Total de pallets parciais da carga (cada um conta 1 pallet), só com partes de linhas que existem.
export function countCargoPartialPallets(conference, rowIds) {
  return listCargoPartialPallets(conference, rowIds).length
}

let partialSequence = 0

function newPartialId() {
  partialSequence += 1
  return `pp-${Date.now().toString(36)}${partialSequence.toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 40)
}

// Acrescenta um pallet parcial; `parts` = [{ rowId, units }] (1 ou 2 partes). Parcial inválido ou lista cheia (50): devolve a
// MESMA conferência (quem chama confere o limite antes, para avisar).
export function addCargoPartialPallet(conference, parts, { id } = {}) {
  const list = listCargoPartialPallets(conference)
  if (list.length >= CARGO_PARTIAL_PALLETS_MAX) return conference
  const entry = readPartialEntry({ id: id ?? newPartialId(), parts }, null)
  if (!entry || (Array.isArray(parts) && parts.length !== entry.parts.length)) return conference
  const unique = list.some((item) => item.id === entry.id) ? { ...entry, id: newPartialId() } : entry
  return { ...conference, partialPallets: [...list, unique] }
}

// Remover de um lado remove o pallet inteiro (o mesmo pallet aparece nos dois lotes).
export function removeCargoPartialPallet(conference, partialId) {
  const list = listCargoPartialPallets(conference)
  return { ...conference, partialPallets: list.filter((item) => item.id !== partialId) }
}

// Parciais em que o lote aparece, já no ponto de vista dele: { id, mine: { rowId, units }, other: { rowId, units } | null }.
// `other` nulo = "pallet incompleto" (só uma parte, ou a outra parte saiu com o lote removido).
export function partialPalletsOfRow(conference, rowId, rowIds) {
  const result = []
  for (const partial of listCargoPartialPallets(conference, rowIds)) {
    const mine = partial.parts.find((part) => part.rowId === rowId)
    if (!mine) continue
    result.push({ id: partial.id, mine, other: partial.parts.find((part) => part.rowId !== rowId) ?? null })
  }
  return result
}

// Unidades do lote que estão em pallet parcial (soma das partes dele).
export function cargoRowUnitsInPartials(conference, rowId, rowIds) {
  return partialPalletsOfRow(conference, rowId, rowIds).reduce((sum, partial) => sum + partial.mine.units, 0)
}

// ---------- textos ----------

export function describeCargoPartialCount(count) {
  return `${count} ${count === 1 ? 'parcial' : 'parciais'}`
}

function palletWord(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

// Faixa do celular (mock v5, com o plural corrigido): "22 pallets contados de 22 informados pelo COMEX (inclui 1 parcial)";
// sem o total do COMEX: "23 pallets contados. Total não informado pelo COMEX." (o sufixo "(inclui N parciais)" vem antes
// do ponto). `summary` = `summarizeCargoPallets`.
export function formatCargoPalletsStrip(summary) {
  const partial = summary.partial > 0 ? ` (inclui ${describeCargoPartialCount(summary.partial)})` : ''
  const counted = palletWord(summary.counted, 'pallet contado', 'pallets contados')
  if (summary.state === 'semTotal') return `${counted}${partial}. Total não informado pelo COMEX.`
  return `${counted} de ${palletWord(summary.expected, 'informado', 'informados')} pelo COMEX${partial}`
}
