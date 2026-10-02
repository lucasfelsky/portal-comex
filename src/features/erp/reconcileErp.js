// Conciliacao ERP (DBCorp) x Portal - F1 (SOMENTE LEITURA). Casa os embarques
// do ERP com os processos ja carregados no Portal, calcula as diferencas por
// campo e classifica o que so' existe de um lado. Nada aqui grava, le rede ou
// importa servico: recebe `processes` (somente leitura) e devolve um
// resultado novo, deterministico e ordenado.
//
// Camadas (nenhum import de camada acima): erpText <- erpItemRow,
// groupErpShipments <- reconcileErp. Nao importa nenhum modulo mockado pelo
// `tests/ui/ProcessesPage.test.jsx` (guarda em `erpReadOnlyGuard.test.js`).
import {
  cleanCell,
  compareErpWarnings,
  daysBetween,
  digitsOnly,
  foldText,
  makeErpWarning,
  normalizeDocNumber,
  parseVessel,
  squashVessel,
  supplierMatches,
} from './erpText.js'
import { normalizeErpItemRows } from './erpItemRow.js'
import { groupErpShipments } from './groupErpShipments.js'

// Estagios do Portal (paridade com `processStatusOptions`, testada).
export const PORTAL_STATUS_STAGES = {
  'Aguardando Embarque': 0,
  Embarcou: 1,
  'Aguardando atracação': 1,
  'Atracação Confirmada': 2,
  'Aguardando registro da DUIMP': 2,
  'Aguardando parametrização da DUIMP': 2,
  'Aguardando desembaraço': 2,
  'Aguardando agendamento de coleta': 2,
  'Coleta Agendada': 2,
  'Carga recebida': 3,
}

// Quem manda em cada campo (D-3, em aberto): 'erp' | 'portal' | 'a_definir'.
// Quando o Lucas responder, basta trocar o valor.
export const FIELD_AUTHORITY = {
  pedido: 'a_definir',
  category: 'a_definir',
  etd: 'a_definir',
  eta: 'a_definir',
  vessel: 'a_definir',
  destination: 'a_definir',
  origin: 'a_definir',
  incoterm: 'a_definir',
  bl: 'a_definir',
  di: 'a_definir',
  poSet: 'a_definir',
  poReference: 'a_definir',
  supplier: 'a_definir',
  items: 'a_definir',
  quantity: 'a_definir',
}

// Campos do Portal que a F2 poderia atualizar. Exclui TODO insumo do
// `deriveProcessStatus` (shippedAt, eta, berthed*, arrived*, cargoPresence*,
// duimp*, parameterizedAt, collection*), alem de `category` e `processStatus`.
export const F2_CANDIDATE_FIELDS = [
  'etd',
  'vesselName',
  'voyage',
  'destination',
  'originLocation',
  'incoterm',
  'supplierName',
  'masterBl',
  'houseBl',
  'mawb',
  'hawb',
  'purchaseOrders',
  'items',
]

// Categorias do "Só no ERP", na ordem de precedencia.
export const ERP_ONLY_CATEGORIES = [
  { key: 'nacional', label: 'Nacional' },
  { key: 'amostra_courier', label: 'Amostra / courier' },
  { key: 'erp_desatualizado', label: 'ERP desatualizado (NF recebida)' },
  { key: 'possivelmente_recebido_oculto', label: 'Possivelmente recebido (fora da lista do Portal)' },
  { key: 'a_consolidar', label: 'Aguardando consolidação (provável)' },
  { key: 'aguardando_prontidao_pagamento', label: 'Aguardando prontidão / pagamento' },
  { key: 'aguardando_embarque', label: 'Aguardando embarque' },
  { key: 'embarcado_sem_processo', label: 'Embarcado sem processo no Portal' },
  { key: 'indefinido', label: 'Indefinido' },
]

// D-15: origens que consolidam (a REF `LCL - FOB SHANGHAI` e' provisoria).
export const CONSOLIDATION_HUB_ORIGINS = ['SHANGHAI']

export const BLOCKED_MESSAGES = {
  lista_portal_vazia:
    'Os processos do Portal não foram carregados. Recarregue a página antes de conciliar.',
}

const FIELD_LABELS = {
  pedido: 'Pedido',
  category: 'Categoria',
  etd: 'ETD',
  eta: 'ETA',
  vessel: 'Navio / viagem',
  destination: 'Destino',
  origin: 'Origem',
  incoterm: 'Incoterm',
  bl: 'BL / AWB',
  di: 'DI / DUIMP',
  poSet: 'POs do consolidado',
  poReference: 'Ref. da PO',
  supplier: 'Fornecedor',
  items: 'Itens',
  quantity: 'Quantidade (kg)',
  status: 'Status',
}

const AUTHORITY_LABELS = {
  erp: 'provável erro no Portal',
  portal: 'ERP desatualizado',
  a_definir: 'Portal × ERP',
}

// Campos do Portal que uma correcao de cada diff tocaria (base do `applicable`).
const FIELD_WRITE_TARGETS = {
  pedido: ['processNumber'],
  category: ['category'],
  etd: ['etd'],
  eta: ['eta'],
  vessel: ['vesselName', 'voyage'],
  destination: ['destination'],
  origin: ['originLocation'],
  incoterm: ['incoterm'],
  di: ['duimpNumber', 'duimpRegisteredAt'],
  poSet: ['purchaseOrders.po'],
  poReference: ['purchaseOrders'],
  items: ['items'],
  quantity: ['items'],
  status: ['processStatus'],
}

const DIFF_ORDER = [
  'category', 'pedido', 'status', 'etd', 'eta', 'vessel', 'destination', 'origin', 'incoterm',
  'bl', 'di', 'poSet', 'poReference', 'supplier', 'items', 'quantity',
]

// `counts`: entra em `matchedWithDiffs`.
const COUNTS_BY_KIND = {
  divergente: true,
  portal_sem_dado: true,
  erp_atrasado: true,
  erp_conflito: true,
  erp_sem_dado: false,
  formato: false,
  informativo: false,
}

const CATEGORY_KINDS = {
  CONSOLIDADO: ['CONSOLIDADO'],
  FCL: ['FCL'],
  LCL: ['LCL'],
  AEREO: ['AEREO', 'AMOSTRA'],
}

const RECENT_RECEIPT_DAYS = 7

function compareText(a, b) {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function formatKg(value) {
  const rounded = Math.round(value * 1000) / 1000
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(3).replace('.', ',')
}

function pluralDays(count) {
  return `${count} ${count === 1 ? 'dia' : 'dias'}`
}

function uniqueText(values) {
  return [...new Set(values.map((value) => cleanCell(value)).filter((value) => value !== ''))]
}

function shipmentId(shipment) {
  return `${shipment.kind}|${shipment.key}`
}

// Chave de comparacao de PEDIDO/PO: os digitos; sem digitos, o texto dobrado.
function orderKey(value) {
  return digitsOnly(value) || foldText(value)
}

function conRefFromName(name) {
  const match = /^CON (CN|DG) (\d{3})-(\d{2})\b/.exec(foldText(name))
  return match ? `CON ${match[1]} ${match[2]}-${match[3]}` : ''
}

// ---------------------------------------------------------------------------
// Diffs
// ---------------------------------------------------------------------------

function createDiffFactory(authority) {
  return function makeDiff({
    field,
    label,
    portalFields,
    portal = '',
    erp = '',
    erpValue = null,
    kind,
    note = '',
    counts,
    targets,
    matchedField,
  }) {
    const writeTargets = targets ?? FIELD_WRITE_TARGETS[field] ?? []
    const fieldAuthority = authority[field] ?? 'a_definir'
    const diff = {
      field,
      label: label ?? FIELD_LABELS[field] ?? field,
      portalFields,
      portal,
      erp,
      erpValue,
      kind,
      counts: counts ?? COUNTS_BY_KIND[kind] ?? false,
      applicable: writeTargets.length > 0 && writeTargets.every((target) => F2_CANDIDATE_FIELDS.includes(target)),
      note,
      authority: fieldAuthority,
      authorityLabel: AUTHORITY_LABELS[fieldAuthority] ?? AUTHORITY_LABELS.a_definir,
    }
    if (matchedField !== undefined) diff.matchedField = matchedField
    return diff
  }
}

function findConflict(shipment, field) {
  return shipment.conflicts.find((conflict) => conflict.field === field)?.values ?? null
}

// Compara dois textos: null (igual), 'formato', 'divergente' ou *_sem_dado.
function classifyText(portal, erp, normalize) {
  const portalText = cleanCell(portal)
  const erpText = cleanCell(erp)
  if (portalText === '' && erpText === '') return null
  if (erpText === '') return 'erp_sem_dado'
  if (portalText === '') return 'portal_sem_dado'
  if (normalize(portalText) === normalize(erpText)) return portalText === erpText ? null : 'formato'
  return 'divergente'
}

// Campo textual simples do transporte (destino, incoterm...). Trata conflito
// interno do ERP (`erp_conflito`) antes da comparacao.
function scalarDiff(makeDiff, shipment, { field, conflictField, label, portalFields, portalValue, erpValue, normalize, note = '' }) {
  const conflict = conflictField ? findConflict(shipment, conflictField) : null
  if (conflict) {
    const portalNorm = normalize(portalValue)
    const hasEqual = portalNorm !== '' && conflict.some((value) => normalize(value) === portalNorm)
    return makeDiff({
      field,
      label,
      portalFields,
      portal: cleanCell(portalValue),
      erp: conflict.join(' | '),
      erpValue: null,
      kind: 'erp_conflito',
      counts: !hasEqual,
      note: `O ERP tem ${conflict.length} valores diferentes neste embarque.${hasEqual ? ' O Portal bate com um deles.' : ''}`,
    })
  }
  const kind = classifyText(portalValue, erpValue, normalize)
  if (!kind) return null
  return makeDiff({
    field,
    label,
    portalFields,
    portal: cleanCell(portalValue),
    erp: cleanCell(erpValue),
    erpValue: cleanCell(erpValue) === '' ? null : cleanCell(erpValue),
    kind,
    note,
  })
}

function dateNote(portalDate, erpDate) {
  const delta = daysBetween(portalDate, erpDate)
  if (delta === null || delta === 0) return ''
  return `Diferença de ${pluralDays(Math.abs(delta))} (ERP ${delta > 0 ? 'depois' : 'antes'} do Portal).`
}

function compareEtd(makeDiff, p, shipment) {
  const portalEtd = cleanCell(p.etd)
  const portalShipped = cleanCell(p.shippedAt)
  const erpEtd = shipment.transport.etd
  const portalDisplay = uniqueText([portalEtd, portalShipped]).join(' / ')
  const conflict = findConflict(shipment, 'etd')
  if (conflict) {
    const hasEqual = conflict.some((value) => value === portalEtd || value === portalShipped)
    return makeDiff({
      field: 'etd', portalFields: ['etd', 'shippedAt'], portal: portalDisplay, erp: conflict.join(' | '),
      kind: 'erp_conflito', counts: !hasEqual,
      note: `O ERP tem ${conflict.length} ETDs diferentes neste embarque.${hasEqual ? ' O Portal bate com um deles.' : ''}`,
    })
  }
  if (erpEtd === '') {
    if (portalDisplay === '') return null
    return makeDiff({ field: 'etd', portalFields: ['etd', 'shippedAt'], portal: portalDisplay, kind: 'erp_sem_dado' })
  }
  if (portalDisplay === '') {
    return makeDiff({ field: 'etd', portalFields: ['etd', 'shippedAt'], erp: erpEtd, erpValue: erpEtd, kind: 'portal_sem_dado' })
  }
  if (erpEtd === portalEtd || erpEtd === portalShipped) return null
  return makeDiff({
    field: 'etd', portalFields: ['etd', 'shippedAt'], portal: portalDisplay, erp: erpEtd, erpValue: erpEtd,
    kind: 'divergente', note: dateNote(portalEtd || portalShipped, erpEtd),
  })
}

function compareEta(makeDiff, p, shipment) {
  const portalEta = cleanCell(p.eta)
  const erpEta = shipment.transport.eta
  const conflict = findConflict(shipment, 'eta')
  if (conflict) {
    const hasEqual = conflict.includes(portalEta)
    return makeDiff({
      field: 'eta', portalFields: ['eta'], portal: portalEta, erp: conflict.join(' | '),
      kind: 'erp_conflito', counts: !hasEqual,
      note: `O ERP tem ${conflict.length} ETAs diferentes neste embarque.${hasEqual ? ' O Portal bate com um deles.' : ''}`,
    })
  }
  if (erpEta === '') {
    if (portalEta === '') return null
    return makeDiff({ field: 'eta', portalFields: ['eta'], portal: portalEta, kind: 'erp_sem_dado' })
  }
  if (portalEta === '') {
    return makeDiff({ field: 'eta', portalFields: ['eta'], erp: erpEta, erpValue: erpEta, kind: 'portal_sem_dado' })
  }
  if (erpEta === portalEta) return null
  return makeDiff({
    field: 'eta', portalFields: ['eta'], portal: portalEta, erp: erpEta, erpValue: erpEta,
    kind: 'divergente', note: dateNote(portalEta, erpEta),
  })
}

// `erpValue` do navio so leva o que o ERP realmente informa: nunca `voyage: ''`
// (aplicar isso na F2 apagaria a viagem do Portal).
function vesselErpValue(vessel) {
  const value = {}
  if (cleanCell(vessel.name) !== '') value.vesselName = vessel.name
  if (cleanCell(vessel.voyage) !== '') value.voyage = vessel.voyage
  return value
}

// Portal sem viagem separada: o nome pode trazer a viagem no fim
// (`BETA FAME 1AAERW1MA`).
function splitPortalVessel(name, voyage) {
  return voyage === '' ? parseVessel(name) : { name, voyage }
}

// Mesmo navio (nome igual), mas o ERP vem sem viagem ou com a viagem incompleta.
// Devolve null quando o nome difere ou a viagem do ERP nao se relaciona com a
// do Portal (segue como `divergente`).
//   - ERP sem viagem                          -> erp_sem_dado
//   - viagem do ERP = um trecho (split '/')   -> formato
//   - viagem do ERP = comeco da do Portal     -> informativo
function classifyPartialVoyage(portalName, portalVoyage, erpVessel) {
  const erpNameSquash = squashVessel(erpVessel.name)
  if (erpNameSquash === '') return null
  const portal = splitPortalVessel(portalName, portalVoyage)
  if (squashVessel(portal.name) !== erpNameSquash) return null

  const erpVoyageSquash = squashVessel('', erpVessel.voyage)
  if (erpVoyageSquash === '') {
    return { kind: 'erp_sem_dado', note: 'ERP sem viagem: o ERP traz só o nome do navio.' }
  }
  const portalVoyageSquash = squashVessel('', portal.voyage)
  if (portalVoyageSquash === '') return null
  const segments = portal.voyage.split('/').map((segment) => squashVessel('', segment))
  if (segments.includes(erpVoyageSquash)) {
    return { kind: 'formato', note: `O ERP traz só um trecho da viagem do Portal (${cleanCell(erpVessel.voyage)}).` }
  }
  if (portalVoyageSquash.startsWith(erpVoyageSquash)) {
    return {
      kind: 'informativo',
      note: `Viagem do ERP incompleta (${cleanCell(erpVessel.voyage)}); o Portal tem ${cleanCell(portal.voyage)}.`,
    }
  }
  return null
}

function compareVessel(makeDiff, p, shipment) {
  if (cleanCell(p.category) === 'AEREO') return null
  const portalName = cleanCell(p.vesselName)
  const portalVoyage = cleanCell(p.voyage)
  const portalCombined = cleanCell(`${portalName} ${portalVoyage}`)
  const portalSquash = squashVessel(portalName, portalVoyage)
  const vessel = shipment.transport.vessel
  const erpSquash = squashVessel(vessel.name, vessel.voyage)
  const portalFields = ['vesselName', 'voyage']

  const conflict = findConflict(shipment, 'vessel')
  if (conflict) {
    const hasEqual =
      portalSquash !== '' &&
      conflict.some((value) => {
        const parsed = parseVessel(value)
        return squashVessel(parsed.name, parsed.voyage) === portalSquash
      })
    return makeDiff({
      field: 'vessel', portalFields, portal: portalCombined, erp: conflict.join(' | '),
      kind: 'erp_conflito', counts: !hasEqual,
      note: `O ERP tem ${conflict.length} navios diferentes neste embarque.${hasEqual ? ' O Portal bate com um deles.' : ''}`,
    })
  }
  if (erpSquash === '') {
    if (portalSquash === '') return null
    return makeDiff({ field: 'vessel', portalFields, portal: portalCombined, kind: 'erp_sem_dado' })
  }
  const erpValue = vesselErpValue(vessel)
  if (portalSquash === '') {
    return makeDiff({ field: 'vessel', portalFields, erp: vessel.raw, erpValue, kind: 'portal_sem_dado' })
  }
  if (portalSquash === erpSquash) {
    if (foldText(portalCombined) === foldText(vessel.raw)) return null
    return makeDiff({
      field: 'vessel', portalFields, portal: portalCombined, erp: vessel.raw, erpValue, kind: 'formato',
      note: 'Mesmo navio e viagem, escritos de outro jeito.',
    })
  }
  const partial = classifyPartialVoyage(portalName, portalVoyage, vessel)
  if (partial) {
    // Informativo: sem erpValue e sem alvo de escrita (applicable=false).
    return makeDiff({
      field: 'vessel', portalFields, portal: portalCombined, erp: vessel.raw, kind: partial.kind,
      note: partial.note, targets: [],
    })
  }
  let note = ''
  if (p.transshipment === true) {
    const port = cleanCell(p.transshipmentPort) || 'porto não informado'
    note = `Navio diferente: possível outra perna (transbordo em ${port}).`
  }
  return makeDiff({
    field: 'vessel', portalFields, portal: portalCombined, erp: vessel.raw, erpValue, kind: 'divergente', note,
  })
}

function compareOrigin(makeDiff, p, shipment) {
  const portalOrigin = cleanCell(p.originLocation)
  const conflict = findConflict(shipment, 'origin')
  const candidates = conflict ?? uniqueText([shipment.transport.origin, shipment.originHint])
  const portalFields = ['originLocation']
  if (candidates.length === 0) {
    if (portalOrigin === '') return null
    return makeDiff({ field: 'origin', portalFields, portal: portalOrigin, kind: 'erp_sem_dado' })
  }
  const foldedPortal = foldText(portalOrigin)
  const related = (candidate) => {
    const foldedCandidate = foldText(candidate)
    return foldedPortal !== '' && (foldedPortal.includes(foldedCandidate) || foldedCandidate.includes(foldedPortal))
  }
  if (conflict) {
    const hasEqual = conflict.some(related)
    return makeDiff({
      field: 'origin', portalFields, portal: portalOrigin, erp: conflict.join(' | '),
      kind: 'erp_conflito', counts: !hasEqual,
      note: `O ERP tem ${conflict.length} origens diferentes neste embarque.${hasEqual ? ' O Portal bate com um deles.' : ''}`,
    })
  }
  if (portalOrigin === '') {
    return makeDiff({ field: 'origin', portalFields, erp: candidates[0], erpValue: candidates[0], kind: 'portal_sem_dado' })
  }
  if (candidates.some((candidate) => candidate === portalOrigin)) return null
  const match = candidates.find(related)
  if (match) {
    return makeDiff({ field: 'origin', portalFields, portal: portalOrigin, erp: match, erpValue: match, kind: 'formato' })
  }
  return makeDiff({
    field: 'origin', portalFields, portal: portalOrigin, erp: candidates[0], erpValue: candidates[0], kind: 'informativo',
    note: 'A origem do ERP é livre (porto ou país); só informativo.',
  })
}

function compareBl(makeDiff, p, shipment) {
  const portalFields = cleanCell(p.category) === 'AEREO' ? ['mawb', 'hawb'] : ['masterBl', 'houseBl']
  const portalValues = portalFields.map((name) => cleanCell(p[name]))
  const portalDisplay = uniqueText(portalValues).join(' / ')
  const erpBl = shipment.transport.blAwb
  const targets = portalFields
  const conflict = findConflict(shipment, 'blAwb')
  if (conflict) {
    const normalizedPortal = portalValues.map(normalizeDocNumber).filter((value) => value !== '')
    const hasEqual = conflict.some((value) => normalizedPortal.includes(normalizeDocNumber(value)))
    return makeDiff({
      field: 'bl', portalFields, portal: portalDisplay, erp: conflict.join(' | '), kind: 'erp_conflito',
      counts: !hasEqual, targets,
      note: `O ERP tem ${conflict.length} documentos diferentes neste embarque.${hasEqual ? ' O Portal bate com um deles.' : ''}`,
    })
  }
  if (erpBl === '') {
    if (portalDisplay === '') return null
    return makeDiff({ field: 'bl', portalFields, portal: portalDisplay, kind: 'erp_sem_dado', targets })
  }
  if (portalDisplay === '') {
    return makeDiff({ field: 'bl', portalFields, erp: erpBl, erpValue: erpBl, kind: 'portal_sem_dado', targets })
  }
  const erpNormalized = normalizeDocNumber(erpBl)
  const matchedField = portalFields.find((name) => normalizeDocNumber(p[name]) === erpNormalized)
  if (matchedField) {
    // D-7: mostra com QUAL campo do Portal o documento do ERP bateu.
    return makeDiff({
      field: 'bl', portalFields, portal: portalDisplay, erp: erpBl, erpValue: erpBl, kind: 'informativo',
      targets, matchedField, note: `O documento do ERP corresponde ao campo ${matchedField} do Portal.`,
    })
  }
  return makeDiff({
    field: 'bl', portalFields, portal: portalDisplay, erp: erpBl, erpValue: erpBl, kind: 'divergente', targets,
  })
}

function compareDi(makeDiff, p, shipment) {
  const diffs = []
  const numberDiff = scalarDiff(makeDiff, shipment, {
    field: 'di',
    conflictField: 'diNumber',
    label: 'DI / DUIMP (número)',
    portalFields: ['duimpNumber'],
    portalValue: p.duimpNumber,
    erpValue: shipment.transport.diNumber,
    normalize: normalizeDocNumber,
  })
  if (numberDiff) diffs.push(numberDiff)
  const dateDiff = scalarDiff(makeDiff, shipment, {
    field: 'di',
    conflictField: 'diDate',
    label: 'DI / DUIMP (data de registro)',
    portalFields: ['duimpRegisteredAt'],
    portalValue: cleanCell(p.duimpRegisteredAt).slice(0, 10),
    erpValue: shipment.transport.diDate,
    normalize: (value) => cleanCell(value),
  })
  if (dateDiff) diffs.push(dateDiff)
  return diffs
}

function comparePedido(makeDiff, p, shipment, matchRule) {
  const portalNumber = cleanCell(p.processNumber)
  const erpPedidos = uniqueText(shipment.orders.map((order) => order.pedido))
  if (erpPedidos.length === 0) return null
  if (portalNumber === '') {
    return makeDiff({ field: 'pedido', portalFields: ['processNumber'], erp: erpPedidos.join(', '), erpValue: erpPedidos, kind: 'portal_sem_dado' })
  }
  const portalDigits = digitsOnly(portalNumber)
  const inSet = portalDigits !== '' && erpPedidos.some((pedido) => digitsOnly(pedido) === portalDigits)
  if (inSet) {
    if (erpPedidos.some((pedido) => pedido === portalNumber)) return null
    return makeDiff({
      field: 'pedido', portalFields: ['processNumber'], portal: portalNumber, erp: erpPedidos.join(', '),
      erpValue: erpPedidos, kind: 'formato', note: 'Mesmo número de pedido, escrito de outro jeito.',
    })
  }
  return makeDiff({
    field: 'pedido', portalFields: ['processNumber'], portal: portalNumber, erp: erpPedidos.join(', '),
    erpValue: erpPedidos, kind: 'divergente',
    note: `O processo casou pela ${matchRule === 'po-base' ? 'base da PO' : 'PO'}, mas o pedido do Portal não está entre os do ERP.`,
  })
}

// Textos "so' numero" no lugar do fornecedor (CR-21).
function looksLikePoNumber(value, pedidoDigits) {
  const text = cleanCell(value)
  if (/^[\d\s.\-/]+$/.test(text) && /\d/.test(text)) return true
  const prefixed = /^(?:PO|PEDIDO)\b\W*(\d+)$/i.exec(text)
  return Boolean(prefixed) && pedidoDigits.has(digitsOnly(prefixed[1]))
}

function supplierDiff(makeDiff, { portalValue, exporters, pedidoDigits, label, notePrefix, targets }) {
  const portalText = cleanCell(portalValue)
  const portalFields = ['supplierName']
  const prefix = notePrefix ? `${notePrefix}: ` : ''
  if (exporters.length === 0) {
    if (portalText === '') return null
    return makeDiff({ field: 'supplier', label, portalFields, portal: portalText, kind: 'erp_sem_dado', targets })
  }
  const erpDisplay = exporters.join(' / ')
  if (portalText === '') {
    return makeDiff({
      field: 'supplier', label, portalFields, erp: erpDisplay, erpValue: exporters[0], kind: 'portal_sem_dado', targets,
    })
  }
  if (looksLikePoNumber(portalText, pedidoDigits)) {
    return makeDiff({
      field: 'supplier', label, portalFields, portal: portalText, erp: erpDisplay, erpValue: exporters[0],
      kind: 'divergente', targets, note: `${prefix}fornecedor preenchido com o número da PO.`,
    })
  }
  const results = exporters.map((exporter) => supplierMatches(portalText, exporter))
  if (results.includes('ok')) return null
  const kind = results.includes('formato') ? 'formato' : 'divergente'
  const best = exporters[results.includes('formato') ? results.indexOf('formato') : 0]
  return makeDiff({
    field: 'supplier', label, portalFields, portal: portalText, erp: erpDisplay, erpValue: best, kind, targets,
    note: kind === 'formato' ? `${prefix}mesmo fornecedor com sufixo ou complemento diferente.` : '',
  })
}

function comparePurchaseOrders(makeDiff, p, shipment, index) {
  const diffs = []
  const portalPos = (Array.isArray(p.purchaseOrders) ? p.purchaseOrders : [])
    .map((entry) => ({
      po: cleanCell(entry?.po),
      reference: cleanCell(entry?.reference),
      supplierName: cleanCell(entry?.supplierName),
    }))
    .filter((entry) => entry.po !== '')
  const erpOrders = new Map()
  for (const order of shipment.orders) {
    const key = orderKey(order.pedido)
    if (key === '') continue
    if (!erpOrders.has(key)) erpOrders.set(key, [])
    erpOrders.get(key).push(order)
  }
  const portalByKey = new Map()
  for (const entry of portalPos) {
    const key = orderKey(entry.po)
    if (!portalByKey.has(key)) portalByKey.set(key, entry)
  }

  // Conjunto de POs (PEDIDOs).
  const erpPedidos = [...erpOrders.values()].map((orders) => orders[0].pedido)
  const missing = [...erpOrders.keys()].filter((key) => !portalByKey.has(key)).sort(compareText)
  const extra = [...portalByKey.keys()].filter((key) => !erpOrders.has(key)).sort(compareText)
  const formatDiffs = [...portalByKey.keys()]
    .filter((key) => erpOrders.has(key) && portalByKey.get(key).po !== erpOrders.get(key)[0].pedido)
    .sort(compareText)
  const portalDisplay = portalPos.map((entry) => entry.po).join(', ')
  const erpDisplay = erpPedidos.join(', ')
  if (portalPos.length === 0 && erpPedidos.length > 0) {
    diffs.push(makeDiff({ field: 'poSet', portalFields: ['purchaseOrders'], erp: erpDisplay, erpValue: erpPedidos, kind: 'portal_sem_dado' }))
  } else if (missing.length > 0 || extra.length > 0) {
    const notes = []
    if (missing.length > 0) {
      notes.push(`Faltam no Portal: ${missing.map((key) => erpOrders.get(key)[0].pedido).join(', ')}.`)
    }
    if (extra.length > 0) {
      const parts = extra.map((key) => {
        const po = portalByKey.get(key).po
        const elsewhere = (index.shipmentsByPedido.get(key) ?? []).filter((other) => shipmentId(other) !== shipmentId(shipment))
        return elsewhere.length > 0 ? `${po} (no ERP está em REF ${elsewhere.map((other) => other.key).join(', ')})` : po
      })
      notes.push(`Sobram no Portal: ${parts.join('; ')}.`)
    }
    diffs.push(makeDiff({
      field: 'poSet', portalFields: ['purchaseOrders'], portal: portalDisplay, erp: erpDisplay,
      erpValue: erpPedidos, kind: 'divergente', note: notes.join(' '),
    }))
  } else if (formatDiffs.length > 0) {
    diffs.push(makeDiff({
      field: 'poSet', portalFields: ['purchaseOrders'], portal: portalDisplay, erp: erpDisplay, erpValue: erpPedidos,
      kind: 'formato',
      note: `Mesmo número com texto diferente: ${formatDiffs.map((key) => `${portalByKey.get(key).po} × ${erpOrders.get(key)[0].pedido}`).join('; ')}.`,
    }))
  }

  // Ref. da PO e fornecedor, PO a PO (so' as que existem nos 2 lados).
  const commonKeys = [...portalByKey.keys()].filter((key) => erpOrders.has(key)).sort(compareText)
  for (const key of commonKeys) {
    const entry = portalByKey.get(key)
    const orders = erpOrders.get(key)
    const label = `PO ${entry.po}`

    const erpRefs = uniqueText(orders.map((order) => order.poRef))
    const accepted = new Set(orders.flatMap((order) => [foldText(order.poRef), order.poBase]).filter((value) => value !== ''))
    if (erpRefs.length > 0) {
      if (entry.reference === '') {
        diffs.push(makeDiff({
          field: 'poReference', label: `Ref. da PO (${label})`, portalFields: ['purchaseOrders'],
          erp: erpRefs.join(' / '), erpValue: erpRefs[0], kind: 'portal_sem_dado',
        }))
      } else if (!accepted.has(foldText(entry.reference))) {
        diffs.push(makeDiff({
          field: 'poReference', label: `Ref. da PO (${label})`, portalFields: ['purchaseOrders'],
          portal: entry.reference, erp: erpRefs.join(' / '), erpValue: erpRefs[0], kind: 'divergente',
        }))
      }
    }

    const supplier = supplierDiff(makeDiff, {
      portalValue: entry.supplierName,
      exporters: uniqueText(orders.map((order) => order.exporter)),
      pedidoDigits: new Set(orders.map((order) => digitsOnly(order.pedido)).filter((value) => value !== '')),
      label: `Fornecedor (${label})`,
      notePrefix: label,
      targets: ['purchaseOrders'],
    })
    if (supplier) diffs.push(supplier)
  }
  return diffs
}

// Agrupa itens por nome (e por PO, no consolidado).
function groupPortalItems(items, isConsolidated) {
  const map = new Map()
  for (const item of Array.isArray(items) ? items : []) {
    const name = cleanCell(item?.commercialName ?? item?.name)
    if (name === '') continue
    const po = isConsolidated ? cleanCell(item?.poNumber) : ''
    const key = `${isConsolidated ? orderKey(po) : ''}|${foldText(name)}`
    if (!map.has(key)) map.set(key, { key, name, nameKey: foldText(name), po, poKey: isConsolidated ? orderKey(po) : '', sum: 0 })
    const entry = map.get(key)
    const quantity = Number(item?.quantity)
    entry.sum += Number.isFinite(quantity) ? quantity : 0
  }
  return map
}

function groupErpItems(items, isConsolidated) {
  const map = new Map()
  for (const item of items) {
    const name = cleanCell(item.commercialName)
    if (name === '') continue
    const po = isConsolidated ? cleanCell(item.pedido) : ''
    const key = `${isConsolidated ? orderKey(po) : ''}|${foldText(name)}`
    if (!map.has(key)) map.set(key, { key, name, nameKey: foldText(name), po, poKey: isConsolidated ? orderKey(po) : '', sum: 0, nulls: 0, count: 0 })
    const entry = map.get(key)
    entry.count += 1
    if (typeof item.quantityKg === 'number' && Number.isFinite(item.quantityKg)) entry.sum += item.quantityKg
    else entry.nulls += 1
  }
  return map
}

function sortedEntries(map) {
  return [...map.values()].sort((a, b) => compareText(a.key, b.key))
}

function compareItems(makeDiff, p, shipment, isConsolidated) {
  const diffs = []
  const portal = groupPortalItems(p.items, isConsolidated)
  const erp = groupErpItems(shipment.items, isConsolidated)
  const portalFields = ['items']
  const where = (entry) => (isConsolidated ? ` (PO ${entry.po || 'sem PO'})` : '')

  const consumed = new Set()
  for (const entry of sortedEntries(erp)) {
    if (portal.has(entry.key)) continue
    const other = isConsolidated
      ? sortedEntries(portal).find((candidate) => candidate.nameKey === entry.nameKey && !erp.has(candidate.key) && !consumed.has(candidate.key))
      : null
    if (other) {
      consumed.add(other.key)
      diffs.push(makeDiff({
        field: 'items', label: `Item: ${entry.name}`, portalFields, portal: `${other.name}${where(other)}`, erp: `${entry.name}${where(entry)}`,
        erpValue: { commercialName: entry.name, poNumber: entry.po }, kind: 'divergente',
        note: other.po === '' ? 'O item está sem PO vinculada no Portal.' : `PO diferente: Portal ${other.po}, ERP ${entry.po}.`,
      }))
    } else {
      diffs.push(makeDiff({
        field: 'items', label: `Item: ${entry.name}`, portalFields, erp: `${entry.name}${where(entry)}`,
        erpValue: { commercialName: entry.name, poNumber: entry.po }, kind: 'portal_sem_dado',
        note: 'Item do ERP que não está no Portal.',
      }))
    }
  }
  for (const entry of sortedEntries(portal)) {
    if (erp.has(entry.key) || consumed.has(entry.key)) continue
    diffs.push(makeDiff({
      field: 'items', label: `Item: ${entry.name}`, portalFields, portal: `${entry.name}${where(entry)}`, kind: 'divergente',
      note: isConsolidated && entry.po === '' ? 'Item do Portal sem PO vinculada e que não consta no ERP.' : 'Item do Portal que não consta no ERP.',
    }))
  }

  // Quantidade (D-5): so' nomes presentes nos 2 lados, em kg, a 3 casas.
  for (const entry of sortedEntries(erp)) {
    const portalEntry = portal.get(entry.key)
    if (!portalEntry) continue
    if (isConsolidated && entry.poKey === '') continue
    const label = `Quantidade (kg): ${entry.name}`
    const poNote = isConsolidated ? `PO ${entry.po}: ` : ''
    const nullNote = entry.nulls > 0 ? ` ${entry.nulls} ${entry.nulls === 1 ? 'linha sem quantidade' : 'linhas sem quantidade'} no ERP.` : ''
    const portalTotal = Math.round(portalEntry.sum * 1000)
    const erpTotal = Math.round(entry.sum * 1000)
    if (entry.nulls === entry.count) {
      diffs.push(makeDiff({
        field: 'quantity', label, portalFields, portal: formatKg(portalEntry.sum), kind: 'erp_sem_dado',
        note: `${poNote}O ERP não informa quantidade para este item.`,
      }))
      continue
    }
    if (portalTotal === 0 && erpTotal > 0) {
      diffs.push(makeDiff({
        field: 'quantity', label, portalFields, erp: formatKg(entry.sum), erpValue: erpTotal / 1000, kind: 'portal_sem_dado',
        note: `${poNote}Quantidade zerada no Portal.${nullNote}`,
      }))
      continue
    }
    if (portalTotal === erpTotal) continue
    const difference = formatKg((erpTotal - portalTotal) / 1000)
    if (entry.nulls > 0) {
      diffs.push(makeDiff({
        field: 'quantity', label, portalFields, portal: formatKg(portalEntry.sum), erp: formatKg(entry.sum), kind: 'informativo',
        note: `${poNote}Soma parcial do ERP (${formatKg(entry.sum)} kg) difere do Portal (${formatKg(portalEntry.sum)} kg); o total do ERP é desconhecido.${nullNote}`,
      }))
    } else {
      diffs.push(makeDiff({
        field: 'quantity', label, portalFields, portal: formatKg(portalEntry.sum), erp: formatKg(entry.sum),
        erpValue: erpTotal / 1000, kind: 'divergente',
        note: `${poNote}Portal ${formatKg(portalEntry.sum)} kg × ERP ${formatKg(entry.sum)} kg (diferença ${difference} kg).`,
      }))
    }
  }
  return diffs
}

function compareStatus(makeDiff, p, shipment, warnings) {
  const portalStatus = cleanCell(p.processStatus)
  if (portalStatus === '') return null
  const portalStage = PORTAL_STATUS_STAGES[portalStatus]
  const erpDisplay = [...shipment.statuses, ...(shipment.statusNf.length > 0 ? [`NF: ${shipment.statusNf.join(', ')}`] : [])].join(' | ')
  if (portalStage === undefined) {
    warnings.push(
      makeErpWarning('status_portal_desconhecido', `Processo ${cleanCell(p.name) || p.id}: status "${portalStatus}" fora dos 10 status conhecidos do Portal.`, {
        processId: String(p.id ?? ''), shipmentKey: shipment.key,
      })
    )
    return makeDiff({
      field: 'status', portalFields: ['processStatus'], portal: portalStatus, erp: erpDisplay, kind: 'informativo',
      note: 'Status do Portal fora do vocabulário conhecido; sem comparação de estágio.',
    })
  }
  if (shipment.stage === null || portalStage === shipment.stage) return null
  if (portalStage > shipment.stage) {
    return makeDiff({
      field: 'status', portalFields: ['processStatus'], portal: portalStatus, erp: erpDisplay, kind: 'erp_atrasado',
      note: 'O ERP está atrasado em relação ao Portal.',
    })
  }
  return makeDiff({
    field: 'status', portalFields: ['processStatus'], portal: portalStatus, erp: erpDisplay, kind: 'informativo',
    note: 'O ERP está à frente do Portal; o status do Portal é derivado e não deve ser alterado por aqui.',
  })
}

// Casou por PEDIDO/PO (chave forte), mas o embarque tem outra categoria (ex.:
// FCL no Portal x LCL no ERP). So' acusa: as demais comparacoes seguem normais.
// Sem `portalCategory` no embarque (INDEFINIDO/NACIONAL/AMOSTRA) nao ha o que
// afirmar: informativo.
function compareIncompatibleCategory(makeDiff, category, shipment) {
  const erpCategory = cleanCell(shipment.portalCategory)
  if (erpCategory === '') {
    return makeDiff({
      field: 'category', portalFields: ['category'], portal: category, erp: cleanCell(shipment.kind),
      kind: 'informativo', note: 'categoria do ERP indefinida',
    })
  }
  return makeDiff({
    field: 'category', portalFields: ['category'], portal: category, erp: erpCategory, erpValue: erpCategory,
    kind: 'divergente', note: `Categoria diferente: Portal ${category} × ERP ${erpCategory}`,
  })
}

function compareProcess(makeDiff, p, shipment, { matchRule, categoryMismatch, categoryIncompatible, index, warnings }) {
  const diffs = []
  const push = (diff) => {
    if (diff) diffs.push(diff)
  }
  const category = cleanCell(p.category)
  const isConsolidated = category === 'CONSOLIDADO'
  const perPo = !categoryMismatch

  if (categoryMismatch) {
    push(makeDiff({
      field: 'category', portalFields: ['category'], portal: category, erp: 'CONSOLIDADO', erpValue: 'CONSOLIDADO',
      kind: 'divergente', note: `Consolidado gravado como ${category}.`,
    }))
  } else if (categoryIncompatible) {
    push(compareIncompatibleCategory(makeDiff, category, shipment))
  }
  if (!isConsolidated && !categoryMismatch) push(comparePedido(makeDiff, p, shipment, matchRule))
  push(compareStatus(makeDiff, p, shipment, warnings))
  push(compareEtd(makeDiff, p, shipment))
  push(compareEta(makeDiff, p, shipment))
  push(compareVessel(makeDiff, p, shipment))
  push(scalarDiff(makeDiff, shipment, {
    field: 'destination', conflictField: 'destination', portalFields: ['destination'],
    portalValue: p.destination, erpValue: shipment.transport.destination, normalize: foldText,
  }))
  push(compareOrigin(makeDiff, p, shipment))
  if (shipment.kind !== 'CONSOLIDADO' && !isConsolidated) {
    push(scalarDiff(makeDiff, shipment, {
      field: 'incoterm', portalFields: ['incoterm'], portalValue: p.incoterm, erpValue: shipment.incoterm, normalize: foldText,
    }))
  }
  push(compareBl(makeDiff, p, shipment))
  for (const diff of compareDi(makeDiff, p, shipment)) push(diff)

  if (perPo && isConsolidated) {
    for (const diff of comparePurchaseOrders(makeDiff, p, shipment, index)) push(diff)
  }
  if (perPo) {
    if (!isConsolidated) {
      const exporters = uniqueText(shipment.orders.map((order) => order.exporter))
      push(supplierDiff(makeDiff, {
        portalValue: p.supplierName,
        exporters,
        pedidoDigits: new Set(shipment.orders.map((order) => digitsOnly(order.pedido)).filter((value) => value !== '')),
        targets: ['supplierName'],
      }))
    }
    for (const diff of compareItems(makeDiff, p, shipment, isConsolidated)) push(diff)
  }

  const rank = (diff) => {
    const position = DIFF_ORDER.indexOf(diff.field)
    return position === -1 ? DIFF_ORDER.length : position
  }
  return diffs
    .map((diff, position) => ({ diff, position }))
    .sort((a, b) => rank(a.diff) - rank(b.diff) || a.position - b.position)
    .map((entry) => entry.diff)
}

// ---------------------------------------------------------------------------
// Casamento
// ---------------------------------------------------------------------------

function buildIndex(shipments) {
  const consolidatedByRef = new Map()
  const shipmentsByPedido = new Map()
  const shipmentsByPoRef = new Map()
  const shipmentsByPoBase = new Map()
  const add = (map, key, shipment) => {
    if (key === '') return
    if (!map.has(key)) map.set(key, [])
    const list = map.get(key)
    if (!list.includes(shipment)) list.push(shipment)
  }
  for (const shipment of shipments) {
    if (shipment.kind === 'CONSOLIDADO') consolidatedByRef.set(shipment.key, shipment)
    for (const order of shipment.orders) {
      add(shipmentsByPedido, orderKey(order.pedido), shipment)
      add(shipmentsByPoRef, foldText(order.poRef), shipment)
      add(shipmentsByPoBase, order.poBase, shipment)
    }
  }
  return { consolidatedByRef, shipmentsByPedido, shipmentsByPoRef, shipmentsByPoBase }
}

function readPortalProcess(p) {
  return {
    p,
    id: String(p.id ?? ''),
    name: cleanCell(p.name),
    foldName: foldText(p.name),
    category: cleanCell(p.category),
    archived: Boolean(p.archived),
    pedidoDigits: digitsOnly(p.processNumber),
    conRef: conRefFromName(p.name),
  }
}

// `hasCompatible`: havia candidato de categoria compativel com a do processo.
// Sem ele, o casamento segue (PEDIDO/PO sao chave forte) e quem chama acusa a
// diferenca de categoria.
function pickBestShipment(category, candidates) {
  let pool = candidates
  const compatible = pool.filter((shipment) => (CATEGORY_KINDS[category] ?? []).includes(shipment.kind))
  if (compatible.length > 0) pool = compatible
  const active = pool.filter((shipment) => shipment.active)
  if (active.length > 0) pool = active
  const sorted = [...pool].sort((a, b) => compareText(a.key, b.key) || compareText(a.kind, b.kind))
  return { shipment: sorted[0], ambiguous: sorted.length > 1, count: sorted.length, hasCompatible: compatible.length > 0 }
}

// -> { shipment, rule, categoryMismatch, categoryIncompatible, ambiguous, count, warnings } | null
//   categoryMismatch: consolidado gravado com outra categoria (casou pela REF).
//   categoryIncompatible: casou por PEDIDO/PO, mas nenhum candidato tinha categoria compativel.
function findMatch(entry, index) {
  const warnings = []
  const { p } = entry

  if (entry.conRef && index.consolidatedByRef.has(entry.conRef)) {
    return {
      shipment: index.consolidatedByRef.get(entry.conRef),
      rule: 'consolidado:ref',
      categoryMismatch: entry.category !== 'CONSOLIDADO',
      categoryIncompatible: false,
      ambiguous: false,
      count: 1,
      warnings,
    }
  }

  if (entry.category === 'CONSOLIDADO') {
    const portalKeys = new Set(
      (Array.isArray(p.purchaseOrders) ? p.purchaseOrders : []).map((po) => orderKey(po?.po)).filter((key) => key !== '')
    )
    const scored = [...index.consolidatedByRef.values()]
      .map((shipment) => ({
        shipment,
        shared: new Set(shipment.orders.map((order) => orderKey(order.pedido)).filter((key) => portalKeys.has(key))).size,
      }))
      .filter((candidate) => candidate.shared > 0)
    if (scored.length === 0) return null
    const best = Math.max(...scored.map((candidate) => candidate.shared))
    const picked = pickBestShipment('CONSOLIDADO', scored.filter((candidate) => candidate.shared === best).map((candidate) => candidate.shipment))
    warnings.push(
      makeErpWarning(
        'consolidado_sem_ref',
        `Consolidado "${entry.name}" casado pelos pedidos com o embarque ${picked.shipment.key}; a REF do nome não foi encontrada no ERP.`,
        { processId: entry.id, shipmentKey: picked.shipment.key }
      )
    )
    return {
      shipment: picked.shipment,
      rule: 'consolidado:pedidos',
      categoryMismatch: false,
      categoryIncompatible: false,
      ambiguous: picked.ambiguous,
      count: picked.count,
      warnings,
    }
  }

  let candidates = entry.pedidoDigits ? index.shipmentsByPedido.get(entry.pedidoDigits) : undefined
  let rule = 'pedido'
  if (!candidates) {
    candidates = entry.foldName ? index.shipmentsByPoRef.get(entry.foldName) : undefined
    rule = 'po'
  }
  if (!candidates) {
    candidates = entry.foldName ? index.shipmentsByPoBase.get(entry.foldName) : undefined
    rule = 'po-base'
  }
  if (!candidates) return null

  const picked = pickBestShipment(entry.category, candidates)
  if (rule === 'po-base') {
    warnings.push(
      makeErpWarning(
        'match_por_po_base',
        `Processo "${entry.name}" casado pela base da PO dividida ${picked.shipment.key}.`,
        { processId: entry.id, shipmentKey: picked.shipment.key }
      )
    )
  }
  return {
    shipment: picked.shipment,
    rule,
    categoryMismatch: false,
    categoryIncompatible: !picked.hasCompatible,
    ambiguous: picked.ambiguous,
    count: picked.count,
    warnings,
  }
}

function classifyErpOnly(shipment, today) {
  const flags = []
  const etd = shipment.transport.etd
  if (shipment.kind === 'CONSOLIDADO') flags.push('consolidado_fora_do_portal')
  if (shipment.stage === 0 && etd !== '') {
    const late = daysBetween(etd, today)
    if (late !== null && late > 0) flags.push('etd_vencido')
  }

  let category = 'indefinido'
  const sinceEta = shipment.transport.eta === '' ? null : daysBetween(shipment.transport.eta, today)
  const stage = shipment.stage
  const hubOrigin = CONSOLIDATION_HUB_ORIGINS.includes(foldText(shipment.originHint))
  const hasBookedStatus = shipment.statuses.some((status) => foldText(status) === 'AG. EMBARQUE')

  if (shipment.kind === 'NACIONAL') category = 'nacional'
  else if (shipment.kind === 'AMOSTRA') category = 'amostra_courier'
  else if (shipment.concludedByNf) category = 'erp_desatualizado'
  else if (
    stage !== null && stage >= 1 &&
    (shipment.transport.etaFinal !== '' || shipment.nfDate !== '' || (sinceEta !== null && sinceEta > RECENT_RECEIPT_DAYS))
  ) category = 'possivelmente_recebido_oculto'
  // D-15: so' a REF `LCL - FOB SHANGHAI` (CIF/CFR SHANGHAI nao consolidam la').
  else if (shipment.kind === 'LCL' && hubOrigin && foldText(shipment.incoterm) === 'FOB' && stage === 0) category = 'a_consolidar'
  else if (stage === 0 && !hasBookedStatus) category = 'aguardando_prontidao_pagamento'
  else if (stage === 0) category = 'aguardando_embarque'
  else if (stage === 1 || stage === 2) category = 'embarcado_sem_processo'

  return { category, flags }
}

const ERP_ONLY_ORDER = ERP_ONLY_CATEGORIES.map((category) => category.key)

// processes: lista ja carregada no Portal (somente leitura).
// -> { blocked, blockedMessage, matched, erpOnly, portalOnly, warnings }
export function reconcileErp(processes, shipments, { today = '', fieldAuthority } = {}) {
  const list = (Array.isArray(processes) ? processes : []).filter((item) => item && typeof item === 'object')
  const all = Array.isArray(shipments) ? shipments : []
  const result = { blocked: null, blockedMessage: '', matched: [], erpOnly: [], portalOnly: [], warnings: [] }

  if (list.length === 0 && all.some((shipment) => shipment.active)) {
    return { ...result, blocked: 'lista_portal_vazia', blockedMessage: BLOCKED_MESSAGES.lista_portal_vazia }
  }

  const authority = { ...FIELD_AUTHORITY, ...(fieldAuthority ?? {}) }
  const makeDiff = createDiffFactory(authority)
  const index = buildIndex(all)
  const warnings = []

  // Nao arquivados primeiro: no desempate por embarque, o processo vivo vence.
  const entries = list
    .map(readPortalProcess)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || compareText(a.id, b.id) || compareText(a.name, b.name))

  const claims = new Map()
  const unmatched = []
  for (const entry of entries) {
    const found = findMatch(entry, index)
    if (!found) {
      unmatched.push(entry)
      continue
    }
    const id = shipmentId(found.shipment)
    if (!claims.has(id)) claims.set(id, [])
    claims.get(id).push({ entry, found })
  }

  const matchedEntries = []
  for (const [, claimants] of claims) {
    const live = claimants.filter((claimant) => !claimant.entry.archived)
    const kept = live.length > 0 ? live : claimants
    for (const claimant of claimants) {
      if (!kept.includes(claimant)) unmatched.push(claimant.entry)
    }
    if (kept.length > 1) {
      const shipment = kept[0].found.shipment
      warnings.push(
        makeErpWarning(
          'embarque_em_varios_processos',
          `O embarque ${shipment.key} casou com ${kept.length} processos: ${kept.map((claimant) => claimant.entry.name || claimant.entry.id).join('; ')}.`,
          { shipmentKey: shipment.key, processId: kept[0].entry.id }
        )
      )
    }
    matchedEntries.push(...kept)
  }

  const matchedShipments = new Set()
  for (const { entry, found } of matchedEntries) {
    matchedShipments.add(shipmentId(found.shipment))
    warnings.push(...found.warnings)
    if (found.ambiguous) {
      warnings.push(
        makeErpWarning(
          'match_ambiguo',
          `Processo "${entry.name}" tinha ${found.count} embarques candidatos; escolhido o de menor chave (${found.shipment.key}).`,
          { processId: entry.id, shipmentKey: found.shipment.key }
        )
      )
    }
    result.matched.push({
      processId: entry.id,
      processName: entry.name,
      category: entry.category,
      archived: entry.archived,
      shipmentKey: found.shipment.key,
      matchRule: found.rule,
      diffs: compareProcess(makeDiff, entry.p, found.shipment, {
        matchRule: found.rule,
        categoryMismatch: found.categoryMismatch,
        categoryIncompatible: found.categoryIncompatible,
        index,
        warnings,
      }),
    })
  }
  result.matched.sort((a, b) => compareText(foldText(a.processName), foldText(b.processName)) || compareText(a.processId, b.processId))

  result.portalOnly = unmatched
    .map((entry) => ({ processId: entry.id, processName: entry.name, category: entry.category, archived: entry.archived }))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || compareText(foldText(a.processName), foldText(b.processName)) || compareText(a.processId, b.processId))

  for (const shipment of all) {
    if (!shipment.active || matchedShipments.has(shipmentId(shipment))) continue
    const { category, flags } = classifyErpOnly(shipment, today)
    if (category === 'possivelmente_recebido_oculto') {
      warnings.push(
        makeErpWarning(
          'lista_portal_parcial',
          `O embarque ${shipment.key} parece já recebido; o Portal oculta recebidos há mais de 7 dias, então a lista pode estar parcial.`,
          { shipmentKey: shipment.key, pedido: shipment.orders[0]?.pedido ?? '' }
        )
      )
    }
    result.erpOnly.push({
      shipmentKey: shipment.key,
      kind: shipment.kind,
      category,
      flags,
      pedidos: uniqueText(shipment.orders.map((order) => order.pedido)),
      poRefs: uniqueText(shipment.orders.map((order) => order.poRef)),
      exporter: uniqueText(shipment.orders.map((order) => order.exporter)).join(' / '),
      stage: shipment.stage,
      statuses: shipment.statuses,
      statusNf: shipment.statusNf,
      etd: shipment.transport.etd,
      eta: shipment.transport.eta,
    })
  }
  result.erpOnly.sort(
    (a, b) =>
      ERP_ONLY_ORDER.indexOf(a.category) - ERP_ONLY_ORDER.indexOf(b.category) ||
      compareText(a.kind, b.kind) ||
      compareText(a.shipmentKey, b.shipmentKey)
  )

  result.warnings = warnings
  return result
}

function buildSummary({ erpRows, shipments, matched, erpOnly, portalOnly, warnings }) {
  const erpOnlyByCategory = {}
  for (const category of ERP_ONLY_CATEGORIES) erpOnlyByCategory[category.key] = 0
  for (const item of erpOnly) erpOnlyByCategory[item.category] += 1
  const warningsByCode = {}
  for (const warning of warnings) warningsByCode[warning.code] = (warningsByCode[warning.code] ?? 0) + 1
  return {
    erpRows,
    shipments: shipments.length,
    activeShipments: shipments.filter((shipment) => shipment.active).length,
    matched: matched.length,
    matchedWithDiffs: matched.filter((entry) => entry.diffs.some((diff) => diff.counts)).length,
    erpMissingFields: matched.reduce(
      (total, entry) => total + entry.diffs.filter((diff) => diff.kind === 'erp_sem_dado').length,
      0
    ),
    erpOnly: erpOnly.length,
    erpOnlyByCategory,
    portalOnly: portalOnly.length,
    portalOnlyArchived: portalOnly.filter((entry) => entry.archived).length,
    warnings: warnings.length,
    warningsByCode,
  }
}

// Fluxo completo: fonte -> normalizacao -> agrupamento -> casamento.
//   loaded: retorno de `source.load(input)` ({ rows, warnings, meta })
//   source: { id, label } (opcional; so' alimenta `sourceInfo` e `row.source`)
export function runErpReconciliation({ loaded, processes, today = '', fieldAuthority, source } = {}) {
  const meta = loaded?.meta ?? {}
  const sourceId = source?.id ?? ''
  const normalized = normalizeErpItemRows(loaded?.rows ?? [], { source: sourceId })
  const sourceInfo = {
    source: sourceId,
    label: source?.label ?? '',
    fileName: meta.fileName ?? '',
    fetchedAt: meta.fetchedAt ?? '',
    rowCount: typeof meta.rowCount === 'number' ? meta.rowCount : normalized.rows.length,
    generatedOn: today,
  }

  if (normalized.blocking) {
    const warnings = [...(loaded?.warnings ?? []), ...normalized.warnings].sort(compareErpWarnings)
    return {
      blocked: normalized.blocking.code,
      blockedMessage: normalized.blocking.message,
      sourceInfo,
      summary: buildSummary({
        erpRows: normalized.rows.length, shipments: [], matched: [], erpOnly: [], portalOnly: [], warnings,
      }),
      matched: [],
      erpOnly: [],
      portalOnly: [],
      warnings,
    }
  }

  const grouped = groupErpShipments(normalized.rows)
  const reconciled = reconcileErp(processes, grouped.shipments, { today, fieldAuthority })
  const warnings = [
    ...(loaded?.warnings ?? []),
    ...normalized.warnings,
    ...grouped.warnings,
    ...reconciled.warnings,
  ].sort(compareErpWarnings)

  return {
    blocked: reconciled.blocked,
    blockedMessage: reconciled.blockedMessage,
    sourceInfo,
    summary: buildSummary({
      erpRows: normalized.rows.length,
      shipments: grouped.shipments,
      matched: reconciled.matched,
      erpOnly: reconciled.erpOnly,
      portalOnly: reconciled.portalOnly,
      warnings,
    }),
    matched: reconciled.matched,
    erpOnly: reconciled.erpOnly,
    portalOnly: reconciled.portalOnly,
    warnings,
  }
}
