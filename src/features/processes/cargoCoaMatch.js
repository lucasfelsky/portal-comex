import { foldText } from '../erp/erpText'
import { cargoRowPallets, hasCargoRowIssue } from './cargoConferenceIssues'
import {
  CARGO_REPORT_MAX_ROWS,
  createEmptyCargoAutofill,
  isCargoReportRowEmpty,
  parseCargoNumber,
  resolveCargoProcessReference,
} from './cargoReportFormModel'
import {
  formatCargoKgText,
  getCargoReportPurchaseOrders,
  orderCargoRowsByPurchaseOrder,
  resolveCargoRowPurchaseOrder,
} from './cargoReportGroups'
import {
  CARGO_SPLIT_SUM_TOLERANCE_KG,
  purchaseOrderLabel,
  readCargoRowQuantity,
  replaceCargoRowsWithLots,
} from './cargoReportRowOps'
import { getCoaDisplayName } from './processDocuments'

// S11-C do Relatório de Carga: casamento COA × linhas do relatório, divisão por lote e aplicação. Módulo PURO (sem
// React nem firebase): recebe o resultado da leitura (`CoaRead`, de `coaReadsRepository`), as linhas do formulário e o
// processo, e devolve PROPOSTAS. Nada é aplicado sem o usuário marcar na prévia; o que ele editou à mão nunca vem
// marcado. Todo texto vindo do COA (produto, lote, PO, avisos) é DADO: só é guardado e mostrado como texto.

const EDITED_SUFFIX = ' (você editou esta célula)'
const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 }
const MIN_CONTAINED_NAME = 4
const MAX_PO_DISTANCE = 2
const EDIT_FIELDS = ['po', 'dbcorpCode', 'supplierDescription', 'sqDescription', 'quantityKg', 'packageWeightKg', 'supplierLot']

// "GOOYER SEA 185-26" -> "GOOYERSEA18526"; "HL-200" -> "HL200". Só A-Z e 0-9, sem acento, maiúsculas.
export function compactCoaText(value) {
  return foldText(value).replace(/[^A-Z0-9]/g, '')
}

function roundKg(value) {
  return Math.round(value * 1000) / 1000
}

function unique(list) {
  return [...new Set(list)]
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function isBlankValue(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = parseCargoNumber(value)
    return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function sameField(field, a, b) {
  if (field === 'quantityKg' || field === 'packageWeightKg') {
    const left = toNumber(a)
    const right = toNumber(b)
    if (left === null || right === null) return left === right
    return Math.abs(left - right) < CARGO_SPLIT_SUM_TOLERANCE_KG
  }
  return String(a ?? '').trim() === String(b ?? '').trim()
}

function sameKg(a, b) {
  return Math.abs(a - b) < CARGO_SPLIT_SUM_TOLERANCE_KG
}

// ---------- PDFs e certificados ----------

export function isCoaPdf(document) {
  return String(document?.mimeType ?? '').toLowerCase() === 'application/pdf'
}

function distinctKgs(values) {
  const out = []
  for (const value of values) {
    if (typeof value === 'number' && !out.some((kept) => sameKg(kept, value))) out.push(value)
  }
  return out
}

function isBetterCertificate(candidate, current) {
  const hasKg = (cert) => (cert.kg !== null ? 1 : 0)
  if (hasKg(candidate) !== hasKg(current)) return hasKg(candidate) > hasKg(current)
  return (CONFIDENCE_RANK[candidate.confidence] ?? 1) > (CONFIDENCE_RANK[current.confidence] ?? 1)
}

function describeDocumentNote(document, read, describeError) {
  const documentId = document.id
  const documentName = getCoaDisplayName(document)
  const make = (kind, message) => ({ documentId, documentName, kind, message: `${documentName}: ${message}` })
  if (!isCoaPdf(document)) return [make('notPdf', 'Só PDF é lido automaticamente.')]
  if (!read) return [make('unread', 'Não lido. Clique em Ler COAs para tentar de novo.')]
  if (read.status === 'reading') {
    return [make('reading', 'Este arquivo está sendo lido em outra sessão. Tente de novo em 1 minuto.')]
  }
  if (read.status === 'failed') {
    const code = read.error?.code ?? 'unknown'
    const message = typeof describeError === 'function' ? describeError(code) : 'Não foi possível ler o arquivo.'
    return [make('failed', message)]
  }

  const notes = []
  const certificates = Array.isArray(read.certificates) ? read.certificates : []
  const validationWarnings = Array.isArray(read.validationWarnings) ? read.validationWarnings : []
  if (read.documentType === 'not_coa') {
    notes.push(make('notCoa', 'Não parece um COA.'))
  } else if (certificates.length === 0) {
    // "Li e descartei" (certificado sem lote ou sem produto) é diferente de "não é COA".
    notes.push(
      validationWarnings.length > 0
        ? make('discarded', `Li o arquivo, mas descartei certificados incompletos: ${validationWarnings.join('; ')}`)
        : make('empty', 'Li o arquivo, mas não encontrei nenhum certificado com produto e lote.')
    )
  } else {
    for (const warning of validationWarnings) notes.push(make('warning', `Aviso da leitura: ${warning}`))
  }
  if (read.documentType !== 'not_coa') {
    for (const warning of Array.isArray(read.warnings) ? read.warnings : []) {
      notes.push(make('warning', `Aviso da leitura: ${warning}`))
    }
  }
  return notes
}

// -> { certificates: Cert[], documentNotes: DocNote[] }
//   Cert = { id: '<documentId>#<i>', documentId, documentName, page, productName, names, batchNumber, poReference,
//            kg, quantityRaw, confidence, warnings, duplicates, duplicateKgs, conflict }
// `documents` = COAs do processo na ordem da lista (a mesma da tela); `readsById` = { [documentId]: CoaRead } (um
// documento sem leitura vira nota "não lido"; leitura de documento que não está mais na lista é ignorada).
// O mesmo lote + mesmo produto em 2 PDFs vira 1 certificado: fica o que tem `kg` e maior confiança; `duplicates` são
// os nomes dos outros arquivos e `conflict` marca quantidades diferentes entre eles.
// `options.describeError(code)`: texto pt-BR do erro de leitura (o módulo não importa o serviço).
export function collectCoaCertificates(documents, readsById, { describeError } = {}) {
  const out = []
  const byKey = new Map()
  const documentNotes = []

  for (const document of Array.isArray(documents) ? documents : []) {
    const read = readsById?.[document.id] ?? null
    documentNotes.push(...describeDocumentNote(document, read, describeError))
    if (!isCoaPdf(document) || !read || read.status !== 'done' || read.documentType !== 'coa') continue

    const documentName = getCoaDisplayName(document)
    ;(Array.isArray(read.certificates) ? read.certificates : []).forEach((certificate, index) => {
      const kg = typeof certificate?.quantity?.kg === 'number' ? certificate.quantity.kg : null
      const entry = {
        id: `${document.id}#${index}`,
        documentId: document.id,
        documentName,
        page: certificate.page ?? null,
        productName: certificate.productName,
        names: unique(
          [certificate.productName, ...(Array.isArray(certificate.productAliases) ? certificate.productAliases : [])]
            .map(compactCoaText)
            .filter(Boolean)
        ),
        batchNumber: certificate.batchNumber,
        poReference: certificate.poReference ?? null,
        kg,
        quantityRaw: certificate.quantity?.raw ?? '',
        confidence: certificate.confidence ?? 'low',
        warnings: Array.isArray(certificate.warnings) ? certificate.warnings : [],
        sources: [{ documentId: document.id, documentName, kg }],
      }
      const key = `${compactCoaText(entry.batchNumber) || entry.batchNumber.toLowerCase()}|${
        compactCoaText(entry.productName) || entry.productName.toLowerCase()
      }`
      const at = byKey.get(key)
      if (at === undefined) {
        byKey.set(key, out.length)
        out.push(entry)
        return
      }
      const current = out[at]
      const winner = isBetterCertificate(entry, current) ? entry : current
      const loser = winner === entry ? current : entry
      winner.sources = [...winner.sources, ...loser.sources]
      out[at] = winner
    })
  }

  const certificates = out.map(({ sources, ...cert }) => {
    const others = sources.slice(1)
    const duplicateKgs = distinctKgs(others.map((source) => source.kg))
    return {
      ...cert,
      duplicates: others.map((source) => source.documentName),
      duplicateKgs,
      conflict: distinctKgs([cert.kg, ...duplicateKgs]).length > 1,
    }
  })
  return { certificates, documentNotes }
}

// ---------- PO ----------

function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = current
  }
  return previous[b.length]
}

function digitsOf(text) {
  return text.replace(/\D/g, '')
}

// PARECIDA = mesmos dígitos na mesma ordem e distância de edição <= 2 no texto compacto: pega "GOOYE SEA 185-26" para
// "GOOYER SEA 185-26", mas NÃO confunde 185 com 186 (os dígitos mudam).
function similarDistance(printed, expected) {
  const digits = digitsOf(printed)
  if (!digits || digits !== digitsOf(expected)) return null
  const distance = editDistance(printed, expected)
  return distance <= MAX_PO_DISTANCE ? distance : null
}

// PO impressa no COA x PO do relatório. Consolidado: compara com cada PO do processo (`index` = a PO achada, ou -1);
// demais tipos: com a referência do processo (`index` -1). match: 'exact' | 'similar' | 'other' (não é deste
// processo, ou empate entre POs parecidas) | 'absent' (o COA não imprime PO). `expected` = texto da PO esperada.
export function resolveCoaPurchaseOrder(poReference, process) {
  const printed = compactCoaText(poReference)
  const orders = getCargoReportPurchaseOrders(process)
  const candidates =
    orders.length > 0
      ? orders.map((order, index) => ({ index, expected: purchaseOrderLabel(order), texts: [order.reference, order.po] }))
      : [{ index: -1, expected: resolveCargoProcessReference(process), texts: [process?.name, process?.processNumber] }]
  const withTexts = candidates.map((candidate) => ({ ...candidate, compacts: candidate.texts.map(compactCoaText).filter(Boolean) }))

  if (!printed) return { index: -1, match: 'absent', expected: orders.length > 0 ? '' : candidates[0].expected }

  const exact = withTexts.find((candidate) => candidate.compacts.includes(printed))
  if (exact) return { index: exact.index, match: 'exact', expected: exact.expected }

  const similar = withTexts
    .map((candidate) => {
      const distances = candidate.compacts.map((text) => similarDistance(printed, text)).filter((value) => value !== null)
      return { candidate, distance: distances.length > 0 ? Math.min(...distances) : null }
    })
    .filter((entry) => entry.distance !== null)
  if (similar.length > 0) {
    const best = Math.min(...similar.map((entry) => entry.distance))
    const winners = similar.filter((entry) => entry.distance === best)
    if (winners.length === 1) {
      return { index: winners[0].candidate.index, match: 'similar', expected: winners[0].candidate.expected }
    }
  }
  return { index: -1, match: 'other', expected: orders.length > 0 ? '' : candidates[0].expected }
}

// ---------- itens do relatório ----------

// Item do relatório (D-16): linhas com a mesma `autofill.rows[id].key`; linha sem chave agrupa por (grupo da PO +
// nome compacto da Descrição SQ). -> Item[] = { key, rowIds, purchaseOrderIndex, po, names, label, quantityKg }
export function buildCoaReportItems(form, process) {
  const orders = getCargoReportPurchaseOrders(process)
  const entries = form?.autofill?.rows ?? {}
  const groups = new Map()

  for (const row of Array.isArray(form?.rows) ? form.rows : []) {
    if (isCargoReportRowEmpty(row)) continue
    const autofillKey = String(entries[row.id]?.key ?? '')
    const purchaseOrderIndex = resolveCargoRowPurchaseOrder(row.po, orders)
    const name =
      compactCoaText(row.sqDescription) || compactCoaText(row.supplierDescription) || compactCoaText(row.dbcorpCode)
    const key = autofillKey ? `k:${autofillKey}` : name ? `n:${purchaseOrderIndex}|${name}` : `r:${row.id}`
    if (!groups.has(key)) groups.set(key, { key, rows: [], purchaseOrderIndex })
    groups.get(key).rows.push(row)
  }

  return [...groups.values()].map((group) => {
    const first = group.rows[0]
    const quantities = group.rows.map(readCargoRowQuantity).filter((value) => value !== null)
    const label = group.rows
      .map((row) => String(row.sqDescription ?? '').trim() || String(row.dbcorpCode ?? '').trim() || String(row.supplierDescription ?? '').trim())
      .find(Boolean)
    return {
      key: group.key,
      rowIds: group.rows.map((row) => row.id),
      purchaseOrderIndex: group.purchaseOrderIndex,
      po: String(first.po ?? '').trim(),
      names: unique(
        group.rows
          .flatMap((row) => [row.supplierDescription, row.sqDescription, row.dbcorpCode])
          .map(compactCoaText)
          .filter(Boolean)
      ),
      label: label || 'Item',
      quantityKg: quantities.length > 0 ? roundKg(quantities.reduce((total, value) => total + value, 0)) : null,
    }
  })
}

// ---------- casamento ----------

// 3 = nome igual (nome ou alias do COA x nome do item); 2 = um contém o outro (o menor com >= 4 caracteres); 0 = nada.
function scoreNames(certNames, itemNames) {
  let best = 0
  for (const a of certNames) {
    for (const b of itemNames) {
      if (a === b) return 3
      const shorter = Math.min(a.length, b.length)
      if (shorter >= MIN_CONTAINED_NAME && (a.includes(b) || b.includes(a))) best = 2
    }
  }
  return best
}

// -> { byItemKey: { [itemKey]: certId[] }, unmatched: [{ certId, reason: 'none'|'ambiguous'|'otherPo', candidateKeys }] }
// Consolidado: a PO do COA limita o casamento ao grupo dela (PO ausente = todos os grupos; PO que não é do processo
// = "só no COA"). Empate na melhor nota = 'ambiguous'. `manualLinks[certId] = itemKey` vence tudo.
export function matchCoaCertificates(certificates, items, process, manualLinks = {}) {
  const consolidated = getCargoReportPurchaseOrders(process).length > 0
  const itemKeys = new Set(items.map((item) => item.key))
  const byItemKey = {}
  const unmatched = []
  const assign = (itemKey, certId) => {
    if (!byItemKey[itemKey]) byItemKey[itemKey] = []
    byItemKey[itemKey].push(certId)
  }

  for (const cert of certificates) {
    const manual = manualLinks?.[cert.id]
    if (manual && itemKeys.has(manual)) {
      assign(manual, cert.id)
      continue
    }
    let pool = items
    if (consolidated) {
      const po = resolveCoaPurchaseOrder(cert.poReference, process)
      if (po.match === 'other') {
        unmatched.push({ certId: cert.id, reason: 'otherPo', candidateKeys: [] })
        continue
      }
      if (po.match === 'exact' || po.match === 'similar') pool = items.filter((item) => item.purchaseOrderIndex === po.index)
    }
    const scored = pool.map((item) => ({ item, score: scoreNames(cert.names, item.names) })).filter((entry) => entry.score > 0)
    if (scored.length === 0) {
      unmatched.push({ certId: cert.id, reason: 'none', candidateKeys: [] })
      continue
    }
    const top = Math.max(...scored.map((entry) => entry.score))
    const winners = scored.filter((entry) => entry.score === top)
    if (winners.length > 1) {
      unmatched.push({ certId: cert.id, reason: 'ambiguous', candidateKeys: winners.map((entry) => entry.item.key) })
      continue
    }
    assign(winners[0].item.key, cert.id)
  }
  return { byItemKey, unmatched }
}

// ---------- propostas ----------

function formatKgList(values) {
  const texts = values.map((value) => formatCargoKgText(value))
  return texts.length <= 1 ? texts.join('') : `${texts.slice(0, -1).join(', ')} e ${texts[texts.length - 1]}`
}

// Assinatura do que a proposta pode trocar: se mudar depois da leitura, aplicar vira 'stale' (nada é sobrescrito sem
// aparecer na prévia).
function rowsSignature(rows, rowIds) {
  const byId = new Map(rows.map((row) => [row.id, row]))
  return JSON.stringify(
    rowIds.map((id) => {
      const row = byId.get(id)
      return row ? [id, ...EDIT_FIELDS.map((field) => (field === 'quantityKg' || field === 'packageWeightKg' ? toNumber(row[field]) : String(row[field] ?? '').trim()))] : [id, null]
    })
  )
}

// Célula digitada à mão: valor diferente da base do autofill ou, sem base, qualquer valor preenchido.
function isFieldEditedByHand(row, entry, field) {
  if (entry?.base && hasOwn(entry.base, field)) return !sameField(field, row[field], entry.base[field])
  return !isBlankValue(row[field])
}

function hasLogisticsMarks(conference, rowId) {
  const labels = conference?.labelsByRowId?.[rowId]
  return (
    conference?.okByRowId?.[rowId] === true ||
    conference?.countOkByRowId?.[rowId] === true ||
    (cargoRowPallets(conference, rowId).count ?? 0) > 0 ||
    hasCargoRowIssue(conference, rowId) ||
    String(labels?.wms ?? '').trim() !== '' ||
    String(labels?.sq ?? '').trim() !== ''
  )
}

function classifySum(lots, itemKg) {
  if (lots.some((lot) => lot.quantityKg === null)) return { state: 'incomplete', sumKg: roundKg(lots.reduce((total, lot) => total + (lot.quantityKg ?? 0), 0)) }
  const sumKg = roundKg(lots.reduce((total, lot) => total + lot.quantityKg, 0))
  if (itemKg === null) return { state: 'unknown', sumKg }
  if (Math.abs(sumKg - itemKg) < CARGO_SPLIT_SUM_TOLERANCE_KG) return { state: 'ok', sumKg }
  return { state: sumKg < itemKg ? 'short' : 'over', sumKg }
}

// Certificados do item -> lotes. O mesmo lote (texto compacto) vira UM: fica o certificado com `kg` e maior
// confiança; `files` = arquivos onde ele aparece e `kgs` = quantidades distintas vistas; `conflict` = diferentes.
function mergeLots(certs, process) {
  const byBatch = new Map()
  const order = []
  const poNotes = []
  let otherPo = false
  for (const cert of certs) {
    const po = resolveCoaPurchaseOrder(cert.poReference, process)
    if (po.match === 'similar') {
      poNotes.push(`PO impressa no COA: ${cert.poReference} (parecida com ${po.expected}).`)
    } else if (po.match === 'other') {
      otherPo = true
      poNotes.push(`PO impressa no COA (${cert.poReference}) não é deste processo.`)
    }
    const lot = {
      supplierLot: String(cert.batchNumber).trim(),
      quantityKg: cert.kg,
      confidence: cert.confidence,
      documentName: cert.documentName,
      page: cert.page,
      warnings: cert.warnings,
      files: [cert.documentName, ...cert.duplicates],
      kgs: distinctKgs([cert.kg, ...cert.duplicateKgs]),
      certificate: cert,
    }
    const key = compactCoaText(lot.supplierLot) || lot.supplierLot.toLowerCase()
    const current = byBatch.get(key)
    if (!current) {
      byBatch.set(key, lot)
      order.push(key)
      continue
    }
    const winner = isBetterCertificate(cert, current.certificate) ? lot : current
    const loser = winner === lot ? current : lot
    winner.files = [...winner.files, ...loser.files]
    winner.kgs = distinctKgs([...winner.kgs, ...loser.kgs])
    byBatch.set(key, winner)
  }
  const lots = order.map((key) => {
    const lot = byBatch.get(key)
    return { ...lot, conflict: lot.kgs.length > 1 }
  })
  return { lots, poNotes: unique(poNotes), otherPo }
}

function lotRepeatNotes(lots) {
  const notes = []
  for (const lot of lots) {
    if (lot.files.length < 2) continue
    notes.push(
      lot.conflict
        ? `O lote ${lot.supplierLot} aparece em ${lot.files.length} COAs com quantidades diferentes (${formatKgList(lot.kgs)}).`
        : `O lote ${lot.supplierLot} aparece em ${lot.files.length} COAs (${lot.files.join(', ')}); considerado uma vez.`
    )
  }
  return notes
}

function warningNotes(lots) {
  const notes = []
  for (const lot of lots) {
    for (const warning of lot.warnings) {
      notes.push(lots.length > 1 ? `Aviso da leitura: ${warning} (lote ${lot.supplierLot})` : `Aviso da leitura: ${warning}`)
    }
  }
  return notes
}

function viewLot(lot) {
  return {
    supplierLot: lot.supplierLot,
    quantityKg: lot.quantityKg,
    confidence: lot.confidence,
    documentName: lot.documentName,
    page: lot.page,
    warnings: lot.warnings,
  }
}

// Lote sem `kg` no COA vale para qualquer quantidade já digitada na linha.
function sameLots(rows, lots) {
  if (rows.length !== lots.length) return false
  const remaining = rows.map((row) => ({ lot: String(row.supplierLot ?? '').trim(), kg: toNumber(row.quantityKg) }))
  for (const lot of lots) {
    const at = remaining.findIndex(
      (row) => row.lot === lot.supplierLot && (lot.quantityKg === null || (row.kg !== null && sameKg(row.kg, lot.quantityKg)))
    )
    if (at < 0) return false
    remaining.splice(at, 1)
  }
  return true
}

function buildItemProposal(form, item, certs, { conference, process }) {
  const rows = form.rows
  const entries = form.autofill?.rows ?? {}
  const itemRows = item.rowIds.map((id) => rows.find((row) => row.id === id)).filter(Boolean)
  if (itemRows.length === 0) return null
  const { lots, poNotes, otherPo } = mergeLots(certs, process)
  const conflict = lots.some((lot) => lot.conflict)
  const lowConfidence = lots.some((lot) => lot.confidence === 'low')
  const itemKg = item.quantityKg
  const poText = item.po ? ` · ${item.po}` : ''
  const title = `${item.label}${poText}: ${lots.length} ${lots.length === 1 ? 'lote' : 'lotes'}`
  const base = {
    id: `coa|${item.key}`,
    kind: lots.length === 1 ? 'lote' : 'lotes',
    title,
    lots: lots.map(viewLot),
    itemKg,
    applicable: true,
    rowIds: item.rowIds,
    signature: rowsSignature(rows, item.rowIds),
    linkOptions: null,
  }
  const notes = [...poNotes, ...lotRepeatNotes(lots)]

  // 1 linha e 1 certificado: só o lote; a quantidade não muda.
  if (itemRows.length === 1 && lots.length === 1) {
    const [row] = itemRows
    const [lot] = lots
    const current = String(row.supplierLot ?? '').trim()
    if (current === lot.supplierLot) return null
    const edited = current !== '' && String(entries[row.id]?.base?.supplierLot ?? '').trim() !== current
    if (current !== '') notes.push(`Lote atual: “${current}”${edited ? EDITED_SUFFIX : ''}`)
    const rowKg = readCargoRowQuantity(row)
    if (lot.quantityKg !== null && rowKg !== null && !sameKg(lot.quantityKg, rowKg)) {
      notes.push(`COA: ${formatCargoKgText(lot.quantityKg)}; relatório: ${formatCargoKgText(rowKg)} (a quantidade não muda).`)
    }
    notes.push(...warningNotes(lots))
    return {
      ...base,
      sumKg: lot.quantityKg,
      sumState: 'single',
      notes,
      edited,
      defaultOn: !edited && !conflict && !lowConfidence && !otherPo,
      apply: { type: 'setLot', rowIds: [row.id], lots: [{ supplierLot: lot.supplierLot, quantityKg: lot.quantityKg }] },
    }
  }

  // Qualquer outro caso: as linhas do item são trocadas por uma linha por lote.
  if (sameLots(itemRows, lots)) return null
  const { state, sumKg } = classifySum(lots, itemKg)
  const edited = itemRows.some((row) => EDIT_FIELDS.some((field) => isFieldEditedByHand(row, entries[row.id], field)))
  const marked = itemRows.filter((row) => hasLogisticsMarks(conference, row.id)).length
  if (edited) notes.push(`Linhas deste item com edição à mão serão trocadas${EDITED_SUFFIX}`)
  if (marked > 0) {
    notes.push(
      `A logística já marcou OK?, contagem ou etiquetas em ${marked} ${marked === 1 ? 'linha' : 'linhas'} deste item; trocar as linhas apaga essas marcas.`
    )
  }
  notes.push(...warningNotes(lots))
  return {
    ...base,
    sumKg,
    sumState: state,
    notes,
    edited,
    defaultOn: state === 'ok' && !edited && marked === 0 && !conflict && !lowConfidence && !otherPo,
    apply: { type: 'replaceLots', rowIds: item.rowIds, lots: lots.map((lot) => ({ supplierLot: lot.supplierLot, quantityKg: lot.quantityKg })) },
  }
}

function buildCoaOnlyProposal(entry, cert, items, process) {
  const po = resolveCoaPurchaseOrder(cert.poReference, process)
  const optionLabel = (item) => `${item.label}${item.po ? ` · ${item.po}` : ''}`
  const rank = (item) => {
    if (entry.candidateKeys.includes(item.key)) return 0
    return po.index >= 0 && item.purchaseOrderIndex === po.index ? 1 : 2
  }
  const linkOptions = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => ({ key: item.key, label: optionLabel(item) }))
  const notes = []
  if (entry.reason === 'ambiguous') notes.push('Mais de um item do relatório parece combinar: escolha em “Ligar ao item”.')
  else if (entry.reason === 'otherPo') notes.push(`PO impressa no COA (${cert.poReference}) não é deste processo.`)
  else notes.push('Nenhum item do relatório tem nome parecido com este COA.')
  if (po.match === 'similar') notes.push(`PO impressa no COA: ${cert.poReference} (parecida com ${po.expected}).`)
  for (const warning of cert.warnings) notes.push(`Aviso da leitura: ${warning}`)
  const lot = {
    supplierLot: String(cert.batchNumber).trim(),
    quantityKg: cert.kg,
    confidence: cert.confidence,
    documentName: cert.documentName,
    page: cert.page,
    warnings: cert.warnings,
  }
  return {
    id: `coaonly|${cert.id}`,
    kind: 'só no COA',
    title: `COA sem item no relatório: ${cert.productName}`,
    certId: cert.id,
    lots: [lot],
    itemKg: null,
    sumKg: null,
    sumState: null,
    notes,
    edited: false,
    defaultOn: false,
    applicable: false,
    rowIds: [],
    signature: '',
    apply: null,
    linkOptions,
  }
}

// -> CoaProposal[]  (ordem: itens com COA, "só no COA", "só no relatório")
//   CoaProposal = { id: 'coa|<itemKey>' | 'coaonly|<certId>' | 'rowonly|<itemKey>', kind: 'lote' | 'lotes' | 'só no COA' |
//     'só no relatório', title, lots: [{ supplierLot, quantityKg|null, confidence, documentName, page, warnings }],
//     itemKg, sumKg, sumState: 'ok'|'short'|'over'|'incomplete'|'single'|'unknown'|null, notes, edited, defaultOn,
//     applicable, rowIds, signature, apply: { type: 'setLot'|'replaceLots', rowIds, lots } | null, linkOptions }
// Item já em dia (mesmos lotes e quantidades) não gera proposta. Só vem marcado (defaultOn) quando: a soma fecha (ou é
// 1 lote só), nenhum lote sem quantidade ou com confiança baixa, PO do COA igual/ausente/parecida, nada editado à mão
// nas linhas, nenhuma marca da logística nas linhas trocadas e nenhum lote repetido com quantidades diferentes.
export function buildCoaProposals(form, { items, certificates, match, conference, process }) {
  const certById = new Map(certificates.map((cert) => [cert.id, cert]))
  const proposals = []

  for (const item of items) {
    const certs = (match.byItemKey[item.key] ?? []).map((id) => certById.get(id)).filter(Boolean)
    if (certs.length === 0) continue
    const proposal = buildItemProposal(form, item, certs, { conference, process })
    if (proposal) proposals.push(proposal)
  }
  for (const entry of match.unmatched) {
    const cert = certById.get(entry.certId)
    if (cert) proposals.push(buildCoaOnlyProposal(entry, cert, items, process))
  }
  if (certificates.length > 0) {
    for (const item of items) {
      if ((match.byItemKey[item.key] ?? []).length > 0) continue
      proposals.push({
        id: `rowonly|${item.key}`,
        kind: 'só no relatório',
        title: `Sem COA para: ${item.label}${item.po ? ` · ${item.po}` : ''}`,
        lots: [],
        itemKg: item.quantityKg,
        sumKg: null,
        sumState: null,
        notes: [],
        edited: false,
        defaultOn: false,
        applicable: false,
        rowIds: item.rowIds,
        signature: '',
        apply: null,
        linkOptions: null,
      })
    }
  }
  return proposals
}

// ---------- aplicar ----------

// Aplica só as propostas marcadas e `applicable`. TUDO OU NADA: linhas que sumiram ou mudaram desde a leitura ->
// { form, error: 'stale' }; passaria de 200 linhas -> { form, error: 'limit' }; nada é aplicado em nenhum dos casos.
// `setLot` grava o lote (+ `base.supplierLot`); `replaceLots` troca as linhas do item por uma por lote e monta o
// `autofill` delas (chave do item, base do lote e da quantidade do COA, `coa: true`).
export function applyCoaProposals(form, proposals, selectedIds, { purchaseOrders = [] } = {}) {
  const selected = new Set(selectedIds ?? [])
  const chosen = (Array.isArray(proposals) ? proposals : []).filter((proposal) => proposal.applicable && proposal.apply && selected.has(proposal.id))
  if (chosen.length === 0) return { form }

  for (const proposal of chosen) {
    const exists = proposal.rowIds.every((id) => form.rows.some((row) => row.id === id))
    if (!exists || rowsSignature(form.rows, proposal.rowIds) !== proposal.signature) return { form, error: 'stale' }
  }
  const projected = chosen.reduce(
    (total, proposal) => total + (proposal.apply.type === 'replaceLots' ? proposal.apply.lots.length - proposal.apply.rowIds.length : 0),
    form.rows.length
  )
  if (projected > CARGO_REPORT_MAX_ROWS) return { form, error: 'limit' }

  let rows = form.rows.map((row) => ({ ...row }))
  const entries = { ...(form.autofill?.rows ?? {}) }

  for (const proposal of chosen) {
    const { apply } = proposal
    if (apply.type === 'setLot') {
      const lot = apply.lots[0]
      const row = rows.find((candidate) => candidate.id === apply.rowIds[0])
      row.supplierLot = lot.supplierLot
      const current = entries[row.id] ?? { key: '', base: {} }
      entries[row.id] = { ...current, base: { ...current.base, supplierLot: lot.supplierLot } }
      continue
    }
    const template = rows.find((candidate) => candidate.id === apply.rowIds[0])
    const templateEntry = entries[apply.rowIds[0]] ?? { key: '', base: {} }
    const result = replaceCargoRowsWithLots(rows, apply.rowIds, apply.lots, { template })
    if (result.error) return { form, error: result.error === 'limit' ? 'limit' : 'stale' }
    rows = result.rows
    for (const id of apply.rowIds) delete entries[id]
    result.insertedIds.forEach((id, index) => {
      const lot = apply.lots[index]
      const base = { ...templateEntry.base, supplierLot: lot.supplierLot }
      delete base.quantityKg
      const entry = { key: templateEntry.key ?? '', base }
      if (templateEntry.fupOnly) entry.fupOnly = true
      if (lot.quantityKg !== null) {
        entry.base.quantityKg = lot.quantityKg
        entry.coa = true
      }
      entries[id] = entry
    })
  }

  if (purchaseOrders.length > 0) rows = orderCargoRowsByPurchaseOrder(rows, purchaseOrders)
  const autofill = { ...(form.autofill ?? createEmptyCargoAutofill()), rows: entries }
  return { form: { ...form, rows, autofill } }
}
