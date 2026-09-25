import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore/lite'
import { firestore, isFirebaseConfigured } from '../lib/firebase'
import {
  canonicalizeCollectionStatus,
  canonicalizeProcessStatus,
  CD_EN_ROUTE_STATUS,
  isLogisticaEditableCollectionStatus,
  isPostCollectionStatus,
  processStatusOptions,
  postCollectionStatusOptions,
  shouldPreserveStockCollectionStatus,
} from '../features/processes/processStatus'
import { createAuditEvent } from './auditRepository'
import {
  deriveProcessStatus,
  resolveCargoReceivedAt,
  isCollectionReleased,
} from '../features/processes/deriveProcessStatus'
import { getEffectiveLicenses, normalizeLicenses } from '../features/processes/licenses'
import {
  EMPTY_CUSTOMS_CLEARANCE_FIELDS,
  hasArrivalSignal,
  hasCargoPresenceSignal,
  normalizeDateTimeLocal,
  normalizeMigratedApproxFields,
  sanitizeArrivalFields,
  sanitizeCustomsClearanceFields,
} from '../features/processes/arrivalCustoms'
import { normalizePostReceiptImages } from '../utils/postReceiptImages'
import {
  getCollectionWindows,
  normalizeCollectionWindows,
  serializeCollectionWindowsForFirestore,
} from '../utils/collectionWindows'
import { normalizeContainers, linkCollectionWindowsToContainers } from '../features/processes/containers'
import { normalizeReceiptDivergenceFields } from '../features/processes/receiptDivergence'
import {
  canSeePurchaseOrderDetails,
  getProcessPurchaseOrders,
  getPurchaseOrderSearchTerms,
  normalizeItemPoNumber,
} from '../features/processes/purchaseOrders'
import { isRestrictedCategory } from '../features/processes/processCategories'
import {
  INCOTERM_OPTIONS,
  itemsHaveDangerousGoods,
  normalizeDecimal,
  normalizeImoClass,
  normalizeInteger,
  normalizeItemDangerousGoods,
  normalizeUnNumber,
} from '../features/processes/operationalOptions'

const STORAGE_KEY = 'sq-comex-processes'
const RECEIVED_PROCESS_RETENTION_DAYS = 7

export const processCategoryOptions = ['FCL', 'LCL', 'AEREO', 'CONSOLIDADO']
export const duimpStatusOptions = [
  'Aguardando registro da DUIMP',
  'Aguardando parametrização da DUIMP',
  'Parametrizada',
]
export const channelOptions = ['Verde', 'Amarelo', 'Vermelho', 'Cinza']
export const collectionStatusOptions = [
  'Aguardando agendamento de coleta',
  'Coleta Agendada',
  CD_EN_ROUTE_STATUS,
  'Veículo no CD para descarga',
  ...postCollectionStatusOptions,
]
export const mapaStatusOptions = [
  'Aguardando MAPA',
  'Liberado',
  'Selecionado para Vistoria',
  'Vistoria agendada, aguardando realização',
  'Vistoria realizada, aguardando deferimento da LPCO',
  'LPCO deferida, MAPA liberado',
]
export const dtaStatusOptions = [
  'Aguardando registro',
  'Registrada, aguardando concessão pela RFB',
  'Concedida, aguardando programação de carregamento',
  'Carregamento Programado',
  'Chegada confirmada',
  'Trânsito concluído',
]

// F17.2c (D-3): `poNumber` so' entra na chave do item no CONSOLIDADO (senao
// o resumo de notificacao `JSON.stringify(items)` acusaria "itens vinculados
// atualizados" espurio no 1o save de todo processo).
function normalizeProcessItems(items, { category = '', purchaseOrders = [] } = {}) {
  if (!Array.isArray(items)) return []

  return items
    .map((item) => {
      const base = {
        id:
          typeof item?.id === 'string' && item.id.trim()
            ? item.id.trim()
            : `ITEM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        commercialName: String(item?.commercialName ?? item?.name ?? '').trim(),
        quantity: Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 0,
      }
      if (category === 'CONSOLIDADO') {
        base.poNumber = normalizeItemPoNumber(item?.poNumber, purchaseOrders)
      }
      // F17.2d-1 (D-3): carga perigosa POR ITEM - chaves esparsas (so' item
      // classificado ganha dangerousGoods/unNumber/imoClass).
      Object.assign(base, normalizeItemDangerousGoods(item))
      return base
    })
    .filter((item) => item.commercialName || item.quantity > 0)
}

function normalizeQuantity(value) {
  return Math.max(0, Number.parseInt(value ?? 0, 10) || 0)
}

function normalizeIsoDateTime(value) {
  const normalizedValue = String(value ?? '').trim()
  if (!normalizedValue) return ''
  const date = new Date(normalizedValue)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

function normalizeIsoDate(value) {
  const normalizedValue = String(value ?? '').trim()
  if (!normalizedValue) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    const date = new Date(`${normalizedValue}T00:00:00`)
    return Number.isNaN(date.getTime()) ? '' : normalizedValue
  }

  const date = new Date(normalizedValue)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function normalizeProcessStatus(status, duimpStatus = '') {
  const canonicalStatus = canonicalizeProcessStatus(status, duimpStatus)
  return processStatusOptions.includes(canonicalStatus)
    ? canonicalStatus
    : processStatusOptions[0]
}

const processSeed = [
  {
    id: 'PROC-001',
    name: 'Importacao Atlas',
    category: 'FCL',
    processNumber: 'FCL-2026-001',
    destination: 'Hamburg',
    etd: '2026-03-08',
    eta: '2026-03-18',
    etaOriginal: '2026-03-18',
    berthed: false,
    arrived: false,
    cargoPresenceInformed: false,
    duimpStatus: '',
    parameterizationChannel: '',
    collectionStatus: '',
    collectionScheduledAt: '',
    mapaStatus: '',
    mapaInspectionScheduledAt: '',
    dtaStatus: '',
    dtaLoadingScheduledAt: '',
    dtaArrivalAtItajai: '',
    updatedAt: new Date().toISOString(),
    processStatus: 'Aguardando Embarque',
    containerQuantity: 1,
    palletQuantity: 12,
    processNotes: '',
    warehouseDeliveryDateOverride: '',
    postReceiptNotes: '',
    postReceiptImages: [],
    cargoReceivedAt: '',
    items: [
      { id: 'ITEM-001', commercialName: 'Resina Atlas', quantity: 1200 },
      { id: 'ITEM-002', commercialName: 'Aditivo Alfa', quantity: 300 },
    ],
  },
  {
    id: 'PROC-002',
    name: 'Embarque Boreal',
    category: 'LCL',
    processNumber: 'LCL-2026-014',
    destination: 'Miami',
    etd: '2026-03-05',
    eta: '2026-03-15',
    etaOriginal: '2026-03-13',
    berthed: false,
    arrived: false,
    cargoPresenceInformed: false,
    duimpStatus: '',
    parameterizationChannel: '',
    collectionStatus: '',
    collectionScheduledAt: '',
    mapaStatus: '',
    mapaInspectionScheduledAt: '',
    dtaStatus: '',
    dtaLoadingScheduledAt: '',
    dtaArrivalAtItajai: '',
    updatedAt: new Date().toISOString(),
    processStatus: 'Embarcou',
    containerQuantity: 0,
    palletQuantity: 8,
    processNotes: '',
    warehouseDeliveryDateOverride: '',
    postReceiptNotes: '',
    postReceiptImages: [],
    cargoReceivedAt: '',
    items: [{ id: 'ITEM-003', commercialName: 'Componente Boreal', quantity: 480 }],
  },
  {
    id: 'PROC-003',
    name: 'Consolidado Delta',
    category: 'CONSOLIDADO',
    processNumber: '',
    destination: 'Rotterdam',
    etd: '2026-03-11',
    eta: '2026-03-22',
    etaOriginal: '2026-03-22',
    berthed: false,
    arrived: false,
    cargoPresenceInformed: false,
    duimpStatus: '',
    parameterizationChannel: '',
    collectionStatus: '',
    collectionScheduledAt: '',
    mapaStatus: '',
    mapaInspectionScheduledAt: '',
    dtaStatus: '',
    dtaLoadingScheduledAt: '',
    dtaArrivalAtItajai: '',
    updatedAt: new Date().toISOString(),
    processStatus: 'Aguardando atracação',
    containerQuantity: 2,
    palletQuantity: 0,
    processNotes: '',
    warehouseDeliveryDateOverride: '',
    postReceiptNotes: '',
    postReceiptImages: [],
    cargoReceivedAt: '',
    items: [{ id: 'ITEM-004', commercialName: 'Carga Consolidada Delta', quantity: 2 }],
  },
]

async function recordProcessAudit(event) {
  try {
    await createAuditEvent(event)
  } catch (error) {
    console.error('Falha ao registrar auditoria de processo.', error)
  }
}

function isMaritimeCategory(category) {
  return category === 'FCL' || category === 'LCL' || category === 'CONSOLIDADO'
}

function isAirCategory(category) {
  return category === 'AEREO'
}

function normalizeCollectionStatus(status) {
  return String(status ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function keepsCollectionSchedule(status) {
  const normalizedStatus = normalizeCollectionStatus(status)
  return (
    normalizedStatus === 'coleta agendada' ||
    normalizedStatus === 'veiculo no cd para descarga' ||
    isPostCollectionStatus(status) ||
    normalizedStatus === 'carga a caminho do cd' ||
    normalizedStatus === 'carga recebida'
  )
}

function normalizeDtaStatus(status) {
  return String(status ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function canonicalizeDtaStatus(status) {
  const normalizedStatus = normalizeDtaStatus(status)

  if (normalizedStatus === 'transito concluido') return 'Trânsito concluído'
  if (normalizedStatus === 'carregamento programado') return 'Carregamento Programado'
  if (normalizedStatus === 'chegada confirmada') return 'Chegada confirmada'
  if (normalizedStatus === 'concedida, aguardando programacao de carregamento') {
    return 'Concedida, aguardando programação de carregamento'
  }
  if (normalizedStatus === 'registrada, aguardando concessao pela rfb') {
    return 'Registrada, aguardando concessão pela RFB'
  }
  if (normalizedStatus === 'aguardando registro') return 'Aguardando registro'

  return String(status ?? '')
}

function normalizeDestination(value) {
  return String(value ?? '').trim().toUpperCase()
}

// F17.2b (D-4): o gate de coleta usa `isCollectionReleased` (desembaraco +
// TODAS as anuencias deferidas, `licenses[]` via `./licenses.js`) - substitui
// a checagem privada de MAPA. `process.licenses` chega aqui JA normalizado
// (D-3, `normalizeProcess`/`toFirestorePayload` normalizam antes de chamar).
function sanitizeCustomsFlow(process) {
  // F17.3a (D-14): sinal compat (data OU bool legado) em vez de so' o bool -
  // doc com `cargoPresenceInformedAt` preenchido e `cargoPresenceInformed`
  // ausente/false (drift) continua reconhecido.
  const cargoPresenceInformed = hasCargoPresenceSignal(process)
  const cargoPresenceInformedAt = cargoPresenceInformed
    ? normalizeDateTimeLocal(process.cargoPresenceInformedAt)
    : ''
  // F17.3b (D-13): DUIMP completa (numero + datas), canal, conferencia,
  // exigencia e desembaraco (pre-preenchido no draft, D-4) - tudo derivado
  // por `sanitizeCustomsClearanceFields`.
  const customs = sanitizeCustomsClearanceFields({
    ...process,
    cargoPresenceInformed,
    cargoPresenceInformedAt,
  })
  const released = isCollectionReleased({
    category: process.category,
    ...customs,
    licenses: process.licenses,
  })
  const canonicalizedCollectionStatus = canonicalizeCollectionStatus(process.collectionStatus ?? '')
  const normalizedCollectionStatus = released ? canonicalizedCollectionStatus : ''
  const collectionWindows = released ? getCollectionWindows(process) : []
  const collectionScheduledAt = keepsCollectionSchedule(normalizedCollectionStatus)
    ? process.collectionScheduledAt ?? ''
    : ''

  return {
    cargoPresenceInformed,
    cargoPresenceInformedAt,
    ...customs,
    collectionStatus: normalizedCollectionStatus,
    collectionWindows,
    collectionScheduledAt,
  }
}

function normalizeIncoterm(value) {
  return INCOTERM_OPTIONS.includes(value) ? value : ''
}

// F17.2a (D-5): limpeza por categoria dos 22 campos novos, mesmo padrao de
// `sanitizeMapaFlow`. So' recebe os campos que le - o chamador espalha o
// resultado por cima do objeto normalizado.
// F17.2d-1 (D-5/D-7/D-8): carga perigosa POR ITEM deriva a flag/trio de
// processo (`itemsHaveDangerousGoods` chega ja calculado pelo chamador, com
// os itens normalizados - nao recalcular aqui pra nao gerar ids novos);
// legado de nivel-processo so' e' preservado enquanto nenhum item foi
// classificado. `transshipmentEtd` so' com transbordo. `volumeM3` passa a
// aceitar tambem FCL/CONSOLIDADO (cubagem opcional).
function sanitizeCargoAndTransitFields(process) {
  const category = process.category
  const isMaritime = isMaritimeCategory(category)
  const isAir = isAirCategory(category)
  const itemDangerous = Boolean(process.itemsHaveDangerousGoods)
  const legacyDangerous = !itemDangerous && Boolean(process.dangerousGoods)
  const dangerousGoods = itemDangerous || legacyDangerous
  const transshipment = Boolean(process.transshipment)

  return {
    // F17.2d-2 (D-4, Q1): fornecedor de nivel-processo sai do CONSOLIDADO -
    // o fornecedor passa a ser informado POR PO (`purchaseOrders[].supplierName`).
    supplierName: category === 'CONSOLIDADO' ? '' : String(process.supplierName ?? '').trim(),
    originLocation: String(process.originLocation ?? '').trim(),
    incoterm: normalizeIncoterm(process.incoterm),
    forwarderName: String(process.forwarderName ?? '').trim(),
    shippedAt: normalizeIsoDate(process.shippedAt),
    dangerousGoods,
    unNumber: legacyDangerous ? normalizeUnNumber(process.unNumber) : '',
    imoClass: legacyDangerous ? normalizeImoClass(process.imoClass) : '',
    transshipment,
    transshipmentPort: transshipment ? String(process.transshipmentPort ?? '').trim() : '',
    transshipmentEtd: transshipment ? normalizeIsoDate(process.transshipmentEtd) : '',
    vesselName: isMaritime ? String(process.vesselName ?? '').trim() : '',
    voyage: isMaritime ? String(process.voyage ?? '').trim() : '',
    masterBl: isMaritime ? String(process.masterBl ?? '').trim() : '',
    houseBl: isMaritime ? String(process.houseBl ?? '').trim() : '',
    flightNumber: isAir ? String(process.flightNumber ?? '').trim() : '',
    mawb: isAir ? String(process.mawb ?? '').trim() : '',
    hawb: isAir ? String(process.hawb ?? '').trim() : '',
    grossWeightKg:
      category === 'LCL' || isAir ? normalizeDecimal(process.grossWeightKg) : 0,
    volumeM3:
      category === 'LCL' || category === 'FCL' || category === 'CONSOLIDADO'
        ? normalizeDecimal(process.volumeM3)
        : 0,
    chargeableWeightKg: isAir ? normalizeDecimal(process.chargeableWeightKg) : 0,
    packagesQuantity: isAir ? normalizeInteger(process.packagesQuantity) : 0,
    containers: normalizeContainers(process.containers, {
      category,
      containerQuantity: process.containerQuantity,
      collectionWindows: process.collectionWindows,
    }),
  }
}

// F17.2b (D-3): `mapaStatus`/`mapaInspectionScheduledAt` nao sao mais
// propagados por esta funcao (aposentados - gravados vazios em toda
// categoria, `normalizeProcess`/`toFirestorePayload` cuidam disso). O gate
// de coleta usa `process.licenses` (JA normalizado pelo chamador).
function sanitizeOperationalFields(process) {
  if (isMaritimeCategory(process.category)) {
    // F17.3a (D-14): sinal compat (`berthedAt` OU `berthed` legado) em vez
    // do bool isolado.
    const berthed = hasArrivalSignal(process)

    if (!berthed) {
      return {
        berthed: false,
        arrived: false,
        cargoPresenceInformed: false,
        cargoPresenceInformedAt: '',
        ...EMPTY_CUSTOMS_CLEARANCE_FIELDS,
        collectionStatus: '',
        collectionWindows: [],
        collectionScheduledAt: '',
        dtaStatus: '',
        dtaLoadingScheduledAt: '',
        dtaArrivalAtItajai: '',
      }
    }

    return {
      berthed: true,
      arrived: false,
      dtaStatus: '',
      dtaLoadingScheduledAt: '',
      dtaArrivalAtItajai: '',
      ...sanitizeCustomsFlow(process),
    }
  }

  if (isAirCategory(process.category)) {
    const arrived = hasArrivalSignal(process)
    const dtaStatus = arrived ? canonicalizeDtaStatus(process.dtaStatus ?? '') : ''
    const dtaLoadingScheduledAt =
      normalizeDtaStatus(dtaStatus) === 'carregamento programado'
        ? process.dtaLoadingScheduledAt ?? ''
        : ''
    const dtaArrivalAtItajai =
      normalizeDtaStatus(dtaStatus) === 'carregamento programado'
        ? process.dtaArrivalAtItajai ?? ''
        : ''
    // F17.3a (D-5): presenca de carga no AEREO continua bloqueada ate a DTA
    // registrar "Trânsito concluído" - vale pro bool E pra data.
    const isTransitCompleted = normalizeDtaStatus(dtaStatus) === 'transito concluido'

    if (!arrived) {
      return {
        berthed: false,
        arrived: false,
        cargoPresenceInformed: false,
        cargoPresenceInformedAt: '',
        ...EMPTY_CUSTOMS_CLEARANCE_FIELDS,
        collectionStatus: '',
        collectionWindows: [],
        collectionScheduledAt: '',
        dtaStatus: '',
        dtaLoadingScheduledAt: '',
        dtaArrivalAtItajai: '',
      }
    }

    return {
      berthed: false,
      arrived: true,
      dtaStatus,
      dtaLoadingScheduledAt,
      dtaArrivalAtItajai,
      ...sanitizeCustomsFlow({
        ...process,
        cargoPresenceInformed: isTransitCompleted ? process.cargoPresenceInformed : false,
        cargoPresenceInformedAt: isTransitCompleted ? process.cargoPresenceInformedAt : '',
      }),
    }
  }

  return {
    berthed: false,
    arrived: false,
    cargoPresenceInformed: false,
    cargoPresenceInformedAt: '',
    ...EMPTY_CUSTOMS_CLEARANCE_FIELDS,
    collectionStatus: '',
    collectionWindows: [],
    collectionScheduledAt: '',
    dtaStatus: '',
    dtaLoadingScheduledAt: '',
    dtaArrivalAtItajai: '',
  }
}

function normalizeProcess(rawProcess, fallbackId) {
  const resolvedId =
    typeof rawProcess.id === 'string' && rawProcess.id.trim() ? rawProcess.id.trim() : fallbackId
  const category = processCategoryOptions.includes(rawProcess.category)
    ? rawProcess.category
    : 'FCL'
  const processNumber =
    category === 'CONSOLIDADO' ? '' : rawProcess.processNumber ?? rawProcess.code ?? ''
  // F17.2c (D-3): le o `processNumber` CRU (antes do '' forcado acima) - o
  // fallback de compat de leitura do D-1 precisa dele.
  const purchaseOrders = getProcessPurchaseOrders({ ...rawProcess, category })
  const eta = rawProcess.eta ?? ''
  // F17.2b (D-3): `licenses[]` e' AUTORITATIVO (compat de leitura MAPA por 1
  // release via `getEffectiveLicenses`) - normalizado ANTES do gate de
  // coleta (`sanitizeCustomsFlow`, dentro de `sanitizeOperationalFields`).
  const licenses = normalizeLicenses(getEffectiveLicenses(rawProcess))
  const operationalFields = sanitizeOperationalFields({
    category,
    berthed: rawProcess.berthed,
    arrived: rawProcess.arrived,
    berthedAt: rawProcess.berthedAt,
    arrivedAt: rawProcess.arrivedAt,
    cargoPresenceInformed: rawProcess.cargoPresenceInformed,
    cargoPresenceInformedAt: rawProcess.cargoPresenceInformedAt,
    duimpStatus: rawProcess.duimpStatus,
    parameterizationChannel: rawProcess.parameterizationChannel,
    clearanceCompletedAt: rawProcess.clearanceCompletedAt,
    // F17.3b (D-13): DUIMP completa (numero + datas), conferencia, exigencia.
    duimpNumber: rawProcess.duimpNumber,
    duimpRegisteredAt: rawProcess.duimpRegisteredAt,
    parameterizedAt: rawProcess.parameterizedAt,
    customsInspectionScheduledAt: rawProcess.customsInspectionScheduledAt,
    customsRequirement: rawProcess.customsRequirement,
    customsRequirementNotes: rawProcess.customsRequirementNotes,
    collectionStatus: rawProcess.collectionStatus,
    collectionScheduledAt: rawProcess.collectionScheduledAt,
    collectionWindows: rawProcess.collectionWindows,
    containerQuantity: rawProcess.containerQuantity,
    licenses,
    dtaStatus: rawProcess.dtaStatus,
    dtaLoadingScheduledAt: rawProcess.dtaLoadingScheduledAt,
    dtaArrivalAtItajai: rawProcess.dtaArrivalAtItajai,
  })

  if (!operationalFields.collectionStatus && shouldPreserveStockCollectionStatus(rawProcess)) {
    operationalFields.collectionStatus = postCollectionStatusOptions[2]
  }

  // F17.3a (D-14): CE/terminal/free time/marcador de aproximacao - FORA da
  // cascata de coleta (D-5), calculados a partir dos campos crus.
  const arrivalFields = sanitizeArrivalFields({
    category,
    berthedAt: rawProcess.berthedAt,
    arrivedAt: rawProcess.arrivedAt,
    berthed: rawProcess.berthed,
    arrived: rawProcess.arrived,
    ceMercante: rawProcess.ceMercante,
    ceHouse: rawProcess.ceHouse,
    terminalName: rawProcess.terminalName,
    freeTimeDays: rawProcess.freeTimeDays,
    demurrageDailyRateUsd: rawProcess.demurrageDailyRateUsd,
    migratedApproxFields: rawProcess.migratedApproxFields,
  })

  // F17.2d-1 (D-4/D-5): itens normalizados UMA vez so' (ids aleatorios -
  // chamar `normalizeProcessItems` 2x geraria "itens vinculados
  // atualizados" espurio); reutilizados em `items` (l.626) e na derivacao
  // da flag de carga perigosa do processo.
  const items = normalizeProcessItems(rawProcess.items, { category, purchaseOrders })

  // F17.2a (D-5): limpeza por categoria dos 22 campos novos.
  const cargoAndTransitFields = sanitizeCargoAndTransitFields({
    category,
    dangerousGoods: rawProcess.dangerousGoods,
    itemsHaveDangerousGoods: itemsHaveDangerousGoods(items),
    transshipment: rawProcess.transshipment,
    transshipmentEtd: rawProcess.transshipmentEtd,
    supplierName: rawProcess.supplierName,
    originLocation: rawProcess.originLocation,
    incoterm: rawProcess.incoterm,
    forwarderName: rawProcess.forwarderName,
    shippedAt: rawProcess.shippedAt,
    unNumber: rawProcess.unNumber,
    imoClass: rawProcess.imoClass,
    transshipmentPort: rawProcess.transshipmentPort,
    vesselName: rawProcess.vesselName,
    voyage: rawProcess.voyage,
    masterBl: rawProcess.masterBl,
    houseBl: rawProcess.houseBl,
    flightNumber: rawProcess.flightNumber,
    mawb: rawProcess.mawb,
    hawb: rawProcess.hawb,
    grossWeightKg: rawProcess.grossWeightKg,
    volumeM3: rawProcess.volumeM3,
    chargeableWeightKg: rawProcess.chargeableWeightKg,
    packagesQuantity: rawProcess.packagesQuantity,
    containers: rawProcess.containers,
    containerQuantity: rawProcess.containerQuantity,
    collectionWindows: rawProcess.collectionWindows,
  })

  // F17.2c (D-6): liga `collectionWindows[].containerId` a `containers[]`
  // ja' normalizado (sincroniza/backfill/preserva orfa).
  const collectionWindows = linkCollectionWindowsToContainers(
    operationalFields.collectionWindows,
    cargoAndTransitFields.containers,
    category
  )

  // F17.2a (D-4): FCL/CONSOLIDADO derivam `containerQuantity` do tamanho de
  // `containers[]` (ja' com a expansao lazy aplicada); LCL/AEREO mantem o
  // valor manual (nao exibido).
  const containerQuantity =
    category === 'FCL' || category === 'CONSOLIDADO'
      ? cargoAndTransitFields.containers.length
      : normalizeQuantity(rawProcess.containerQuantity)

  return {
    id: resolvedId,
    name: rawProcess.name ?? rawProcess.client ?? '',
    category,
    processNumber,
    destination: normalizeDestination(rawProcess.destination),
    etd: rawProcess.etd ?? '',
    eta,
    etaOriginal: rawProcess.etaOriginal ?? eta,
    processStatus: normalizeProcessStatus(rawProcess.processStatus, operationalFields.duimpStatus),
    containerQuantity,
    palletQuantity: normalizeQuantity(rawProcess.palletQuantity),
    processNotes: String(rawProcess.processNotes ?? '').trim(),
    carrierName: String(rawProcess.carrierName ?? '').trim(),
    ...cargoAndTransitFields,
    warehouseDeliveryDateOverride: normalizeIsoDate(rawProcess.warehouseDeliveryDateOverride),
    postReceiptNotes: String(rawProcess.postReceiptNotes ?? '').trim(),
    postReceiptImages: normalizePostReceiptImages(rawProcess.postReceiptImages),
    cargoReceivedAt: normalizeIsoDateTime(rawProcess.cargoReceivedAt),
    items,
    ...operationalFields,
    ...arrivalFields,
    migratedApproxFields: normalizeMigratedApproxFields(rawProcess.migratedApproxFields, arrivalFields),
    collectionWindows,
    purchaseOrders,
    licenses,
    // F17.2b (D-3): aposentados - gravados vazios em toda categoria, mantidos
    // so' pela compat de leitura de 1 release (`getEffectiveLicenses`).
    mapaStatus: '',
    mapaInspectionScheduledAt: '',
    // F16.8 (swipe-to-arquivar, admin-only): aditivo — processos sem o
    // campo (todo o histórico anterior) normalizam pra archived:false.
    archived: Boolean(rawProcess.archived),
    archivedAt: normalizeIsoDateTime(rawProcess.archivedAt),
    archivedBy: String(rawProcess.archivedBy ?? '').trim(),
    // F17.4b (B-2/B-1): divergencia no recebimento (logistica + admin).
    ...normalizeReceiptDivergenceFields(rawProcess),
    updatedAt: rawProcess.updatedAt ?? new Date().toISOString(),
  }
}

function readLocalProcesses() {
  const storedProcesses = window.localStorage.getItem(STORAGE_KEY)

  if (!storedProcesses) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(processSeed))
    return processSeed
  }

  try {
    return JSON.parse(storedProcesses)
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(processSeed))
    return processSeed
  }
}

function writeLocalProcesses(processes) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(processes))
}

function sortProcesses(processes) {
  return [...processes].sort((left, right) => {
    const leftTime = new Date(left.updatedAt ?? 0).getTime()
    const rightTime = new Date(right.updatedAt ?? 0).getTime()
    return rightTime - leftTime
  })
}

function isExpiredReceivedProcess(process) {
  const receivedAt =
    normalizeIsoDateTime(process?.cargoReceivedAt) ||
    (normalizeProcessStatus(process?.processStatus) === 'Carga recebida'
      ? normalizeIsoDateTime(process?.updatedAt)
      : '')
  if (!receivedAt) return false

  const expiresAt =
    new Date(receivedAt).getTime() + RECEIVED_PROCESS_RETENTION_DAYS * 24 * 60 * 60 * 1000

  return Date.now() >= expiresAt
}

function toFirestorePayload(process) {
  const category = processCategoryOptions.includes(process.category) ? process.category : 'FCL'
  // F17.2c (D-3): payload FIXO (lista vazia fora do CONSOLIDADO) - por isso
  // a allowlist/guarda (D-8).
  const purchaseOrders = getProcessPurchaseOrders({ ...process, category })
  // F17.2d-1 (D-4/D-5): itens normalizados UMA vez so' (ids aleatorios -
  // chamar `normalizeProcessItems` 2x geraria "itens vinculados
  // atualizados" espurio); reutilizados abaixo e na derivacao da flag de
  // carga perigosa do processo.
  const items = normalizeProcessItems(process.items, { category, purchaseOrders })
  // F17.2a (D-5): mesma limpeza por categoria de `normalizeProcess` - o
  // payload grava os 22 campos SEMPRE (por isso entram todos na allowlist
  // de create/update).
  const cargoAndTransitFields = sanitizeCargoAndTransitFields({
    category,
    dangerousGoods: process.dangerousGoods,
    itemsHaveDangerousGoods: itemsHaveDangerousGoods(items),
    transshipment: process.transshipment,
    transshipmentEtd: process.transshipmentEtd,
    supplierName: process.supplierName,
    originLocation: process.originLocation,
    incoterm: process.incoterm,
    forwarderName: process.forwarderName,
    shippedAt: process.shippedAt,
    unNumber: process.unNumber,
    imoClass: process.imoClass,
    transshipmentPort: process.transshipmentPort,
    vesselName: process.vesselName,
    voyage: process.voyage,
    masterBl: process.masterBl,
    houseBl: process.houseBl,
    flightNumber: process.flightNumber,
    mawb: process.mawb,
    hawb: process.hawb,
    grossWeightKg: process.grossWeightKg,
    volumeM3: process.volumeM3,
    chargeableWeightKg: process.chargeableWeightKg,
    packagesQuantity: process.packagesQuantity,
    containers: process.containers,
    containerQuantity: process.containerQuantity,
    collectionWindows: process.collectionWindows,
  })
  const containerQuantity =
    category === 'FCL' || category === 'CONSOLIDADO'
      ? cargoAndTransitFields.containers.length
      : normalizeQuantity(process.containerQuantity)
  // F17.3a (D-14): payload FIXO das 9 chaves novas - por isso a allowlist
  // (D-9). `process` aqui ja' e' o `nextProcess` normalizado (via
  // `normalizeProcess`, chamado em `saveProcess`).
  const arrivalFields = sanitizeArrivalFields(process)

  return {
    name: String(process.name ?? ''),
    category,
    processNumber: process.category === 'CONSOLIDADO' ? '' : String(process.processNumber ?? ''),
    purchaseOrders,
    destination: normalizeDestination(process.destination),
    etd: String(process.etd ?? ''),
    eta: String(process.eta ?? ''),
    etaOriginal: String(process.etaOriginal || process.eta || ''),
    processStatus: normalizeProcessStatus(process.processStatus, process.duimpStatus),
    containerQuantity,
    palletQuantity: normalizeQuantity(process.palletQuantity),
    processNotes: String(process.processNotes ?? '').trim(),
    carrierName: String(process.carrierName ?? '').trim(),
    warehouseDeliveryDateOverride: normalizeIsoDate(process.warehouseDeliveryDateOverride),
    postReceiptNotes: String(process.postReceiptNotes ?? '').trim(),
    postReceiptImages: normalizePostReceiptImages(process.postReceiptImages),
    cargoReceivedAt: normalizeIsoDateTime(process.cargoReceivedAt),
    items,
    berthed: Boolean(process.berthed),
    arrived: Boolean(process.arrived),
    berthedAt: arrivalFields.berthedAt,
    arrivedAt: arrivalFields.arrivedAt,
    ceMercante: arrivalFields.ceMercante,
    ceHouse: arrivalFields.ceHouse,
    terminalName: arrivalFields.terminalName,
    freeTimeDays: arrivalFields.freeTimeDays,
    demurrageDailyRateUsd: arrivalFields.demurrageDailyRateUsd,
    migratedApproxFields: arrivalFields.migratedApproxFields,
    cargoPresenceInformed: Boolean(process.cargoPresenceInformed),
    cargoPresenceInformedAt: normalizeDateTimeLocal(process.cargoPresenceInformedAt),
    duimpStatus: String(process.duimpStatus ?? ''),
    parameterizationChannel: String(process.parameterizationChannel ?? ''),
    clearanceCompletedAt: String(process.clearanceCompletedAt ?? ''),
    // F17.3b (D-13): payload FIXO das 6 chaves novas - por isso a allowlist
    // (D-9).
    duimpNumber: String(process.duimpNumber ?? '').trim(),
    duimpRegisteredAt: normalizeDateTimeLocal(process.duimpRegisteredAt),
    parameterizedAt: normalizeDateTimeLocal(process.parameterizedAt),
    customsInspectionScheduledAt: normalizeDateTimeLocal(process.customsInspectionScheduledAt),
    customsRequirement: Boolean(process.customsRequirement),
    customsRequirementNotes: String(process.customsRequirementNotes ?? '').trim(),
    collectionStatus: String(process.collectionStatus ?? ''),
    collectionScheduledAt: String(process.collectionScheduledAt ?? ''),
    collectionWindows: serializeCollectionWindowsForFirestore(
      normalizeCollectionWindows(process.collectionWindows, {
        legacyScheduledAt: process.collectionScheduledAt,
        containerQuantity: process.containerQuantity,
      })
    ),
    // F17.2b (D-3): `licenses[]` e' o payload autoritativo. `mapaStatus`/
    // `mapaInspectionScheduledAt` continuam gravados vazios nesta release
    // (allowlist/leitura ainda os esperam - D-12; remocao na release seguinte).
    licenses: normalizeLicenses(getEffectiveLicenses(process)),
    mapaStatus: '',
    mapaInspectionScheduledAt: '',
    dtaStatus: canonicalizeDtaStatus(process.dtaStatus ?? ''),
    dtaLoadingScheduledAt: String(process.dtaLoadingScheduledAt ?? ''),
    dtaArrivalAtItajai: String(process.dtaArrivalAtItajai ?? ''),
    ...cargoAndTransitFields,
    // F17.4b (B-2/B-1): payload FIXO das 3 chaves - por isso entram na
    // allowlist admin (B-3). Logistica grava so quando post-recebimento.
    ...normalizeReceiptDivergenceFields(process),
    updatedById: String(process.updatedById ?? '').trim(),
    updatedByName: String(process.updatedByName ?? '').trim(),
    updatedAt: serverTimestamp(),
  }
}

export async function listProcesses() {
  if (!isFirebaseConfigured || !firestore) {
    return sortProcesses(readLocalProcesses().map((item) => normalizeProcess(item))).filter(
      (item) => !isExpiredReceivedProcess(item)
    )
  }

  const processesQuery = query(collection(firestore, 'processes'), orderBy('updatedAt', 'desc'))
  const snapshot = await getDocs(processesQuery)

  return snapshot.docs
    .map((item) => {
      const data = item.data()

      return normalizeProcess(
        {
          ...data,
          updatedAt:
            typeof data.updatedAt?.toDate === 'function'
              ? data.updatedAt.toDate().toISOString()
              : data.updatedAt,
          cargoReceivedAt:
            typeof data.cargoReceivedAt?.toDate === 'function'
              ? data.cargoReceivedAt.toDate().toISOString()
              : data.cargoReceivedAt,
          archivedAt:
            typeof data.archivedAt?.toDate === 'function'
              ? data.archivedAt.toDate().toISOString()
              : data.archivedAt,
        },
        item.id
      )
    })
    .filter((item) => !isExpiredReceivedProcess(item))
}

export async function saveProcess(process, actor = null) {
  const normalizedProcess = normalizeProcess(process, process.id || `PROC-${Date.now()}`)
  const now = new Date().toISOString()
  // F17.1a (D-C): a derivacao roda so na escrita, sobre o processo ja
  // normalizado/sanitizado. `normalizeProcessStatus` continua aplicado por
  // cima como guarda (garante que o valor gravado pertence a
  // `processStatusOptions`).
  const derivedStatus = deriveProcessStatus(normalizedProcess)
  const nextProcess = {
    ...normalizedProcess,
    id: String(normalizedProcess.id ?? '').trim() || `PROC-${Date.now()}`,
    processNumber:
      normalizedProcess.category === 'CONSOLIDADO' ? '' : normalizedProcess.processNumber,
    etaOriginal: normalizedProcess.etaOriginal || normalizedProcess.eta,
    processStatus: normalizeProcessStatus(derivedStatus, normalizedProcess.duimpStatus),
    dtaStatus: canonicalizeDtaStatus(normalizedProcess.dtaStatus),
    cargoReceivedAt: resolveCargoReceivedAt(derivedStatus, normalizedProcess.cargoReceivedAt, now),
    updatedById: String(actor?.uid ?? actor?.id ?? '').trim(),
    updatedByName: String(actor?.name ?? actor?.email ?? '').trim(),
    updatedAt: now,
  }

  if (!isFirebaseConfigured || !firestore) {
    const currentProcesses = readLocalProcesses().map((item) => normalizeProcess(item))
    const existingIndex = currentProcesses.findIndex((item) => item.id === nextProcess.id)

    if (existingIndex >= 0) {
      currentProcesses[existingIndex] = nextProcess
    } else {
      currentProcesses.unshift(nextProcess)
    }

    writeLocalProcesses(sortProcesses(currentProcesses))
    await recordProcessAudit({
      action: existingIndex >= 0 ? 'Processo atualizado' : 'Processo criado',
      actor: actor?.name ?? actor?.email ?? 'Sistema local',
      target: nextProcess.id,
    })
    return nextProcess
  }

  await setDoc(doc(firestore, 'processes', nextProcess.id), toFirestorePayload(nextProcess), {
    merge: true,
  })

  await recordProcessAudit({
    action: process.id ? 'Processo atualizado' : 'Processo criado',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: nextProcess.id,
  })

  return nextProcess
}

export async function saveProcessCollectionStatus(
  processId,
  collectionStatus,
  actor = null,
  currentProcess = null,
  receiptDivergenceFields = null
) {
  const normalizedId = String(processId ?? '').trim()
  const normalizedStatus = canonicalizeCollectionStatus(String(collectionStatus ?? '').trim())
  const now = new Date().toISOString()

  if (!normalizedId) {
    throw new Error('Processo inválido para atualizar o status de coleta.')
  }

  // Bug reportado pelo Lucas (2026-07-21): esta validação checava só os 3
  // valores de postCollectionStatusOptions, mas a tela de edição
  // (CollectionStatusEditView) também libera "Carga a caminho do CD",
  // "Veículo no CD para descarga" e "Carga recebida" via
  // isLogisticaEditableCollectionStatus — logística conseguia selecionar e
  // clicar Salvar num valor que o repo então rejeitava. Usar a mesma função
  // que já gate-a o botão Salvar na tela, pra allowlist ficar em UM lugar só.
  if (!isLogisticaEditableCollectionStatus(normalizedStatus)) {
    throw new Error('Status de coleta inválido para atualização logística.')
  }

  if (!isFirebaseConfigured || !firestore) {
    const currentProcesses = readLocalProcesses().map((item) => normalizeProcess(item))
    const existingIndex = currentProcesses.findIndex((item) => item.id === normalizedId)

    if (existingIndex < 0) {
      throw new Error('Processo não encontrado para atualizar o status de coleta.')
    }

    const existingProcess = currentProcesses[existingIndex]

    if (!existingProcess.collectionScheduledAt || !keepsCollectionSchedule(existingProcess.collectionStatus)) {
      throw new Error('O status de coleta só pode ser atualizado após a coleta agendada.')
    }

    // F17.1a (D-C): deriva `processStatus`/`cargoReceivedAt` sobre o
    // processo com o `collectionStatus` novo aplicado. So grava quando o
    // derivado for um dos 2 valores que a logistica pode gravar (D-F) - caso
    // contrario (dado inconsistente) mantem so o `collectionStatus`.
    const base = currentProcess ?? existingProcess
    const derived = deriveProcessStatus({ ...base, collectionStatus: normalizedStatus })
    const derivedFields =
      derived === 'Coleta Agendada' || derived === 'Carga recebida'
        ? {
            processStatus: derived,
            cargoReceivedAt: resolveCargoReceivedAt(derived, base.cargoReceivedAt, now),
          }
        : {}

    // F17.4b (B-2): divergencia no recebimento so' entra no payload quando
    // informada E o status escolhido e' pos-recebimento.
    const divergenceFields =
      receiptDivergenceFields != null && isPostCollectionStatus(normalizedStatus)
        ? normalizeReceiptDivergenceFields(receiptDivergenceFields)
        : {}

    const nextProcess = {
      ...existingProcess,
      collectionStatus: normalizedStatus,
      ...derivedFields,
      ...divergenceFields,
      updatedById: String(actor?.uid ?? actor?.id ?? '').trim(),
      updatedByName: String(actor?.name ?? actor?.email ?? '').trim(),
      updatedAt: now,
    }

    currentProcesses[existingIndex] = nextProcess
    writeLocalProcesses(sortProcesses(currentProcesses))
    await recordProcessAudit({
      action: 'Status de coleta atualizado',
      actor: actor?.name ?? actor?.email ?? 'Sistema local',
      target: nextProcess.id,
    })
    return nextProcess
  }

  const updatePayload = {
    collectionStatus: normalizedStatus,
    updatedById: String(actor?.uid ?? actor?.id ?? '').trim(),
    updatedByName: String(actor?.name ?? actor?.email ?? '').trim(),
    updatedAt: serverTimestamp(),
  }

  let derivedFields = {}
  if (currentProcess) {
    const derived = deriveProcessStatus({ ...currentProcess, collectionStatus: normalizedStatus })
    if (derived === 'Coleta Agendada' || derived === 'Carga recebida') {
      derivedFields = {
        processStatus: derived,
        cargoReceivedAt: resolveCargoReceivedAt(derived, currentProcess.cargoReceivedAt, now),
      }
      updatePayload.processStatus = derivedFields.processStatus
      updatePayload.cargoReceivedAt = derivedFields.cargoReceivedAt
    }
  }

  // F17.4b (B-2): divergencia no recebimento so' entra no payload quando
  // informada E o status escolhido e' pos-recebimento.
  const divergenceFields =
    receiptDivergenceFields != null && isPostCollectionStatus(normalizedStatus)
      ? normalizeReceiptDivergenceFields(receiptDivergenceFields)
      : {}
  Object.assign(updatePayload, divergenceFields)

  await updateDoc(doc(firestore, 'processes', normalizedId), updatePayload)

  await recordProcessAudit({
    action: 'Status de coleta atualizado',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: normalizedId,
  })

  return {
    id: normalizedId,
    collectionStatus: normalizedStatus,
    ...derivedFields,
    ...divergenceFields,
    updatedById: String(actor?.uid ?? actor?.id ?? '').trim(),
    updatedByName: String(actor?.name ?? actor?.email ?? '').trim(),
    updatedAt: now,
  }
}

// F16.8 (swipe-to-arquivar, admin-only): arquivar é reversível — some da
// lista (seções Em andamento/Concluídos) sem apagar o registro; a seção
// "Arquivados" (admin) permite restaurar. Update estreito, mesmo padrão de
// saveProcessCollectionStatus. A regra do Firestore restringe archived/
// archivedAt/archivedBy ao isAdmin() via isAdminProcessFields().
export async function archiveProcess(processId, archived, actor = null) {
  const normalizedId = String(processId ?? '').trim()
  const now = new Date().toISOString()

  if (!normalizedId) {
    throw new Error('Processo inválido para arquivar.')
  }

  const actorName = String(actor?.name ?? actor?.email ?? '').trim()

  if (!isFirebaseConfigured || !firestore) {
    const currentProcesses = readLocalProcesses().map((item) => normalizeProcess(item))
    const existingIndex = currentProcesses.findIndex((item) => item.id === normalizedId)

    if (existingIndex < 0) {
      throw new Error('Processo não encontrado para arquivar.')
    }

    const nextProcess = {
      ...currentProcesses[existingIndex],
      archived: Boolean(archived),
      archivedAt: archived ? now : '',
      archivedBy: archived ? actorName : '',
      updatedById: String(actor?.uid ?? actor?.id ?? '').trim(),
      updatedByName: actorName,
      updatedAt: now,
    }

    currentProcesses[existingIndex] = nextProcess
    writeLocalProcesses(sortProcesses(currentProcesses))
    await recordProcessAudit({
      action: archived ? 'Processo arquivado' : 'Processo restaurado',
      actor: actorName || 'Sistema local',
      target: nextProcess.id,
    })
    return nextProcess
  }

  await updateDoc(doc(firestore, 'processes', normalizedId), {
    archived: Boolean(archived),
    archivedAt: archived ? serverTimestamp() : null,
    archivedBy: archived ? actorName : '',
    updatedById: String(actor?.uid ?? actor?.id ?? '').trim(),
    updatedByName: actorName,
    updatedAt: serverTimestamp(),
  })

  await recordProcessAudit({
    action: archived ? 'Processo arquivado' : 'Processo restaurado',
    actor: actorName || 'Sistema',
    target: normalizedId,
  })

  return {
    id: normalizedId,
    archived: Boolean(archived),
    archivedAt: archived ? now : '',
    archivedBy: archived ? actorName : '',
  }
}

export async function saveProcessPostReceiptNotes(
  processId,
  postReceiptNotes,
  postReceiptImages = [],
  actor = null
) {
  const normalizedId = String(processId ?? '').trim()
  const normalizedNotes = String(postReceiptNotes ?? '').trim()
  const normalizedImages = normalizePostReceiptImages(postReceiptImages)
  const now = new Date().toISOString()

  if (!normalizedId) {
    throw new Error('Processo inválido para atualizar as observações de CD.')
  }

  if (!isFirebaseConfigured || !firestore) {
    const currentProcesses = readLocalProcesses().map((item) => normalizeProcess(item))
    const existingIndex = currentProcesses.findIndex((item) => item.id === normalizedId)

    if (existingIndex < 0) {
      throw new Error('Processo não encontrado para atualizar as observações de CD.')
    }

    const nextProcess = {
      ...currentProcesses[existingIndex],
      postReceiptNotes: normalizedNotes,
      postReceiptImages: normalizedImages,
      updatedById: String(actor?.uid ?? actor?.id ?? '').trim(),
      updatedByName: String(actor?.name ?? actor?.email ?? '').trim(),
      updatedAt: now,
    }

    currentProcesses[existingIndex] = nextProcess
    writeLocalProcesses(sortProcesses(currentProcesses))

    await recordProcessAudit({
      action: 'Observações de CD atualizadas',
      actor: actor?.name ?? actor?.email ?? 'Sistema local',
      target: normalizedId,
    })

    return nextProcess
  }

  await updateDoc(doc(firestore, 'processes', normalizedId), {
    postReceiptNotes: normalizedNotes,
    postReceiptImages: normalizedImages,
    updatedById: String(actor?.uid ?? actor?.id ?? '').trim(),
    updatedByName: String(actor?.name ?? actor?.email ?? '').trim(),
    updatedAt: serverTimestamp(),
  })

  await recordProcessAudit({
    action: 'Observações de CD atualizadas',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: normalizedId,
  })

  const refreshedProcess = (await listProcesses()).find((item) => item.id === normalizedId)
  return refreshedProcess ?? {
    id: normalizedId,
    postReceiptNotes: normalizedNotes,
    postReceiptImages: normalizedImages,
    updatedById: String(actor?.uid ?? actor?.id ?? '').trim(),
    updatedByName: String(actor?.name ?? actor?.email ?? '').trim(),
    updatedAt: now,
  }
}

export async function deleteProcess(processId, actor = null) {
  if (!isFirebaseConfigured || !firestore) {
    const nextProcesses = readLocalProcesses()
      .map((item) => normalizeProcess(item))
      .filter((item) => item.id !== processId)
    writeLocalProcesses(nextProcesses)
    await recordProcessAudit({
      action: 'Processo removido',
      actor: actor?.name ?? actor?.email ?? 'Sistema local',
      target: processId,
    })
    return
  }

  await deleteDoc(doc(firestore, 'processes', processId))
  await recordProcessAudit({
    action: 'Processo removido',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: processId,
  })
}

// Busca processos (Sprint 18.0): filtra localmente em
// name/destination/processNumber/purchaseOrders/items. Limita a 8 resultados
// pra nao pesar o command palette.
//
// F17.2d-2 (D-6/AD-1): `canSeeName` mascara o `name` de categoria restrita
// (`isRestrictedCategory`) e a referencia/fornecedor de cada PO do
// CONSOLIDADO (`getPurchaseOrderSearchTerms`) - o rotulo ja saia mascarado,
// mas o MATCH da busca vazava (`user` achava FCL/LCL/AEREO pelo nome).
export async function searchProcesses(rawQuery, { canSeeName = false } = {}) {
  const q = String(rawQuery ?? '').trim().toLowerCase()
  if (q.length < 2) return []

  const all = await listProcesses()
  const canSeeDetails = canSeePurchaseOrderDetails(canSeeName)
  const matches = all.filter((process) => {
    const showName = canSeeName || !isRestrictedCategory(process.category)
    const haystack = [
      showName ? process.name ?? '' : '',
      process.destination ?? '',
      process.processNumber ?? '',
      process.category ?? '',
      process.channel ?? '',
      process.responsibleName ?? '',
      ...getPurchaseOrderSearchTerms(process.purchaseOrders, canSeeDetails),
      ...(Array.isArray(process.items)
        ? process.items.flatMap((item) => [
            item.commercialName ?? '',
            item.poNumber ?? '',
            item.supplierName ?? '',
          ])
        : []),
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })

  return matches.slice(0, 8)
}
