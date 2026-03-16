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
} from 'firebase/firestore'
import { firestore, isFirebaseConfigured } from '../lib/firebase'
import {
  canonicalizeProcessStatus,
  processStatusOptions,
} from '../features/processes/processStatus'
import { createAuditEvent } from './auditRepository'

const STORAGE_KEY = 'sq-comex-processes'

export const processCategoryOptions = ['FCL', 'LCL', 'AEREO', 'CONSOLIDADO']
export const duimpStatusOptions = [
  'Aguardando registro',
  'Registrada, aguardando parametrizacao',
  'Parametrizada',
]
export const channelOptions = ['Verde', 'Amarelo', 'Vermelho', 'Cinza']
export const collectionStatusOptions = [
  'Aguardando liberacao no Terminal',
  'Aguardando agendamento',
  'Coleta Agendada',
  'Veiculo no CD para descarga',
  'Carga recebida',
]
export const mapaStatusOptions = [
  'Aguardando MAPA',
  'Liberado',
  'Selecionado para Vistoria',
  'Vistoria agendada, aguardando realizacao',
  'Vistoria realizada, aguardando deferimento da LPCO',
  'LPCO deferida, MAPA liberado',
]
export const dtaStatusOptions = [
  'Aguardando registro',
  'Registrada, aguardando concessao pela RFB',
  'Concedida, aguardando programacao de carregamento',
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

function normalizeProcessStatus(status) {
  const canonicalStatus = canonicalizeProcessStatus(status)
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
    postReceiptNotes: '',
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
    postReceiptNotes: '',
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
    postReceiptNotes: '',
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
  const duimpStatus = cargoPresenceInformed ? process.duimpStatus ?? '' : ''
  const parameterizationChannel =
    duimpStatus === 'Parametrizada' ? process.parameterizationChannel ?? '' : ''
  const canReleaseCollection =
    !isMaritimeCategory(process.category) || mapaAllowsCollection(process.mapaStatus)
  const collectionStatus =
    parameterizationChannel === 'Verde' && canReleaseCollection ? process.collectionStatus ?? '' : ''
  const collectionScheduledAt = keepsCollectionSchedule(collectionStatus)
    ? process.collectionScheduledAt ?? ''
    : ''

  return {
    cargoPresenceInformed,
    duimpStatus,
    parameterizationChannel,
    collectionStatus,
    collectionScheduledAt,
  }
}

function sanitizeMapaFlow(process) {
  const mapaStatus = isMaritimeCategory(process.category) ? process.mapaStatus ?? '' : ''
  const mapaInspectionScheduledAt =
    mapaStatus === 'Vistoria agendada, aguardando realizacao'
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
        collectionScheduledAt: '',
        mapaStatus: process.mapaStatus ?? '',
        mapaInspectionScheduledAt:
          process.mapaStatus === 'Vistoria agendada, aguardando realizacao'
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
    processStatus: normalizeProcessStatus(rawProcess.processStatus),
    containerQuantity: normalizeQuantity(rawProcess.containerQuantity),
    palletQuantity: normalizeQuantity(rawProcess.palletQuantity),
    processNotes: String(rawProcess.processNotes ?? '').trim(),
    postReceiptNotes: String(rawProcess.postReceiptNotes ?? '').trim(),
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

function toFirestorePayload(process) {
  return {
    name: String(process.name ?? ''),
    category: processCategoryOptions.includes(process.category) ? process.category : 'FCL',
    processNumber: process.category === 'CONSOLIDADO' ? '' : String(process.processNumber ?? ''),
    destination: normalizeDestination(process.destination),
    etd: String(process.etd ?? ''),
    eta: String(process.eta ?? ''),
    etaOriginal: String(process.etaOriginal || process.eta || ''),
    processStatus: normalizeProcessStatus(process.processStatus),
    containerQuantity: normalizeQuantity(process.containerQuantity),
    palletQuantity: normalizeQuantity(process.palletQuantity),
    processNotes: String(process.processNotes ?? '').trim(),
    postReceiptNotes: String(process.postReceiptNotes ?? '').trim(),
    items: normalizeProcessItems(process.items),
    berthed: Boolean(process.berthed),
    arrived: Boolean(process.arrived),
    cargoPresenceInformed: Boolean(process.cargoPresenceInformed),
    duimpStatus: String(process.duimpStatus ?? ''),
    parameterizationChannel: String(process.parameterizationChannel ?? ''),
    collectionStatus: String(process.collectionStatus ?? ''),
    collectionScheduledAt: String(process.collectionScheduledAt ?? ''),
    mapaStatus: String(process.mapaStatus ?? ''),
    mapaInspectionScheduledAt: String(process.mapaInspectionScheduledAt ?? ''),
    dtaStatus: canonicalizeDtaStatus(process.dtaStatus ?? ''),
    dtaLoadingScheduledAt: String(process.dtaLoadingScheduledAt ?? ''),
    dtaArrivalAtItajai: String(process.dtaArrivalAtItajai ?? ''),
    updatedAt: serverTimestamp(),
  }
}

export async function listProcesses() {
  if (!isFirebaseConfigured || !firestore) {
    return sortProcesses(readLocalProcesses().map((item) => normalizeProcess(item)))
  }

  const processesQuery = query(collection(firestore, 'processes'), orderBy('updatedAt', 'desc'))
  const snapshot = await getDocs(processesQuery)

  return snapshot.docs.map((item) => {
    const data = item.data()

    return normalizeProcess(
      {
        ...data,
        updatedAt:
          typeof data.updatedAt?.toDate === 'function'
            ? data.updatedAt.toDate().toISOString()
            : data.updatedAt,
      },
      item.id
    )
  })
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
    processStatus: normalizeProcessStatus(normalizedProcess.processStatus),
    dtaStatus: canonicalizeDtaStatus(normalizedProcess.dtaStatus),
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

export async function saveProcessPostReceiptNotes(processId, postReceiptNotes, actor = null) {
  const normalizedId = String(processId ?? '').trim()
  const normalizedNotes = String(postReceiptNotes ?? '').trim()
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
    updatedAt: serverTimestamp(),
  })

  await recordProcessAudit({
    action: 'Observações de CD atualizadas',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: normalizedId,
  })

  const refreshedProcess = (await listProcesses()).find((item) => item.id === normalizedId)
  return refreshedProcess ?? { id: normalizedId, postReceiptNotes: normalizedNotes, updatedAt: now }
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
