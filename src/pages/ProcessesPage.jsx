import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import { useToast } from '../components/Toast'
import { exportProcessesToXlsx } from '../utils/exportProcesses'
import { MAX_PROCESS_MESSAGES } from '../features/processes/ProcessMessagesPanel'
import PostReceiptGallery from '../features/processes/PostReceiptGallery'
import CollectionStatusEditView from '../features/processes/CollectionStatusEditView'
import ProcessDetailView from '../features/processes/ProcessDetailView'
import ProcessForm from '../features/processes/ProcessForm'
import PostReceiptEditView from '../features/processes/PostReceiptEditView'
import ProcessListView from '../features/processes/ProcessListView'
import ImportProcessesModal from '../features/processes/ImportProcessesModal'
import Spinner from '../components/Spinner'
import {
  channelOptions,
  collectionStatusOptions,
  deleteProcess,
  dtaStatusOptions,
  duimpStatusOptions,
  listProcesses,
  mapaStatusOptions,
  processCategoryOptions,
  saveProcessCollectionStatus,
  saveProcessPostReceiptNotes,
  saveProcess,
} from '../services/processesRepository'
import {
  createProcessMessage,
  deleteProcessMessage,
  listProcessMessages,
} from '../services/processMessagesRepository'
import {
  isCollectionScheduleRetainingStatus,
  isDtaLoadingScheduledStatus,
  isDtaTransitCompletedStatus,
  isMapaInspectionScheduledStatus,
  isProcessStatusFinalized,
  mapaAllowsCollectionStatus,
  normalizeComparableText,
  postCollectionStatusOptions,
  processStatusOptions,
} from '../features/processes/processStatus'
import {
  isMaritimeCategory,
  isAirCategory,
} from '../features/processes/processCategories'
import CollectionWindowsEditor from '../features/processes/CollectionWindowsEditor'
import { getCollectionWindows } from '../utils/collectionWindows'
import {
  getAutomaticEstimatedDeliveryDate,
  getEstimatedDeliveryDate,
} from '../utils/deliveryForecast'
import {
  buildPendingPostReceiptImages,
  MAX_POST_RECEIPT_IMAGES,
  normalizeDraftPostReceiptImages,
  normalizePostReceiptImages,
  revokePostReceiptImagePreview,
} from '../utils/postReceiptImages'
import {
  deletePostReceiptImages,
  getAddedPostReceiptImages,
  getRemovedPostReceiptImages,
  resolvePostReceiptImagesForSave,
} from '../services/postReceiptImagesStorage'

const emptyDraft = () => ({
  id: '',
  name: '',
  category: 'FCL',
  processNumber: '',
  destination: '',
  etd: '',
  eta: '',
  etaOriginal: '',
  processStatus: processStatusOptions[0],
  containerQuantity: 0,
  palletQuantity: 0,
  processNotes: '',
  warehouseDeliveryDateOverride: '',
  postReceiptNotes: '',
  postReceiptImages: [],
  cargoReceivedAt: '',
  items: [{ id: `ITEM-${Date.now()}`, commercialName: '', quantity: 0 }],
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
})

const isRestrictedCategory = (category) => ['FCL', 'LCL', 'AEREO'].includes(category)
// PR #15 (2026-07-09): usa data local (nao' UTC) pra evitar bug
// de timezone. `new Date().toISOString()` sempre usa UTC, e em
// BRT (UTC-3) o UTC pode estar num dia diferente do local
// (especialmente 21:00-23:59 BRT, onde UTC ja' e' dia seguinte).
// Resultado: eta 'YYYY-MM-DD' (que e' local) seria comparado com
// UTC, gerando falsos positivos/negativos.
const isEtaReached = (eta) => {
  if (!eta) return false
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const todayLocal = `${year}-${month}-${day}`
  return eta <= todayLocal
}

function formatCargoUnit(quantity, singularLabel, pluralLabel) {
  return `${quantity} ${quantity < 2 ? singularLabel : pluralLabel}`
}

function getDestinationLabel(category) {
  return category === 'AEREO' ? 'Aeroporto de Destino' : 'Porto de Atracação'
}

function buildActionErrorMessage(prefix, error) {
  const details = error?.code ?? error?.message
  return details ? `${prefix} (${details})` : prefix
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

function getEstimatedDeliveryLabel(process) {
  return formatDate(getEstimatedDeliveryDate(process))
}

function getAutomaticEstimatedDeliveryLabel(process) {
  return formatDate(getAutomaticEstimatedDeliveryDate(process))
}

function canShowProcessName(process, isAdmin) {
  return isAdmin || !isRestrictedCategory(process.category)
}

function hasUpdatedEta(process) {
  return Boolean(process?.eta && process?.etaOriginal && process.etaOriginal !== process.eta)
}

function getEtaDisplayClassName(process, baseClassName = '') {
  return [baseClassName, hasUpdatedEta(process) ? 'eta-detail-highlight' : '']
    .filter(Boolean)
    .join(' ')
}

function hasPostReceiptContent(process) {
  return Boolean(
    String(process?.postReceiptNotes ?? '').trim() ||
      normalizePostReceiptImages(process?.postReceiptImages).length > 0
  )
}

function keepsCollectionSchedule(status) {
  return isCollectionScheduleRetainingStatus(status)
}

function shouldEditCollectionSchedule(status) {
  return status === 'Coleta Agendada' || normalizeComparableText(status) === 'carga a caminho do cd'
}

function canUsePostCollectionStatuses(process) {
  return Boolean(getCollectionWindows(process).length && keepsCollectionSchedule(process.collectionStatus))
}

function getCollectionStatusOptions(process) {
  if (canUsePostCollectionStatuses(process)) return collectionStatusOptions

  return collectionStatusOptions.filter(
    (item) =>
      !postCollectionStatusOptions.includes(item) &&
      normalizeComparableText(item) !== 'carga a caminho do cd'
  )
}

function shouldEditMapaInspection(status) {
  return isMapaInspectionScheduledStatus(status)
}

function mapaAllowsCollection(status) {
  return mapaAllowsCollectionStatus(status)
}

function isDtaLoadingScheduled(status) {
  return isDtaLoadingScheduledStatus(status)
}

function isDtaTransitCompleted(status) {
  return isDtaTransitCompletedStatus(status)
}

function sanitizeProcessItems(items) {
  const normalizedItems = Array.isArray(items) ? items : []

  return normalizedItems
    .map((item, index) => ({
      id:
        typeof item?.id === 'string' && item.id.trim()
          ? item.id.trim()
          : `ITEM-${Date.now()}-${index}`,
      commercialName: String(item?.commercialName ?? '').trim(),
      quantity: Math.max(0, Number(item?.quantity) || 0),
    }))
    .filter((item) => item.commercialName || item.quantity > 0)
}

function isCdEnRouteStatusForFilter(value) {
  return normalizeComparableText(value) === 'carga a caminho do cd'
}

function normalizeItemName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function normalizeSpreadsheetHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function extractItemsFromWorksheet(file) {
  return file.arrayBuffer().then((buffer) => {
    return import('xlsx').then(({ read, utils }) => {
      const workbook = read(buffer, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]

      if (!firstSheetName) {
        throw new Error('A planilha não possui abas válidas.')
      }

      const sheet = workbook.Sheets[firstSheetName]
      const rows = utils.sheet_to_json(sheet, { header: 1, defval: '' })

      if (rows.length === 0) {
        throw new Error('A planilha enviada está vazia.')
      }

      const headerRow = rows[0].map((value) => normalizeSpreadsheetHeader(value))
      let commercialNameIndex = headerRow.findIndex(
        (value) => value.includes('nome') || value.includes('descricao') || value.includes('produto')
      )
      let quantityIndex = headerRow.findIndex(
        (value) => value.includes('quant') || value.includes('qtd')
      )

      if (commercialNameIndex < 0) commercialNameIndex = 0
      if (quantityIndex < 0) quantityIndex = 1

      const importedItems = rows
        .slice(1)
        .map((row, index) => ({
          id: `ITEM-IMPORT-${Date.now()}-${index}`,
          commercialName: String(row[commercialNameIndex] ?? '').trim(),
          quantity: Math.max(0, Number(row[quantityIndex]) || 0),
        }))
        .filter((item) => item.commercialName || item.quantity > 0)

      if (importedItems.length === 0) {
        throw new Error('Nenhum item válido foi encontrado na planilha.')
      }

      return importedItems
    })
  })
}

function sanitizeCustoms(draft, incomingWindows = null) {
  if (!draft.cargoPresenceInformed) {
    return {
      ...draft,
      duimpStatus: '',
      parameterizationChannel: '',
      collectionStatus: '',
      collectionWindows: [],
      collectionScheduledAt: '',
    }
  }
  if (draft.duimpStatus !== 'Parametrizada') {
    return {
      ...draft,
      parameterizationChannel: '',
      collectionStatus: '',
      collectionWindows: [],
      collectionScheduledAt: '',
    }
  }
  if (isMaritimeCategory(draft.category) && !mapaAllowsCollection(draft.mapaStatus)) {
    return { ...draft, collectionStatus: '', collectionWindows: [], collectionScheduledAt: '' }
  }
  if (draft.parameterizationChannel !== 'Verde') {
    return { ...draft, collectionStatus: '', collectionWindows: [], collectionScheduledAt: '' }
  }
  if (!keepsCollectionSchedule(draft.collectionStatus)) {
    return { ...draft, collectionWindows: [], collectionScheduledAt: '' }
  }
  if (incomingWindows !== null) {
    return { ...draft, collectionWindows: incomingWindows }
  }
  return draft
}

function sanitizeMapa(draft) {
  if (draft.category !== 'FCL' && draft.category !== 'LCL' && draft.category !== 'CONSOLIDADO') {
    return { ...draft, mapaStatus: '', mapaInspectionScheduledAt: '' }
  }
  if (draft.mapaStatus !== 'Vistoria agendada, aguardando realização') {
    return { ...draft, mapaInspectionScheduledAt: '' }
  }
  return draft
}

function sanitizeDraft(currentDraft, overrides = {}) {
  const mergedDraft = {
    ...currentDraft,
    ...overrides,
    containerQuantity: Math.max(
      0,
      Number(overrides.containerQuantity ?? currentDraft.containerQuantity) || 0
    ),
    palletQuantity: Math.max(0, Number(overrides.palletQuantity ?? currentDraft.palletQuantity) || 0),
    items: Array.isArray(overrides.items ?? currentDraft.items)
      ? [...(overrides.items ?? currentDraft.items)]
      : [],
  }
  const incomingWindows = Array.isArray(overrides.collectionWindows)
    ? overrides.collectionWindows
    : null
  const draft = sanitizeMapa(mergedDraft)

  if (isMaritimeCategory(draft.category)) {
    const next = {
      ...draft,
      arrived: false,
      dtaStatus: '',
      dtaLoadingScheduledAt: '',
      dtaArrivalAtItajai: '',
    }
    if (!next.berthed) {
      return {
        ...next,
        cargoPresenceInformed: false,
        duimpStatus: '',
        parameterizationChannel: '',
        collectionStatus: '',
        collectionWindows: [],
        collectionScheduledAt: '',
      }
    }
    return sanitizeCustoms(next, incomingWindows)
  }

  if (isAirCategory(draft.category)) {
    const next = { ...draft, berthed: false, mapaStatus: '', mapaInspectionScheduledAt: '' }
    if (!next.arrived) {
      return {
        ...next,
        dtaStatus: '',
        dtaLoadingScheduledAt: '',
        dtaArrivalAtItajai: '',
        cargoPresenceInformed: false,
        duimpStatus: '',
        parameterizationChannel: '',
        collectionStatus: '',
        collectionWindows: [],
        collectionScheduledAt: '',
      }
    }
    if (!isDtaLoadingScheduled(next.dtaStatus)) {
      next.dtaLoadingScheduledAt = ''
      next.dtaArrivalAtItajai = ''
    }
    if (!isDtaTransitCompleted(next.dtaStatus)) next.cargoPresenceInformed = false
    return sanitizeCustoms(next, incomingWindows)
  }

  return {
    ...draft,
    berthed: false,
    arrived: false,
    mapaStatus: '',
    mapaInspectionScheduledAt: '',
    dtaStatus: '',
    dtaLoadingScheduledAt: '',
    dtaArrivalAtItajai: '',
    cargoPresenceInformed: false,
    duimpStatus: '',
    parameterizationChannel: '',
    collectionStatus: '',
    collectionWindows: [],
    collectionScheduledAt: '',
  }
}

export default function ProcessesPage() {
  const location = useLocation()
  const { profile, toggleFavoriteProcess } = useAuth()
  const toast = useToast()
  const isAdmin = profile?.role === 'admin'
  const canEditPostReceiptNotes = isAdmin || profile?.role === 'logistica'
  const canEditCollectionStatus = isAdmin || profile?.role === 'logistica'
  const hasUnlimitedMessages = isAdmin
  const favoriteProcessIds = profile?.favoriteProcessIds ?? []
  const [processes, setProcesses] = useState([])
  const [selectedProcessId, setSelectedProcessId] = useState(null)
  const [draft, setDraft] = useState(emptyDraft())
  const [viewMode, setViewMode] = useState('list')
  const [detailTab, setDetailTab] = useState('general')
  const [editTab, setEditTab] = useState('general')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('Todos')
  const [etaStartDate, setEtaStartDate] = useState('')
  const [etaEndDate, setEtaEndDate] = useState('')
  const [operationFilter, setOperationFilter] = useState('Todos')
  const [isImportOpen, setIsImportOpen] = useState(false)

  // F11: nºs de processo já existentes, pra o import marcar duplicatas sem
  // uma query extra (os processos já estão carregados em memória).
  const existingProcessNumbers = useMemo(
    () => new Set(processes.map((item) => item.processNumber).filter(Boolean)),
    [processes]
  )

  // Filtros ativos: usado pra renderizar pills de filtros com X
  const hasActiveFilters =
    Boolean(searchTerm) ||
    categoryFilter !== 'Todos' ||
    Boolean(etaStartDate) ||
    Boolean(etaEndDate) ||
    operationFilter !== 'Todos'
  const [error, setError] = useState('')
  const [messagesError, setMessagesError] = useState('')
  const [processMessages, setProcessMessages] = useState([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [deletingMessageId, setDeletingMessageId] = useState('')
  const [isImportingItems, setIsImportingItems] = useState(false)
  const [isUploadingPostReceiptImages, setIsUploadingPostReceiptImages] = useState(false)
  const [selectedPostReceiptImageIndex, setSelectedPostReceiptImageIndex] = useState(-1)
  const [itemSearchTerm, setItemSearchTerm] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [selectedItemName, setSelectedItemName] = useState('')
  const itemsSectionRef = useRef(null)
  const itemsFileInputRef = useRef(null)
  const latestDraftPostReceiptImagesRef = useRef([])
  const postReceiptGalleryTouchStartXRef = useRef(null)

  function cleanupPostReceiptImagePreviews(images) {
    normalizeDraftPostReceiptImages(images).forEach((image) => {
      revokePostReceiptImagePreview(image)
    })
  }

  useEffect(() => {
    let isMounted = true

    async function load() {
      setIsLoading(true)
      setError('')
      try {
        const loaded = await listProcesses()
        if (!isMounted) return
        setProcesses(loaded)
        setSelectedProcessId((currentId) => currentId ?? loaded[0]?.id ?? null)
      } catch (loadError) {
        if (isMounted) {
          setError(buildActionErrorMessage('Não foi possível carregar os processos.', loadError))
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    load()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    latestDraftPostReceiptImagesRef.current = draft.postReceiptImages
  }, [draft.postReceiptImages])

  useEffect(() => {
    return () => {
      cleanupPostReceiptImagePreviews(latestDraftPostReceiptImagesRef.current)
    }
  }, [])

  const filteredProcesses = useMemo(() => {
    return processes
      .filter((item) => {
        const query = searchTerm.trim().toLowerCase()
        const normalizedQuery = normalizeItemName(searchTerm)
        const today = new Date().toISOString().slice(0, 10)
        const matchesCategory = categoryFilter === 'Todos' || item.category === categoryFilter
        const matchesEta =
          (!etaStartDate && !etaEndDate) ||
          (item.eta &&
            (!etaStartDate || item.eta >= etaStartDate) &&
            (!etaEndDate || item.eta <= etaEndDate))

        const matchesOperation =
          operationFilter === 'Todos' ||
          (operationFilter === 'Pós-chegada pendente' &&
            item.eta &&
            item.eta <= today &&
            ((isMaritimeCategory(item.category) && !item.berthed) ||
              (isAirCategory(item.category) && !item.arrived))) ||
          (operationFilter === 'Aguardando presença de carga' &&
            ((isMaritimeCategory(item.category) && item.berthed && !item.cargoPresenceInformed) ||
              (isAirCategory(item.category) &&
                isDtaTransitCompleted(item.dtaStatus) &&
                !item.cargoPresenceInformed))) ||
          (operationFilter === 'DUIMP pendente' &&
            item.cargoPresenceInformed &&
            (!item.duimpStatus || item.duimpStatus !== 'Parametrizada')) ||
          (operationFilter === 'Coleta pendente' &&
            item.parameterizationChannel === 'Verde' &&
            (!item.collectionStatus || !keepsCollectionSchedule(item.collectionStatus))) ||
          (operationFilter === 'Coleta agendada' && keepsCollectionSchedule(item.collectionStatus)) ||
          (operationFilter === 'DTA em andamento' &&
            isAirCategory(item.category) &&
            item.arrived &&
            item.dtaStatus &&
            !isDtaTransitCompleted(item.dtaStatus))

        if (!matchesCategory || !matchesEta || !matchesOperation) {
          return false
        }

        if (!query) return true
        const visibleName = canShowProcessName(item, isAdmin) ? item.name : ''
        const matchesItemName = (item.items ?? []).some((processItem) =>
          normalizeItemName(processItem?.commercialName).includes(normalizedQuery)
        )
        return [
          item.id,
          visibleName,
          item.destination,
          item.processNumber,
          item.category,
          item.eta,
          item.etd,
          item.processStatus,
          item.collectionStatus,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query) || matchesItemName
      })
      .sort((left, right) => {
        if (!left.eta && !right.eta) return 0
        if (!left.eta) return 1
        if (!right.eta) return -1
        return left.eta.localeCompare(right.eta)
      })
  }, [categoryFilter, etaEndDate, etaStartDate, isAdmin, operationFilter, processes, searchTerm])

  const selectedProcess =
    processes.find((item) => item.id === selectedProcessId) ?? filteredProcesses[0] ?? null
  const canEditSelectedCollectionStatus =
    canEditCollectionStatus && canUsePostCollectionStatuses(selectedProcess)
  const draftPostReceiptImages = normalizeDraftPostReceiptImages(draft.postReceiptImages)
  const selectedProcessPostReceiptImages = normalizePostReceiptImages(selectedProcess?.postReceiptImages)
  const selectedPostReceiptImage =
    selectedPostReceiptImageIndex >= 0
      ? selectedProcessPostReceiptImages[selectedPostReceiptImageIndex] ?? null
      : null
  const isPostReceiptGalleryOpen = Boolean(selectedPostReceiptImage)

  useEffect(() => {
    setSelectedPostReceiptImageIndex(-1)
    postReceiptGalleryTouchStartXRef.current = null
  }, [selectedProcess?.id, viewMode])

  useEffect(() => {
    if (!isPostReceiptGalleryOpen) return undefined

    const previousBodyOverflow = document.body.style.overflow

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setSelectedPostReceiptImageIndex(-1)
        return
      }

      if (selectedProcessPostReceiptImages.length <= 1) return

      if (event.key === 'ArrowLeft') {
        setSelectedPostReceiptImageIndex((currentIndex) => {
          const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0
          return (
            (safeCurrentIndex - 1 + selectedProcessPostReceiptImages.length) %
            selectedProcessPostReceiptImages.length
          )
        })
      }

      if (event.key === 'ArrowRight') {
        setSelectedPostReceiptImageIndex((currentIndex) => {
          const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0
          return (safeCurrentIndex + 1) % selectedProcessPostReceiptImages.length
        })
      }
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isPostReceiptGalleryOpen, selectedProcessPostReceiptImages.length])

  const canShowMaritimeFlow =
    viewMode === 'edit' && isMaritimeCategory(draft.category) && isEtaReached(draft.eta)
  const canShowAirFlow = viewMode === 'edit' && isAirCategory(draft.category) && isEtaReached(draft.eta)
  const relatedActiveProcesses = useMemo(() => {
    if (!selectedItemName) return []

    const comparableItemName = normalizeItemName(selectedItemName)

    return processes
      .filter((process) => !isProcessStatusFinalized(process.processStatus))
      .map((process) => {
        const matchedItems = (process.items ?? []).filter(
          (item) => normalizeItemName(item.commercialName) === comparableItemName
        )

        if (matchedItems.length === 0) return null

        return {
          process,
          quantity: matchedItems.reduce((total, item) => total + (Number(item.quantity) || 0), 0),
        }
      })
      .filter(Boolean)
  }, [processes, selectedItemName])

  const visibleProcessItems = useMemo(() => {
    if (!selectedProcess) return []

    const normalizedQuery = normalizeItemName(itemSearchTerm)

    return [...(selectedProcess.items ?? [])]
      .sort((left, right) =>
        String(left?.commercialName ?? '').localeCompare(String(right?.commercialName ?? ''), 'pt-BR', {
          sensitivity: 'base',
        })
      )
      .filter((item) => {
        if (!normalizedQuery) return true
        return normalizeItemName(item?.commercialName).includes(normalizedQuery)
      })
  }, [itemSearchTerm, selectedProcess])

  const remainingMessages = Math.max(0, MAX_PROCESS_MESSAGES - processMessages.length)
  const messageLimitReached = !hasUnlimitedMessages && processMessages.length >= MAX_PROCESS_MESSAGES

  useEffect(() => {
    const processIdFromNotification = location.state?.selectedProcessId

    if (!processIdFromNotification || processes.length === 0) {
      return
    }

    const processFromNotification = processes.find((item) => item.id === processIdFromNotification)

    if (!processFromNotification) {
      return
    }

    setSelectedProcessId(processFromNotification.id)
    setDraft(processFromNotification)
    setViewMode('detail')
    setDetailTab(location.state?.detailTab ?? 'messages')
    setEditTab('general')
    setMessageDraft('')
    setMessagesError('')
  }, [location.key, location.state, processes])

  useEffect(() => {
    if (viewMode !== 'detail' || !selectedProcess?.id) {
      setProcessMessages([])
      setIsLoadingMessages(false)
      setMessagesError('')
      return undefined
    }

    let isMounted = true

    async function loadMessages() {
      setIsLoadingMessages(true)
      setMessagesError('')
      try {
        const messages = await listProcessMessages(selectedProcess.id)
        if (isMounted) setProcessMessages(messages)
      } catch (loadError) {
        if (isMounted) {
          setMessagesError(
            buildActionErrorMessage('Não foi possível carregar as mensagens do processo.', loadError)
          )
        }
      } finally {
        if (isMounted) setIsLoadingMessages(false)
      }
    }

    loadMessages()

    return () => {
      isMounted = false
    }
  }, [selectedProcess?.id, viewMode])

  function handleDraftChange(field, value) {
    setDraft((current) => {
      if (field === 'category') {
        return sanitizeDraft(current, {
          category: value,
          processNumber: value === 'CONSOLIDADO' ? '' : current.processNumber,
        })
      }
      if (field === 'destination') return { ...current, destination: String(value ?? '').toUpperCase() }
      if (field === 'containerQuantity' || field === 'palletQuantity') {
        return { ...current, [field]: Math.max(0, Number(value) || 0) }
      }
      if (field === 'collectionWindows') {
        return sanitizeDraft(current, { [field]: value })
      }
      if (
        [
          'berthed',
          'arrived',
          'cargoPresenceInformed',
          'duimpStatus',
          'parameterizationChannel',
          'collectionStatus',
          'collectionScheduledAt',
          'mapaStatus',
          'mapaInspectionScheduledAt',
          'dtaStatus',
          'dtaLoadingScheduledAt',
          'dtaArrivalAtItajai',
          'items',
        ].includes(field)
      ) {
        return sanitizeDraft(current, { [field]: value })
      }
      return { ...current, [field]: value }
    })
  }

  function handleSelectProcess(processId) {
    const process = processes.find((item) => item.id === processId)
    setSelectedProcessId(processId)
    setDraft(process ?? emptyDraft())
    setViewMode('detail')
    setDetailTab('general')
    setEditTab('general')
    setMessageDraft('')
    setMessagesError('')
  }

  function handleCreateMode() {
    if (!isAdmin) return
    setDraft(emptyDraft())
    setViewMode('create')
    setEditTab('general')
  }

  function handleEditMode() {
    if (!selectedProcess || !isAdmin) return
    setDraft({
      ...selectedProcess,
      items:
        selectedProcess.items?.length > 0
          ? selectedProcess.items
          : [{ id: `ITEM-${Date.now()}`, commercialName: '', quantity: 0 }],
    })
    setViewMode('edit')
    setEditTab('general')
  }

  function handlePostReceiptEditMode() {
    if (!selectedProcess || !canEditPostReceiptNotes) return
    cleanupPostReceiptImagePreviews(draft.postReceiptImages)
    setDraft({
      ...selectedProcess,
      items:
        selectedProcess.items?.length > 0
          ? selectedProcess.items
          : [{ id: `ITEM-${Date.now()}`, commercialName: '', quantity: 0 }],
    })
    setViewMode('post-receipt-edit')
  }

  function handleCollectionStatusEditMode() {
    if (!selectedProcess || !canEditCollectionStatus || !canUsePostCollectionStatuses(selectedProcess)) {
      return
    }
    setDraft({
      ...selectedProcess,
      collectionStatus: postCollectionStatusOptions.includes(selectedProcess.collectionStatus)
        ? selectedProcess.collectionStatus
        : '',
      items:
        selectedProcess.items?.length > 0
          ? selectedProcess.items
          : [{ id: `ITEM-${Date.now()}`, commercialName: '', quantity: 0 }],
    })
    setViewMode('collection-status-edit')
  }

  function handleCloseCollectionStatusEditMode() {
    setDraft(
      selectedProcess
        ? {
            ...selectedProcess,
            items:
              selectedProcess.items?.length > 0
                ? selectedProcess.items
                : [{ id: `ITEM-${Date.now()}`, commercialName: '', quantity: 0 }],
          }
        : emptyDraft()
    )
    setViewMode('detail')
    setDetailTab('process')
  }

  function handleClosePostReceiptEditMode() {
    cleanupPostReceiptImagePreviews(draft.postReceiptImages)
    setDraft(
      selectedProcess
        ? {
            ...selectedProcess,
            items:
              selectedProcess.items?.length > 0
                ? selectedProcess.items
                : [{ id: `ITEM-${Date.now()}`, commercialName: '', quantity: 0 }],
          }
        : emptyDraft()
    )
    setViewMode('detail')
    setDetailTab('process')
  }

  function handleOpenPostReceiptGallery(index) {
    if (selectedProcessPostReceiptImages.length === 0) return

    setSelectedPostReceiptImageIndex(
      Math.min(Math.max(Number(index) || 0, 0), selectedProcessPostReceiptImages.length - 1)
    )
  }

  function handleClosePostReceiptGallery() {
    setSelectedPostReceiptImageIndex(-1)
    postReceiptGalleryTouchStartXRef.current = null
  }

  function handleNavigatePostReceiptGallery(direction) {
    if (selectedProcessPostReceiptImages.length <= 1) return

    setSelectedPostReceiptImageIndex((currentIndex) => {
      const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0
      return (
        (safeCurrentIndex + Number(direction) + selectedProcessPostReceiptImages.length) %
        selectedProcessPostReceiptImages.length
      )
    })
  }

  function handlePostReceiptGalleryTouchStart(event) {
    postReceiptGalleryTouchStartXRef.current = event.touches?.[0]?.clientX ?? null
  }

  function handlePostReceiptGalleryTouchEnd(event) {
    const touchStartX = postReceiptGalleryTouchStartXRef.current
    const touchEndX = event.changedTouches?.[0]?.clientX ?? null

    postReceiptGalleryTouchStartXRef.current = null

    if (!Number.isFinite(touchStartX) || !Number.isFinite(touchEndX)) return

    const deltaX = touchEndX - touchStartX

    if (Math.abs(deltaX) < 48) return

    handleNavigatePostReceiptGallery(deltaX > 0 ? -1 : 1)
  }

  function handlePostReceiptDetailClick(event) {
    const clickedElement =
      event.target instanceof Element
        ? event.target.closest('.post-receipt-image-card--detail')
        : null

    if (!(clickedElement instanceof HTMLAnchorElement)) return

    const clickedImageUrl = String(clickedElement.getAttribute('href') ?? '').trim()
    const clickedImageIndex = selectedProcessPostReceiptImages.findIndex(
      (image) => image.url === clickedImageUrl
    )

    if (clickedImageIndex < 0) return

    event.preventDefault()
    handleOpenPostReceiptGallery(clickedImageIndex)
  }

  async function handlePostReceiptImagesUpload(event) {
    setIsUploadingPostReceiptImages(true)
    setError('')

    try {
      const uploadedImages = buildPendingPostReceiptImages(event.target.files)
      const currentImages = normalizeDraftPostReceiptImages(draft.postReceiptImages)

      if (currentImages.length + uploadedImages.length > MAX_POST_RECEIPT_IMAGES) {
        throw new Error(`Adicione no maximo ${MAX_POST_RECEIPT_IMAGES} imagens por observacao de CD.`)
      }

      setDraft((current) => ({
        ...current,
        postReceiptImages: [
          ...normalizeDraftPostReceiptImages(current.postReceiptImages),
          ...uploadedImages,
        ],
      }))
    } catch (uploadError) {
      setError(buildActionErrorMessage('Não foi possível carregar as imagens do CD.', uploadError))
    } finally {
      setIsUploadingPostReceiptImages(false)
      event.target.value = ''
    }
  }

  function handleRemovePostReceiptImage(imageId) {
    setDraft((current) => {
      const currentImages = normalizeDraftPostReceiptImages(current.postReceiptImages)
      const removedImage = currentImages.find((image) => image.id === imageId)

      if (removedImage) {
        revokePostReceiptImagePreview(removedImage)
      }

      return {
        ...current,
        postReceiptImages: currentImages.filter((image) => image.id !== imageId),
      }
    })
  }

  async function refreshProcesses(nextSelectedId = selectedProcessId) {
    const refreshed = await listProcesses()
    setProcesses(refreshed)
    setSelectedProcessId(nextSelectedId)
    return refreshed
  }

  async function handleSaveProcess() {
    if (!isAdmin) return
    setIsSaving(true)
    setError('')
    try {
      const payload = sanitizeDraft({
        ...draft,
        items: sanitizeProcessItems(draft.items),
      })
      if (viewMode === 'create') payload.etaOriginal = draft.eta
      else if (selectedProcess?.eta && draft.eta && selectedProcess.eta !== draft.eta) {
        payload.etaOriginal = selectedProcess.etaOriginal || selectedProcess.eta
      } else {
        payload.etaOriginal = selectedProcess?.etaOriginal || draft.etaOriginal || draft.eta
      }
      const nextProcessStatus = payload.processStatus
      const previousProcessStatus = selectedProcess?.processStatus ?? ''
      if (nextProcessStatus === 'Carga recebida' && previousProcessStatus !== 'Carga recebida') {
        payload.cargoReceivedAt = new Date().toISOString()
        // Ao confirmar o recebimento pela primeira vez, avanca o status de
        // coleta direto pra "Carga disponivel em estoque", pulando os
        // estagios intermediarios (Conferencia/Etiquetagem, Entrada).
        payload.collectionStatus = 'Carga disponível em estoque'
      } else if (nextProcessStatus === 'Carga recebida') {
        payload.cargoReceivedAt = selectedProcess?.cargoReceivedAt || draft.cargoReceivedAt || ''
      } else {
        payload.cargoReceivedAt = ''
      }
      const saved = await saveProcess(payload, profile)
      await refreshProcesses(saved.id)
      setDraft(saved)
      setViewMode('detail')
      setDetailTab('general')
      setEditTab('general')
    } catch (saveError) {
      const message = buildActionErrorMessage('Não foi possível salvar o processo.', saveError)
      setError(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  // F11: cria em lote as linhas válidas (já sem duplicatas) vindas do
  // ImportProcessesModal. Cada linha vira um processo novo via saveProcess
  // (sem id → cria), preenchendo updatedById/Name a partir do profile. Erros
  // por linha são coletados sem abortar o lote; ao fim, refresh + toast.
  async function handleImportProcesses(rows) {
    if (!isAdmin) return
    let created = 0
    const failures = []
    for (const row of rows) {
      try {
        await saveProcess(row, profile)
        created += 1
      } catch (importError) {
        failures.push({ name: row.name, error: importError })
      }
    }

    await refreshProcesses(selectedProcessId)

    if (created > 0) {
      toast.success(`Importados ${created} processo${created === 1 ? '' : 's'}.`)
    }
    if (failures.length > 0) {
      console.error('Falha ao importar processos.', failures)
      toast.error(
        `${failures.length} processo${failures.length === 1 ? '' : 's'} não pôde ser criado.`
      )
    }
    if (created === 0 && failures.length === 0) {
      toast.info('Nenhum processo novo para importar.')
    }
  }

  async function handleSaveCollectionStatus() {
    if (!canEditCollectionStatus || !selectedProcess) return
    setIsSaving(true)
    setError('')
    try {
      await saveProcessCollectionStatus(selectedProcess.id, draft.collectionStatus, profile)
      const refreshed = await refreshProcesses(selectedProcess.id)
      const saved = refreshed.find((item) => item.id === selectedProcess.id)
      if (saved) setDraft(saved)
      setViewMode('detail')
      setDetailTab('process')
    } catch (saveError) {
      const message = buildActionErrorMessage('Não foi possível salvar o status de coleta.', saveError)
      setError(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSavePostReceiptNotes() {
    if (!canEditPostReceiptNotes || !selectedProcess) return
    setIsSaving(true)
    setError('')

    let previousImages = []
    let normalizedImages = []
    let saved = null

    try {
      const normalizedNotes = String(draft.postReceiptNotes ?? '').trim()
      const currentDraftImages = normalizeDraftPostReceiptImages(draft.postReceiptImages)
      const previousNotes = String(selectedProcess.postReceiptNotes ?? '').trim()
      previousImages = normalizePostReceiptImages(selectedProcess.postReceiptImages)
      normalizedImages = await resolvePostReceiptImagesForSave(
        selectedProcess.id,
        currentDraftImages,
        profile?.uid ?? profile?.id ?? ''
      )
      saved = await saveProcessPostReceiptNotes(
        selectedProcess.id,
        normalizedNotes,
        normalizedImages,
        profile
      )
      await deletePostReceiptImages(getRemovedPostReceiptImages(previousImages, normalizedImages)).catch(
        (deleteError) => {
          console.error('Falha ao remover imagens antigas do recebimento no CD.', deleteError)
        }
      )
      cleanupPostReceiptImagePreviews(currentDraftImages)
      await refreshProcesses(saved.id)
      setDraft(saved)
      setViewMode('detail')
      setDetailTab('process')
    } catch (saveError) {
      if (normalizedImages.length > 0 && !saved) {
        await deletePostReceiptImages(getAddedPostReceiptImages(previousImages, normalizedImages)).catch(
          (cleanupError) => {
            console.error(
              'Falha ao limpar imagens novas do recebimento no CD apos erro no salvamento.',
              cleanupError
            )
          }
        )
      }

      const message = buildActionErrorMessage(
        'Não foi possível salvar as observações pós-recebimento da carga.',
        saveError
      )
      setError(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteProcess() {
    if (!draft.id) return
    setIsSaving(true)
    setError('')
    try {
      const refreshed = await (async () => {
        await deleteProcess(draft.id, profile)
        return refreshProcesses(null)
      })()
      setDraft(refreshed[0] ?? emptyDraft())
      setViewMode('list')
    } catch (saveError) {
      setError(buildActionErrorMessage('Não foi possível excluir o processo.', saveError))
    } finally {
      setIsSaving(false)
    }
  }

  function handleAddItem() {
    handleDraftChange('items', [
      { id: `ITEM-${Date.now()}`, commercialName: '', quantity: 0 },
      ...(draft.items ?? []),
    ])
  }

  function handleItemChange(itemId, field, value) {
    handleDraftChange(
      'items',
      (draft.items ?? []).map((item) =>
        item.id === itemId
          ? {
              ...item,
              [field]: field === 'quantity' ? Math.max(0, Number(value) || 0) : value,
            }
          : item
      )
    )
  }

  function handleRemoveItem(itemId) {
    const nextItems = (draft.items ?? []).filter((item) => item.id !== itemId)
    handleDraftChange(
      'items',
      nextItems.length > 0 ? nextItems : [{ id: `ITEM-${Date.now()}`, commercialName: '', quantity: 0 }]
    )
  }

  async function handleImportItemsFile(event) {
    const file = event.target.files?.[0]

    if (!file) return

    setIsImportingItems(true)
    setError('')

    try {
      const importedItems = await extractItemsFromWorksheet(file)
      const existingItems = sanitizeProcessItems(draft.items)
      const shouldReplacePlaceholder =
        existingItems.length === 0 ||
        (existingItems.length === 1 &&
          !existingItems[0].commercialName &&
          Number(existingItems[0].quantity) === 0)

      handleDraftChange(
        'items',
        shouldReplacePlaceholder ? importedItems : [...existingItems, ...importedItems]
      )
    } catch (importError) {
      setError(
        buildActionErrorMessage(
          'Não foi possível importar os itens. Verifique se a planilha possui colunas de nome comercial e quantidade.',
          importError
        )
      )
    } finally {
      setIsImportingItems(false)
      event.target.value = ''
    }
  }

  function handleOpenItemsTab() {
    handleDetailTabChange('items')
    window.setTimeout(() => {
      itemsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function handleDetailTabChange(nextTab) {
    setDetailTab(nextTab)
    if (nextTab !== 'related-item') {
      setSelectedItemName('')
    }
    if (nextTab !== 'items') {
      setItemSearchTerm('')
    }
  }

  function handleOpenRelatedItemTab(itemName) {
    setSelectedItemName(itemName)
    setDetailTab('related-item')
  }

  function handleOpenProcessDetail(process) {
    if (!process?.id) return

    setSelectedProcessId(process.id)
    setDraft(process)
    setViewMode('detail')
    setDetailTab('general')
    setMessageDraft('')
    setMessagesError('')
  }

  async function handleSendMessage() {
    if (!selectedProcess?.id || !profile) return
    if (messageLimitReached) {
      setMessagesError(`Este processo atingiu o limite de ${MAX_PROCESS_MESSAGES} mensagens para este perfil.`)
      return
    }

    setIsSendingMessage(true)
    setMessagesError('')
    try {
      await createProcessMessage(
        selectedProcess.id,
        {
          content: messageDraft,
        },
        profile
      )
      const refreshedMessages = await listProcessMessages(selectedProcess.id)
      setProcessMessages(refreshedMessages)
      setMessageDraft('')
    } catch (sendError) {
      setMessagesError(buildActionErrorMessage('Não foi possível registrar a mensagem.', sendError))
    } finally {
      setIsSendingMessage(false)
    }
  }

  async function handleDeleteMessage(message) {
    if (!isAdmin || !selectedProcess?.id || !message?.id) return

    setDeletingMessageId(message.id)
    setMessagesError('')
    try {
      await deleteProcessMessage(selectedProcess.id, message.id, profile)
      const refreshedMessages = await listProcessMessages(selectedProcess.id)
      setProcessMessages(refreshedMessages)
    } catch (deleteError) {
      setMessagesError(buildActionErrorMessage('Não foi possível excluir a mensagem.', deleteError))
    } finally {
      setDeletingMessageId('')
    }
  }

  return (
    <section className="surface">
      <div className="section-heading">
        <div>
          <h2>Fila de chegadas</h2>
        </div>
        {isAdmin ? (
          <button type="button" className="primary-button" onClick={handleCreateMode}>
            Novo processo
          </button>
        ) : null}
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {messagesError ? <div className="error-banner">{messagesError}</div> : null}

      {viewMode === 'list' ? (
        <ProcessListView
          filteredProcesses={filteredProcesses}
          isLoading={isLoading}
          selectedProcessId={selectedProcessId}
          isAdmin={isAdmin}
          searchTerm={searchTerm}
          categoryFilter={categoryFilter}
          etaStartDate={etaStartDate}
          etaEndDate={etaEndDate}
          operationFilter={operationFilter}
          hasActiveFilters={hasActiveFilters}
          processCategoryOptions={processCategoryOptions}
          onSearchTermChange={setSearchTerm}
          onCategoryFilterChange={setCategoryFilter}
          onEtaStartDateChange={setEtaStartDate}
          onEtaEndDateChange={setEtaEndDate}
          onOperationFilterChange={setOperationFilter}
          onClearAllFilters={() => {
            setSearchTerm('')
            setCategoryFilter('Todos')
            setEtaStartDate('')
            setEtaEndDate('')
            setOperationFilter('Todos')
          }}
          onSelectProcess={handleSelectProcess}
          onImport={isAdmin ? () => setIsImportOpen(true) : undefined}
          onExport={async () => {
            try {
              const exportedCount = await exportProcessesToXlsx(filteredProcesses)
              toast.success(`Exportados ${exportedCount} processos para Excel.`)
            } catch (error) {
              console.error('Falha ao exportar processos.', error)
              toast.error('Não foi possível exportar os processos.')
            }
          }}
        />
      ) : null}

      {isAdmin ? (
        <ImportProcessesModal
          open={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          existingProcessNumbers={existingProcessNumbers}
          onConfirm={handleImportProcesses}
        />
      ) : null}

      {(viewMode === 'create' || viewMode === 'edit') && isAdmin ? (
        <ProcessForm
          viewMode={viewMode}
          draft={draft}
          editTab={editTab}
          isSaving={isSaving}
          isImportingItems={isImportingItems}
          canShowMaritimeFlow={canShowMaritimeFlow}
          canShowAirFlow={canShowAirFlow}
          itemsFileInputRef={itemsFileInputRef}
          channelOptions={channelOptions}
          collectionStatusOptions={collectionStatusOptions}
          dtaStatusOptions={dtaStatusOptions}
          duimpStatusOptions={duimpStatusOptions}
          mapaStatusOptions={mapaStatusOptions}
          processCategoryOptions={processCategoryOptions}
          processStatusOptions={processStatusOptions}
          onDraftChange={handleDraftChange}
          onSetViewModeList={() => setViewMode('list')}
          onSetEditTab={setEditTab}
          onSave={handleSaveProcess}
          onImportItemsFile={handleImportItemsFile}
          onAddItem={handleAddItem}
          onItemChange={handleItemChange}
          onRemoveItem={handleRemoveItem}
          onClickCapture={handlePostReceiptDetailClick}
        />
      ) : null}

      {viewMode === 'collection-status-edit' && selectedProcess && canEditCollectionStatus ? (
        <CollectionStatusEditView
          process={selectedProcess}
          collectionStatus={draft.collectionStatus}
          isAdmin={isAdmin}
          isSaving={isSaving}
          onStatusChange={(value) => handleDraftChange('collectionStatus', value)}
          onSave={handleSaveCollectionStatus}
          onClose={handleCloseCollectionStatusEditMode}
        />
      ) : null}

      {viewMode === 'post-receipt-edit' && selectedProcess && canEditPostReceiptNotes ? (
        <PostReceiptEditView
          selectedProcess={selectedProcess}
          draft={draft}
          draftPostReceiptImages={draftPostReceiptImages}
          isSaving={isSaving}
          isUploadingPostReceiptImages={isUploadingPostReceiptImages}
          isAdmin={isAdmin}
          onDraftChange={handleDraftChange}
          onClose={handleClosePostReceiptEditMode}
          onSave={handleSavePostReceiptNotes}
          onImagesUpload={handlePostReceiptImagesUpload}
          onRemoveImage={handleRemovePostReceiptImage}
        />
      ) : null}

      {viewMode === 'detail' && selectedProcess ? (
        <ProcessDetailView
          selectedProcess={selectedProcess}
          detailTab={detailTab}
          isAdmin={isAdmin}
          isSaving={isSaving}
          favoriteProcessIds={favoriteProcessIds}
          canEditPostReceiptNotes={canEditPostReceiptNotes}
          canEditSelectedCollectionStatus={canEditSelectedCollectionStatus}
          itemSearchTerm={itemSearchTerm}
          selectedItemName={selectedItemName}
          processMessages={processMessages}
          isLoadingMessages={isLoadingMessages}
          messageDraft={messageDraft}
          deletingMessageId={deletingMessageId}
          isSendingMessage={isSendingMessage}
          messageLimitReached={messageLimitReached}
          remainingMessages={remainingMessages}
          hasUnlimitedMessages={hasUnlimitedMessages}
          visibleProcessItems={visibleProcessItems}
          relatedActiveProcesses={relatedActiveProcesses}
          selectedProcessPostReceiptImages={selectedProcessPostReceiptImages}
          profile={profile}
          itemsSectionRef={itemsSectionRef}
          onDetailTabChange={handleDetailTabChange}
          onSetItemSearchTerm={setItemSearchTerm}
          onMessageDraftChange={setMessageDraft}
          onOpenRelatedItemTab={handleOpenRelatedItemTab}
          onOpenProcessDetail={handleOpenProcessDetail}
          onToggleFavorite={toggleFavoriteProcess}
          onSetViewModeList={() => setViewMode('list')}
          onEditMode={handleEditMode}
          onPostReceiptEditMode={handlePostReceiptEditMode}
          onCollectionStatusEditMode={handleCollectionStatusEditMode}
          onOpenPostReceiptGallery={handleOpenPostReceiptGallery}
          onDeleteProcess={handleDeleteProcess}
          onSendMessage={handleSendMessage}
          onDeleteMessage={handleDeleteMessage}
        />
      ) : null}
      ) : null}

      {isPostReceiptGalleryOpen ? (
        <PostReceiptGallery
          image={selectedPostReceiptImage}
          index={selectedPostReceiptImageIndex}
          images={selectedProcessPostReceiptImages}
          onClose={handleClosePostReceiptGallery}
          onNavigate={handleNavigatePostReceiptGallery}
          onTouchStart={handlePostReceiptGalleryTouchStart}
          onTouchEnd={handlePostReceiptGalleryTouchEnd}
        />
      ) : null}
    </section>
  )
}

