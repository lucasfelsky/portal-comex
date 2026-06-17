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
  canonicalizeProcessStatus,
  CD_EN_ROUTE_STATUS,
  isPostCollectionStatus,
  processStatusOptions,
  postCollectionStatusOptions,
} from '../features/processes/processStatus'
import { createAuditEvent } from './auditRepository'
import { normalizePostReceiptImages } from '../utils/postReceiptImages'
import {
  getCollectionWindows,
  normalizeCollectionWindows,
  serializeCollectionWindowsForFirestore,
} from '../utils/collectionWindows'

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
  'Aguardando liberação no Terminal',
  'Aguardando agendamento',
  'Coleta Agendada',
  ...postCollectionStatusOptions,
  CD_EN_ROUTE_STATUS,
  'Veículo no CD para descarga',
  'Carga recebida',
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

function normalizeProcessItems(items) {
  if (!Array.isArray(items)) return []

  return items
    .map((item) => ({
      id:
        typeof item?.id === 'string' && item.id.trim()
          ? item.id.trim()
          : `ITEM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      commercialName: String(item?.commercialName ?? item?.name ?? '').trim(),
      quantity: Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 0,
    }))
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

function normalizeComparableText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function normalizeProcessStatus(status, duimpStatus = '') {
  const canonicalStatus = canonicalizeProcessStatus(status, duimpStatus)
  return processStatusOptions.includes(canonicalStatus)
    ? canonicalStatus
    : processStatusOptions[0]
}

function canonicalizeDuimpStatus(status) {
  const normalizedStatus = normalizeComparableText(status)

  if (!normalizedStatus) return ''
  if (
    normalizedStatus === 'aguardando registro' ||
    normalizedStatus === 'aguardando registro da duimp'
  ) {
    return 'Aguardando registro da DUIMP'
  }
  if (
    normalizedStatus === 'registrada, aguardando parametrizacao' ||
    normalizedStatus === 'aguardando parametrizacao da duimp'
  ) {
    return 'Aguardando parametrização da DUIMP'
  }
  if (normalizedStatus === 'parametrizada') return 'Parametrizada'

  return ''
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

function mapaAllowsCollection(status) {
  return status === 'Liberado' || status === 'LPCO deferida, MAPA liberado'
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
    return 'Concedida, aguardando programacao de carregamento'
  }
  if (normalizedStatus === 'registrada, aguardando concessao pela rfb') {
    return 'Registrada, aguardando concessao pela RFB'
  }
  if (normalizedStatus === 'aguardando registro') return 'Aguardando registro'

  return String(status ?? '')
}

function normalizeDestination(value) {
  return String(value ?? '').trim().toUpperCase()
}

function sanitizeCustomsFlow(process) {
  const cargoPresenceInformed = Boolean(process.cargoPresenceInformed)
  const duimpStatus = cargoPresenceInformed ? canonicalizeDuimpStatus(process.duimpStatus) : ''
  const parameterizationChannel =
    duimpStatus === 'Parametrizada' ? process.parameterizationChannel ?? '' : ''
  const canReleaseCollection =
    !isMaritimeCategory(process.category) || mapaAllowsCollection(process.mapaStatus)
  const normalizedCollectionStatus =
    parameterizationChannel === 'Verde' && canReleaseCollection ? process.collectionStatus ?? '' : ''
  const collectionWindows = parameterizationChannel === 'Verde' && canReleaseCollection
    ? getCollectionWindows(process)
    : []
  const collectionScheduledAt = keepsCollectionSchedule(normalizedCollectionStatus)
    ? process.collectionScheduledAt ?? ''
    : ''

  return {
    cargoPresenceInformed,
    duimpStatus,
    parameterizationChannel,
    collectionStatus: normalizedCollectionStatus,
    collectionWindows,
    collectionScheduledAt,
  }
}

function sanitizeMapaFlow(process) {
  const mapaStatus = isMaritimeCategory(process.category) ? process.mapaStatus ?? '' : ''
  const mapaInspectionScheduledAt =
    mapaStatus === 'Vistoria agendada, aguardando realização'
      ? process.mapaInspectionScheduledAt ?? ''
      : ''

  return {
    mapaStatus,
    mapaInspectionScheduledAt,
  }
}

function sanitizeOperationalFields(process) {
  if (isMaritimeCategory(process.category)) {
    const berthed = Boolean(process.berthed)

    if (!berthed) {
      return {
        berthed: false,
        arrived: false,
        cargoPresenceInformed: false,
        duimpStatus: '',
        parameterizationChannel: '',
        collectionStatus: '',
        collectionWindows: [],
        collectionScheduledAt: '',
        mapaStatus: process.mapaStatus ?? '',
        mapaInspectionScheduledAt:
          process.mapaStatus === 'Vistoria agendada, aguardando realização'
            ? process.mapaInspectionScheduledAt ?? ''
            : '',
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
      ...sanitizeMapaFlow(process),
      ...sanitizeCustomsFlow(process),
    }
  }

  if (isAirCategory(process.category)) {
    const arrived = Boolean(process.arrived)
    const dtaStatus = arrived ? canonicalizeDtaStatus(process.dtaStatus ?? '') : ''
    const dtaLoadingScheduledAt =
      normalizeDtaStatus(dtaStatus) === 'carregamento programado'
        ? process.dtaLoadingScheduledAt ?? ''
        : ''
    const dtaArrivalAtItajai =
      normalizeDtaStatus(dtaStatus) === 'carregamento programado'
        ? process.dtaArrivalAtItajai ?? ''
        : ''
    const cargoPresenceInformed =
      normalizeDtaStatus(dtaStatus) === 'transito concluido'
        ? Boolean(process.cargoPresenceInformed)
        : false

    if (!arrived) {
      return {
        berthed: false,
        arrived: false,
        cargoPresenceInformed: false,
        duimpStatus: '',
        parameterizationChannel: '',
        collectionStatus: '',
        collectionWindows: [],
        collectionScheduledAt: '',
        mapaStatus: '',
        mapaInspectionScheduledAt: '',
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
        cargoPresenceInformed,
      }),
    }
  }

  return {
    berthed: false,
    arrived: false,
      cargoPresenceInformed: false,
      duimpStatus: '',
      parameterizationChannel: '',
      collectionStatus: '',
      collectionWindows: [],
      collectionScheduledAt: '',
      mapaStatus: '',
      mapaInspectionScheduledAt: '',
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
  const eta = rawProcess.eta ?? ''
  const operationalFields = sanitizeOperationalFields({
    category,
    berthed: rawProcess.berthed,
    arrived: rawProcess.arrived,
    cargoPresenceInformed: rawProcess.cargoPresenceInformed,
    duimpStatus: rawProcess.duimpStatus,
    parameterizationChannel: rawProcess.parameterizationChannel,
    collectionStatus: rawProcess.collectionStatus,
    collectionScheduledAt: rawProcess.collectionScheduledAt,
    collectionWindows: rawProcess.collectionWindows,
    containerQuantity: rawProcess.containerQuantity,
    mapaStatus: rawProcess.mapaStatus,
    mapaInspectionScheduledAt: rawProcess.mapaInspectionScheduledAt,
    dtaStatus: rawProcess.dtaStatus,
    dtaLoadingScheduledAt: rawProcess.dtaLoadingScheduledAt,
    dtaArrivalAtItajai: rawProcess.dtaArrivalAtItajai,
  })

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
    containerQuantity: normalizeQuantity(rawProcess.containerQuantity),
    palletQuantity: normalizeQuantity(rawProcess.palletQuantity),
    processNotes: String(rawProcess.processNotes ?? '').trim(),
    warehouseDeliveryDateOverride: normalizeIsoDate(rawProcess.warehouseDeliveryDateOverride),
    postReceiptNotes: String(rawProcess.postReceiptNotes ?? '').trim(),
    postReceiptImages: normalizePostReceiptImages(rawProcess.postReceiptImages),
    cargoReceivedAt: normalizeIsoDateTime(rawProcess.cargoReceivedAt),
    items: normalizeProcessItems(rawProcess.items),
    ...operationalFields,
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
  return {
    name: String(process.name ?? ''),
    category: processCategoryOptions.includes(process.category) ? process.category : 'FCL',
    processNumber: process.category === 'CONSOLIDADO' ? '' : String(process.processNumber ?? ''),
    destination: normalizeDestination(process.destination),
    etd: String(process.etd ?? ''),
    eta: String(process.eta ?? ''),
    etaOriginal: String(process.etaOriginal || process.eta || ''),
    processStatus: normalizeProcessStatus(process.processStatus, process.duimpStatus),
    containerQuantity: normalizeQuantity(process.containerQuantity),
    palletQuantity: normalizeQuantity(process.palletQuantity),
    processNotes: String(process.processNotes ?? '').trim(),
    warehouseDeliveryDateOverride: normalizeIsoDate(process.warehouseDeliveryDateOverride),
    postReceiptNotes: String(process.postReceiptNotes ?? '').trim(),
    postReceiptImages: normalizePostReceiptImages(process.postReceiptImages),
    cargoReceivedAt: normalizeIsoDateTime(process.cargoReceivedAt),
    items: normalizeProcessItems(process.items),
    berthed: Boolean(process.berthed),
    arrived: Boolean(process.arrived),
    cargoPresenceInformed: Boolean(process.cargoPresenceInformed),
    duimpStatus: String(process.duimpStatus ?? ''),
    parameterizationChannel: String(process.parameterizationChannel ?? ''),
    collectionStatus: String(process.collectionStatus ?? ''),
    collectionScheduledAt: String(process.collectionScheduledAt ?? ''),
    collectionWindows: serializeCollectionWindowsForFirestore(
      normalizeCollectionWindows(process.collectionWindows, {
        legacyScheduledAt: process.collectionScheduledAt,
        containerQuantity: process.containerQuantity,
      })
    ),
    mapaStatus: String(process.mapaStatus ?? ''),
    mapaInspectionScheduledAt: String(process.mapaInspectionScheduledAt ?? ''),
    dtaStatus: canonicalizeDtaStatus(process.dtaStatus ?? ''),
    dtaLoadingScheduledAt: String(process.dtaLoadingScheduledAt ?? ''),
    dtaArrivalAtItajai: String(process.dtaArrivalAtItajai ?? ''),
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
        },
        item.id
      )
    })
    .filter((item) => !isExpiredReceivedProcess(item))
}

export async function saveProcess(process, actor = null) {
  const normalizedProcess = normalizeProcess(process, process.id || `PROC-${Date.now()}`)
  const now = new Date().toISOString()
  const nextProcess = {
    ...normalizedProcess,
    id: String(normalizedProcess.id ?? '').trim() || `PROC-${Date.now()}`,
    processNumber:
      normalizedProcess.category === 'CONSOLIDADO' ? '' : normalizedProcess.processNumber,
    etaOriginal: normalizedProcess.etaOriginal || normalizedProcess.eta,
    processStatus: normalizeProcessStatus(
      normalizedProcess.processStatus,
      normalizedProcess.duimpStatus
    ),
    dtaStatus: canonicalizeDtaStatus(normalizedProcess.dtaStatus),
    cargoReceivedAt: normalizeIsoDateTime(normalizedProcess.cargoReceivedAt),
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

export async function saveProcessCollectionStatus(processId, collectionStatus, actor = null) {
  const normalizedId = String(processId ?? '').trim()
  const normalizedStatus = String(collectionStatus ?? '').trim()
  const now = new Date().toISOString()

  if (!normalizedId) {
    throw new Error('Processo inválido para atualizar o status de coleta.')
  }

  if (!postCollectionStatusOptions.includes(normalizedStatus)) {
    throw new Error('Status de coleta inválido para atualização logística.')
  }

  if (!isFirebaseConfigured || !firestore) {
    const currentProcesses = readLocalProcesses().map((item) => normalizeProcess(item))
    const existingIndex = currentProcesses.findIndex((item) => item.id === normalizedId)

    if (existingIndex < 0) {
      throw new Error('Processo não encontrado para atualizar o status de coleta.')
    }

    const currentProcess = currentProcesses[existingIndex]

    if (!currentProcess.collectionScheduledAt || !keepsCollectionSchedule(currentProcess.collectionStatus)) {
      throw new Error('O status de coleta só pode ser atualizado após a coleta agendada.')
    }

    const nextProcess = {
      ...currentProcess,
      collectionStatus: normalizedStatus,
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

  await updateDoc(doc(firestore, 'processes', normalizedId), {
    collectionStatus: normalizedStatus,
    updatedById: String(actor?.uid ?? actor?.id ?? '').trim(),
    updatedByName: String(actor?.name ?? actor?.email ?? '').trim(),
    updatedAt: serverTimestamp(),
  })

  await recordProcessAudit({
    action: 'Status de coleta atualizado',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: normalizedId,
  })

  return {
    id: normalizedId,
    collectionStatus: normalizedStatus,
    updatedById: String(actor?.uid ?? actor?.id ?? '').trim(),
    updatedByName: String(actor?.name ?? actor?.email ?? '').trim(),
    updatedAt: now,
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
