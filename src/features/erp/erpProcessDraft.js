// Conciliacao ERP (DBCorp) x Portal - F3: rascunho de processo a partir do
// embarque "so' no ERP". Modulo PURO (nenhum dado financeiro: o rascunho nasce do
// recorte `toErpReferenceShipment`, que nao carrega coluna financeira). Nao grava,
// nao le rede e nao importa servico: a gravacao chega por callback injetado na
// pagina. Recebe `today` (YYYY-MM-DD) por parametro; nunca constroi Date a
// partir de texto.
//
// Camada: erpText + reconcileErp <- erpProcessDraft (guarda em
// `erpReadOnlyGuard.test.js`).
import { INCOTERMS, cleanCell, daysBetween, digitsOnly, foldText } from './erpText.js'
import {
  ERP_ONLY_CATEGORIES,
  erpConRefFromName,
  erpOrderKey,
  toErpReferenceShipment,
} from './reconcileErp.js'

// As 18 chaves que o rascunho leva (todas na allowlist de criacao do admin).
export const ERP_DRAFT_PROCESS_KEYS = [
  'name', 'category', 'processNumber', 'purchaseOrders', 'supplierName', 'originLocation', 'destination',
  'incoterm', 'vesselName', 'voyage', 'etd', 'eta', 'shippedAt', 'masterBl', 'houseBl', 'duimpNumber',
  'duimpRegisteredAt', 'items',
]

// So' estas categorias do "Só no ERP" viram candidatas a processo.
export const ERP_CREATABLE_CATEGORIES = ['aguardando_embarque', 'embarcado_sem_processo']
export const ERP_CREATABLE_KINDS = ['FCL', 'LCL', 'CONSOLIDADO']

// ERP parado em AG. EMBARQUE com ETD mais velho que isto: confira antes de criar.
export const ERP_STALE_ETD_DAYS = 30

// Teto de POs de um consolidado (paridade com o repositorio de POs do Portal).
export const ERP_MAX_PURCHASE_ORDERS = 50

// Filtro "Tipo" do painel (o valor e' o `kind` do embarque).
export const ERP_CREATE_TYPE_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'FCL', label: 'FCL' },
  { value: 'LCL', label: 'LCL' },
  { value: 'CONSOLIDADO', label: 'CON' },
]

export const ERP_BLOCK_REASON_LABELS = {
  tipo_nao_criavel: 'Tipo não criável a partir do DBCorp (aéreo ou indefinido): crie pelo "Novo processo".',
  sem_po: 'Sem PO no ERP.',
  pos_demais: `Mais de ${ERP_MAX_PURCHASE_ORDERS} POs no consolidado.`,
  pedido_em_outro_embarque:
    'O PEDIDO também está em outro embarque do mesmo tipo: crie pelo "Novo processo".',
  ja_existe_no_portal: 'Já tem processo no Portal com o mesmo PEDIDO ou nome da PO.',
  casado: 'Já casado com um processo do Portal.',
}

const CONFLICT_LABELS = {
  etd: 'ETD',
  eta: 'ETA',
  vessel: 'Navio / viagem',
  blAwb: 'BL',
  origin: 'Origem',
  destination: 'Destino',
  diNumber: 'Nº da DI',
  diDate: 'Data da DI',
  incoterm: 'Incoterm',
  originHint: 'Origem (dica da REF)',
}

const BADGE_BY_KIND = { FCL: 'FCL', LCL: 'LCL', CONSOLIDADO: 'CON' }

const REVIEW_MESSAGE =
  'O Portal oculta processos recebidos há mais de 7 dias; confira se este embarque já tem processo antes de criar.'

const MAX_AUDIT_TARGET_LENGTH = 1500

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// "1 processo" / "N processos".
export function formatProcessCount(count) {
  return `${count} ${count === 1 ? 'processo' : 'processos'}`
}

// Quilos em pt-BR, ate 3 casas e sem zeros a direita: 1500.5 -> "1.500,5".
export function formatKgBr(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  const rounded = Math.round(Math.abs(number) * 1000) / 1000
  const [whole, fraction = ''] = String(rounded).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const sign = number < 0 && rounded !== 0 ? '-' : ''
  return fraction === '' ? `${sign}${grouped}` : `${sign}${grouped},${fraction}`
}

function uniqueByKey(values, keyOf) {
  const seen = new Set()
  const unique = []
  for (const value of values) {
    const key = keyOf(value)
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    unique.push(value)
  }
  return unique
}

function joinValues(values) {
  return values.join(', ')
}

// `needsReview` (D-F3-6): o Portal oculta recebidos ha mais de 7 dias, entao um
// embarque com sinais de estar parado/ja recebido pede conferencia antes.
function shouldReview({ stage, etd, eta, today }) {
  if (stage !== null && stage >= 1) return eta === ''
  if (stage !== 0) return false
  if (eta !== '') {
    const sinceEta = daysBetween(eta, today)
    if (sinceEta !== null && sinceEta > 0) return true
  }
  if (etd !== '') {
    const sinceEtd = daysBetween(etd, today)
    if (sinceEtd !== null && sinceEtd > ERP_STALE_ETD_DAYS) return true
  }
  return false
}

// Recebe o recorte `toErpReferenceShipment` (idempotente: aceita o embarque
// agrupado tambem) e devolve o rascunho, a previa e os avisos. Nunca lanca.
export function buildProcessDraftFromErpShipment(shipment, { today = '', erpCategory = '' } = {}) {
  const ship = toErpReferenceShipment(shipment)
  const { transport, orders } = ship
  const category = ERP_CREATABLE_KINDS.includes(ship.kind) ? ship.kind : ''
  const isConsolidated = category === 'CONSOLIDADO'
  const warnings = []
  const warn = (code, message) => warnings.push({ code, message })
  const conflicts = new Map(ship.conflicts.map((conflict) => [conflict.field, conflict.values]))

  for (const conflict of ship.conflicts) {
    warn(
      'campo_em_conflito',
      `${CONFLICT_LABELS[conflict.field] ?? conflict.field} com valores diferentes no ERP (${conflict.values.join(' | ')}): não preenchido.`
    )
  }

  let blockReason = category === '' ? 'tipo_nao_criavel' : ''
  if (orders.some((order) => order.poBase !== '')) {
    warn('po_dividida', 'PO dividida no ERP (sufixo .1/.2): confira o processo da outra parte antes de criar.')
  }

  // Nome, PEDIDO e POs.
  let name = ''
  let processNumber = ''
  let purchaseOrders = []
  const keptPedidoByKey = new Map()
  if (isConsolidated) {
    name = cleanCell(ship.key)
    const kept = []
    const repeated = []
    const seen = new Set()
    for (const order of orders) {
      const key = erpOrderKey(order.pedido)
      if (key !== '' && seen.has(key)) {
        repeated.push(order.pedido)
        continue
      }
      if (key !== '') {
        seen.add(key)
        keptPedidoByKey.set(key, order.pedido)
      }
      kept.push(order)
    }
    if (repeated.length > 0) {
      warn(
        'po_repetida_no_consolidado',
        `PEDIDO repetido no consolidado (${joinValues(uniqueByKey(repeated, erpOrderKey))}): fica só a primeira PO de cada PEDIDO.`
      )
    }
    purchaseOrders = kept.map((order) => ({ po: order.pedido, reference: order.poRef, supplierName: order.exporter }))
    if (blockReason === '' && purchaseOrders.length === 0) blockReason = 'sem_po'
    if (blockReason === '' && purchaseOrders.length > ERP_MAX_PURCHASE_ORDERS) blockReason = 'pos_demais'
    if (purchaseOrders.length === 1) {
      warn('consolidado_com_1_po', 'Consolidado com só 1 PO no ERP: o Portal pedirá "POs consolidadas (mín. 2)".')
    }
  } else {
    name = cleanCell(orders[0]?.poRef)
    processNumber = cleanCell(orders[0]?.pedido)
    if (blockReason === '' && name === '') blockReason = 'sem_po'
    const pedidos = uniqueByKey(orders.map((order) => order.pedido), erpOrderKey)
    if (pedidos.length > 1) {
      warn(
        'pedidos_multiplos',
        `Mais de um PEDIDO neste embarque (${joinValues(pedidos)}): o processo usa o menor (${pedidos[0]}).`
      )
    }
  }

  // Fornecedor: so' fora do consolidado (la' cada PO leva o seu).
  let supplierName = ''
  const exporters = uniqueByKey(orders.map((order) => order.exporter), foldText)
  if (!isConsolidated) {
    if (exporters.length === 1) supplierName = exporters[0]
    else if (exporters.length > 1) {
      warn('fornecedores_diferentes', `Fornecedores diferentes no ERP (${joinValues(exporters)}): não preenchido.`)
    }
  }

  // Origem (a dica da REF so' vale sem conflito) e destino (maiusculas, acento mantido).
  let originLocation = cleanCell(transport.origin)
  if (originLocation === '' && !conflicts.has('origin') && !conflicts.has('originHint')) {
    originLocation = cleanCell(ship.originHint)
  }
  const destination = cleanCell(transport.destination).toUpperCase()

  // Incoterm: a REF do consolidado nao traz; vazio nasce com a pendencia.
  let incoterm = ''
  if (!isConsolidated && !conflicts.has('incoterm')) {
    const folded = foldText(ship.incoterm)
    if (folded !== '') {
      if (INCOTERMS.includes(folded)) incoterm = folded
      else warn('incoterm_invalido', `Incoterm "${cleanCell(ship.incoterm)}" fora da lista de Incoterms: não preenchido.`)
    }
  }

  // Embarque confirmado: ETD de quem ja embarcou (estagio >= 1).
  const stage = ship.stage
  const etd = transport.etd
  const eta = transport.eta
  let shippedAt = ''
  if (stage !== null && stage >= 1) {
    if (etd === '') {
      warn('embarcou_sem_etd', 'O ERP diz que embarcou, mas não há um ETD único: o embarque não foi confirmado.')
    } else {
      shippedAt = etd
      const ahead = daysBetween(today, etd)
      if (ahead !== null && ahead > 0) {
        warn('etd_futuro_embarcado', 'O ERP diz que embarcou, mas o ETD é futuro: confira a data de embarque.')
      }
    }
    if (stage === 2) {
      warn('atracado_no_erp', 'O ERP já mostra atracação (ATRAC. AG. LIBERAÇÃO): confirme a atracação no processo.')
    }
  }

  // DI do ERP vira a DUIMP, so' com embarque confirmado e numero + data.
  let duimpNumber = ''
  let duimpRegisteredAt = ''
  const diInConflict = conflicts.has('diNumber') || conflicts.has('diDate')
  const hasDi = transport.diNumber !== '' || transport.diDate !== ''
  if (hasDi && !diInConflict) {
    if (shippedAt === '') {
      warn('di_sem_embarque', 'O ERP traz DI, mas o embarque não está confirmado: a DUIMP não foi preenchida.')
    } else if (transport.diNumber !== '' && transport.diDate !== '') {
      duimpNumber = transport.diNumber
      duimpRegisteredAt = `${transport.diDate}T00:00`
    } else {
      warn('di_incompleta', 'O ERP traz só o número ou só a data da DI: a DUIMP não foi preenchida.')
    }
  }

  // Itens: 1 por linha do ERP, sem somar. No consolidado, ligados a PO pelo PEDIDO.
  const items = ship.items.map((item) => {
    const entry = { commercialName: item.commercialName, quantity: item.quantityKg ?? 0 }
    if (isConsolidated) {
      const poNumber = keptPedidoByKey.get(erpOrderKey(item.pedido))
      if (poNumber !== undefined && erpOrderKey(item.pedido) !== '') entry.poNumber = poNumber
    }
    return entry
  })
  const itemsWithoutQuantity = ship.items.filter((item) => item.quantityKg === null).length
  if (itemsWithoutQuantity > 0) {
    warn('item_sem_quantidade', `${itemsWithoutQuantity} item(ns) sem quantidade no ERP: gravado(s) com 0 kg.`)
  }
  const itemsWithoutName = ship.items.filter((item) => cleanCell(item.commercialName) === '').length
  if (itemsWithoutName > 0) {
    warn('item_sem_nome', `${itemsWithoutName} item(ns) sem nome comercial no ERP.`)
  }

  const needsReview = shouldReview({ stage, etd, eta, today })
  if (needsReview) warn('confira_se_ja_recebido', REVIEW_MESSAGE)

  const process = {
    name,
    category,
    processNumber,
    purchaseOrders,
    supplierName,
    originLocation,
    destination,
    incoterm,
    vesselName: transport.vessel.name,
    voyage: transport.vessel.voyage,
    etd,
    eta,
    shippedAt,
    masterBl: '',
    houseBl: transport.blAwb,
    duimpNumber,
    duimpRegisteredAt,
    items,
  }

  const totalKg = Math.round(items.reduce((total, item) => total + item.quantity, 0) * 1000) / 1000
  const vesselLabel = [process.vesselName, process.voyage].filter((part) => part !== '').join(' / ')
  const orderLabels = isConsolidated
    ? purchaseOrders.map((order) => (order.reference ? `${order.po} (${order.reference})` : order.po))
    : uniqueByKey(orders.map((order) => order.pedido), erpOrderKey).map((pedido) => `PEDIDO ${pedido}`)

  return {
    key: `${ship.kind}|${ship.key}`,
    shipmentKey: ship.key,
    kind: ship.kind,
    category,
    erpCategory,
    erpCategoryLabel: ERP_ONLY_CATEGORIES.find((entry) => entry.key === erpCategory)?.label ?? '',
    creatable: blockReason === '',
    blockReason,
    existingName: '',
    needsReview,
    process,
    preview: {
      badge: BADGE_BY_KIND[category] ?? '',
      name,
      supplierLabel: joinValues(exporters),
      vesselLabel,
      etd,
      eta,
      orderLabels,
      itemCount: items.length,
      totalKg,
      shipped: shippedAt !== '',
      duimp: duimpNumber !== '',
    },
    warnings,
  }
}

// Processo da lista que ja cobre este rascunho (arquivados contam), ou null.
// Consolidado: pela REF canonica do nome. FCL/LCL: pelos digitos do PEDIDO ou pelo
// nome (= PO). O texto vazio nunca casa; entrada que nao e' objeto e' ignorada.
export function findExistingProcessForErpDraft(draft, processes) {
  const target = isRecord(draft?.process) ? draft.process : {}
  const list = Array.isArray(processes) ? processes.filter(isRecord) : []
  if (target.category === 'CONSOLIDADO') {
    const ref = cleanCell(target.name)
    if (ref === '') return null
    return list.find((entry) => erpConRefFromName(entry.name) === ref) ?? null
  }
  const pedido = digitsOnly(target.processNumber)
  const name = foldText(target.name)
  return (
    list.find((entry) => {
      // O processo consolidado nao e' tomado como FCL/LCL (o casamento prefere o tipo compativel).
      if (foldText(entry.category) === 'CONSOLIDADO') return false
      if (pedido !== '' && digitsOnly(entry.processNumber) === pedido) return true
      return name !== '' && foldText(entry.name) === name
    }) ?? null
  )
}

// Embarques (casados e so' no ERP) por `tipo|PEDIDO`: base do bloqueio "PEDIDO em
// outro embarque do mesmo tipo".
function indexShipmentsByPedido(result) {
  const index = new Map()
  const add = (reference, label) => {
    const shipment = toErpReferenceShipment(reference)
    const id = `${shipment.kind}|${shipment.key}`
    for (const order of shipment.orders) {
      const pedidoKey = erpOrderKey(order.pedido)
      if (pedidoKey === '') continue
      const slot = `${shipment.kind}|${pedidoKey}`
      if (!index.has(slot)) index.set(slot, [])
      if (!index.get(slot).some((entry) => entry.id === id)) index.get(slot).push({ id, label: label || shipment.key })
    }
  }
  for (const entry of Array.isArray(result.matched) ? result.matched : []) {
    if (isRecord(entry)) add(entry.referenceShipment, cleanCell(entry.processName))
  }
  for (const item of Array.isArray(result.erpOnly) ? result.erpOnly : []) {
    if (isRecord(item)) add(item.referenceShipment, '')
  }
  return index
}

// Processos do Portal que a conciliacao NAO casou com nenhum embarque (`portalOnly`),
// lidos na lista do Portal para ter PEDIDO e POs (o item de `portalOnly` so' traz id,
// nome e categoria). Um processo gravado com outro tipo (ex.: FCL como CONSOLIDADO)
// nao casa com o embarque, mas pode ser o mesmo: criar de novo duplicaria.
function indexPortalOnlyProcesses(result, processes) {
  const portalOnly = Array.isArray(result.portalOnly) ? result.portalOnly.filter(isRecord) : []
  if (portalOnly.length === 0) return []
  const byId = new Map()
  for (const entry of Array.isArray(processes) ? processes : []) {
    if (isRecord(entry) && String(entry.id ?? '') !== '') byId.set(String(entry.id), entry)
  }
  return portalOnly.map((item) => {
    const source = byId.get(String(item.processId ?? '')) ?? { name: item.processName }
    const pedidoKeys = new Set()
    const addPedido = (value) => {
      const key = erpOrderKey(value)
      if (key !== '') pedidoKeys.add(key)
    }
    addPedido(source.processNumber)
    for (const order of Array.isArray(source.purchaseOrders) ? source.purchaseOrders : []) {
      if (isRecord(order)) addPedido(order.po)
    }
    return { name: cleanCell(source.name), foldName: foldText(source.name), pedidoKeys }
  })
}

// Processo sem embarque casado que bate com o rascunho pelo PEDIDO (de qualquer um
// dos pedidos do embarque) ou pelo nome (o do rascunho ou o de uma das POs), ou null.
function findPortalOnlyProcessForErpDraft(draft, reference, portalOnly) {
  if (portalOnly.length === 0) return null
  const { orders } = toErpReferenceShipment(reference)
  const pedidoKeys = new Set()
  const names = new Set()
  const addPedido = (value) => {
    const key = erpOrderKey(value)
    if (key !== '') pedidoKeys.add(key)
  }
  const addName = (value) => {
    const folded = foldText(value)
    if (folded !== '') names.add(folded)
  }
  addPedido(draft.process.processNumber)
  addName(draft.process.name)
  for (const order of orders) {
    addPedido(order.pedido)
    addName(order.poRef)
  }
  return (
    portalOnly.find(
      (entry) => (entry.foldName !== '' && names.has(entry.foldName)) || [...entry.pedidoKeys].some((key) => pedidoKeys.has(key))
    ) ?? null
  )
}

// Candidatos a criacao, na ordem do "Só no ERP": so' as 2 categorias criaveis, cada
// uma com o seu `creatable`/`blockReason`/`existingName`. Resultado bloqueado -> [].
export function buildErpCreationCandidates(result, { today = '', processes = [] } = {}) {
  if (!isRecord(result) || result.blocked) return []
  const erpOnly = Array.isArray(result.erpOnly) ? result.erpOnly : []
  const byPedido = indexShipmentsByPedido(result)
  const portalOnly = indexPortalOnlyProcesses(result, processes)
  const candidates = []
  for (const item of erpOnly) {
    if (!isRecord(item) || !ERP_CREATABLE_CATEGORIES.includes(item.category)) continue
    const reference = isRecord(item.referenceShipment) ? item.referenceShipment : { kind: item.kind, key: item.shipmentKey }
    const draft = buildProcessDraftFromErpShipment(reference, { today, erpCategory: item.category })
    if (draft.creatable && draft.category !== 'CONSOLIDADO') {
      const pedidoKey = erpOrderKey(draft.process.processNumber)
      const others = pedidoKey === '' ? [] : (byPedido.get(`${draft.kind}|${pedidoKey}`) ?? []).filter((entry) => entry.id !== draft.key)
      if (others.length > 0) {
        draft.creatable = false
        draft.blockReason = 'pedido_em_outro_embarque'
        draft.existingName = others[0].label
      }
    }
    if (draft.creatable) {
      const existing = findExistingProcessForErpDraft(draft, processes)
      if (existing) {
        draft.creatable = false
        draft.blockReason = 'ja_existe_no_portal'
        draft.existingName = cleanCell(existing.name)
      }
    }
    if (draft.creatable) {
      const unmatched = findPortalOnlyProcessForErpDraft(draft, reference, portalOnly)
      if (unmatched) {
        draft.creatable = false
        draft.blockReason = 'ja_existe_no_portal'
        draft.existingName = unmatched.name
      }
    }
    candidates.push(draft)
  }
  return candidates
}

// Reconferencia com a lista fresca: `Map<key, { creatable, reason, existingName }>`.
// Os embarques ja casados saem como `casado`. Resultado bloqueado -> Map vazio.
export function buildErpCreationRecheck(result, { today = '', processes = [] } = {}) {
  const status = new Map()
  if (!isRecord(result) || result.blocked) return status
  for (const candidate of buildErpCreationCandidates(result, { today, processes })) {
    status.set(candidate.key, {
      creatable: candidate.creatable,
      reason: candidate.blockReason,
      existingName: candidate.existingName,
    })
  }
  for (const entry of Array.isArray(result.matched) ? result.matched : []) {
    if (!isRecord(entry)) continue
    const shipment = toErpReferenceShipment(entry.referenceShipment)
    status.set(`${shipment.kind}|${entry.shipmentKey}`, {
      creatable: false,
      reason: 'casado',
      existingName: cleanCell(entry.processName),
    })
  }
  return status
}

const DRAFT_DEFAULTS = { purchaseOrders: [], items: [] }

// Fronteira de forma: so' as 18 chaves do rascunho passam (uma chave extra, como
// `berthed`, muda o caminho do saneador e nunca pode entrar). -> { ok, process } |
// { ok: false, reason: 'forma_invalida' }.
export function pickErpDraftProcess(process) {
  if (
    !isRecord(process) ||
    !ERP_CREATABLE_KINDS.includes(process.category) ||
    cleanCell(process.name) === '' ||
    !Array.isArray(process.items)
  ) {
    return { ok: false, reason: 'forma_invalida' }
  }
  const picked = {}
  for (const key of ERP_DRAFT_PROCESS_KEYS) {
    const value = process[key]
    if (key in DRAFT_DEFAULTS) picked[key] = Array.isArray(value) ? value : DRAFT_DEFAULTS[key]
    else picked[key] = value === undefined || value === null ? '' : value
  }
  return { ok: true, process: picked }
}

// "3 processos: ALFA SEA 962-26 (PROC-1); ..." com no maximo 1500 caracteres;
// cortado, termina em " (+K)" (K = nomes omitidos).
export function formatErpCreationAuditTarget(created) {
  const list = Array.isArray(created) ? created.filter(isRecord) : []
  const head = `${formatProcessCount(list.length)}: `
  const parts = list.map((entry) => {
    const name = cleanCell(entry.name)
    const id = cleanCell(entry.id)
    return id === '' ? name : `${name} (${id})`
  })
  const full = `${head}${parts.join('; ')}`
  if (full.length <= MAX_AUDIT_TARGET_LENGTH) return full

  let text = head
  let included = 0
  for (let index = 0; index < parts.length; index += 1) {
    const candidate = index === 0 ? `${head}${parts[0]}` : `${text}; ${parts[index]}`
    const omitted = parts.length - (index + 1)
    const suffix = omitted > 0 ? ` (+${omitted})` : ''
    if (candidate.length + suffix.length > MAX_AUDIT_TARGET_LENGTH) break
    text = candidate
    included = index + 1
  }
  const omitted = parts.length - included
  if (included === 0) {
    const suffix = parts.length > 1 ? ` (+${parts.length - 1})` : ''
    return `${head}${parts[0]}`.slice(0, MAX_AUDIT_TARGET_LENGTH - suffix.length) + suffix
  }
  return `${text} (+${omitted})`
}
