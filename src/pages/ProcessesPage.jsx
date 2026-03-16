import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import {
  channelOptions,
  collectionStatusOptions,
  deleteProcess,
  dtaStatusOptions,
  duimpStatusOptions,
  listProcesses,
  mapaStatusOptions,
  processCategoryOptions,
  saveProcessPostReceiptNotes,
  saveProcess,
} from '../services/processesRepository'
import {
  createProcessMessage,
  listProcessMessages,
} from '../services/processMessagesRepository'
import { createProcessMessageNotifications } from '../services/notificationsRepository'
import {
  getProcessStatusTone,
  isProcessStatusFinalized,
  processStatusOptions,
} from '../features/processes/processStatus'
import { getEstimatedDeliveryDate } from '../utils/deliveryForecast'
import { read, utils } from 'xlsx'

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
  postReceiptNotes: '',
  items: [{ id: `ITEM-${Date.now()}`, commercialName: '', quantity: 0 }],
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
})

const isRestrictedCategory = (category) => ['FCL', 'LCL', 'AEREO'].includes(category)
const isMaritimeCategory = (category) => ['FCL', 'LCL', 'CONSOLIDADO'].includes(category)
const isAirCategory = (category) => category === 'AEREO'
const shouldShowContainerQuantity = (category) => category !== 'AEREO' && category !== 'LCL'
const isEtaReached = (eta) => eta && eta <= new Date().toISOString().slice(0, 10)

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

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getEstimatedDeliveryLabel(process) {
  return formatDate(getEstimatedDeliveryDate(process.eta, process.category))
}

function canShowProcessName(process, isAdmin) {
  return isAdmin || !isRestrictedCategory(process.category)
}

function getProcessTitle(process, isAdmin) {
  return canShowProcessName(process, isAdmin) ? process.name : `PO: ${process.processNumber || '-'}`
}

function getProcessSubtitle(process, isAdmin) {
  return canShowProcessName(process, isAdmin) && process.processNumber ? `PO: ${process.processNumber}` : ''
}

function getChannelToneClass(channel) {
  if (channel === 'Verde') return 'detail-card--success'
  if (channel === 'Amarelo') return 'detail-card--warning'
  if (channel === 'Vermelho') return 'detail-card--danger'
  if (channel === 'Cinza') return 'detail-card--neutral'
  return ''
}

function getStatusTagClass(status) {
  return `status-tag status-tag--${getProcessStatusTone(status)}`
}

function keepsCollectionSchedule(status) {
  return (
    status === 'Coleta Agendada' ||
    status === 'Veiculo no CD para descarga' ||
    status === 'Carga recebida'
  )
}

function shouldEditCollectionSchedule(status) {
  return status === 'Coleta Agendada'
}

function shouldEditMapaInspection(status) {
  return status === 'Vistoria agendada, aguardando realizacao'
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

function isDtaLoadingScheduled(status) {
  return normalizeDtaStatus(status) === 'carregamento programado'
}

function isDtaTransitCompleted(status) {
  return normalizeDtaStatus(status) === 'transito concluido'
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

function normalizeSpreadsheetHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function extractItemsFromWorksheet(file) {
  return file.arrayBuffer().then((buffer) => {
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
}

function sanitizeCustoms(draft) {
  if (!draft.cargoPresenceInformed) {
    return {
      ...draft,
      duimpStatus: '',
      parameterizationChannel: '',
      collectionStatus: '',
      collectionScheduledAt: '',
    }
  }
  if (draft.duimpStatus !== 'Parametrizada') {
    return { ...draft, parameterizationChannel: '', collectionStatus: '', collectionScheduledAt: '' }
  }
  if (isMaritimeCategory(draft.category) && !mapaAllowsCollection(draft.mapaStatus)) {
    return { ...draft, collectionStatus: '', collectionScheduledAt: '' }
  }
  if (draft.parameterizationChannel !== 'Verde') {
    return { ...draft, collectionStatus: '', collectionScheduledAt: '' }
  }
  if (!keepsCollectionSchedule(draft.collectionStatus)) {
    return { ...draft, collectionScheduledAt: '' }
  }
  return draft
}

function sanitizeMapa(draft) {
  if (draft.category !== 'FCL' && draft.category !== 'LCL' && draft.category !== 'CONSOLIDADO') {
    return { ...draft, mapaStatus: '', mapaInspectionScheduledAt: '' }
  }
  if (draft.mapaStatus !== 'Vistoria agendada, aguardando realizacao') {
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
        collectionScheduledAt: '',
      }
    }
    return sanitizeCustoms(next)
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
        collectionScheduledAt: '',
      }
    }
    if (!isDtaLoadingScheduled(next.dtaStatus)) {
      next.dtaLoadingScheduledAt = ''
      next.dtaArrivalAtItajai = ''
    }
    if (!isDtaTransitCompleted(next.dtaStatus)) next.cargoPresenceInformed = false
    return sanitizeCustoms(next)
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
    collectionScheduledAt: '',
  }
}

function ProcessMessagesPanel({
  messages,
  isLoading,
  messageDraft,
  onMessageDraftChange,
  onSubmit,
  isSending,
  currentUserName,
}) {
  return (
    <div className="detail-card">
      <div className="card-heading process-detail-card-heading">
        <div>
          <span className="detail-label">Mensagens para dúvidas</span>
          <p>Histórico vinculado ao processo.</p>
        </div>
        <span className="inline-badge">{messages.length} mensagens</span>
      </div>

      <div className="process-messages-list">
        {isLoading ? (
          <div className="empty-state">
            <strong>Carregando mensagens</strong>
            <p>Buscando o histórico deste processo.</p>
          </div>
        ) : messages.length > 0 ? (
          messages.map((message) => (
            <article key={message.id} className="process-message-card">
              <div className="process-message-card__meta">
                <strong>{message.authorName}</strong>
                <span>{formatDateTime(message.createdAt)}</span>
              </div>
              <p>{message.content}</p>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <strong>Nenhuma dúvida registrada</strong>
            <p>As interações do processo passam a ficar salvas neste histórico.</p>
          </div>
        )}
      </div>

      <label className="field">
        <span>Nova mensagem</span>
        <textarea
          className="text-input text-area"
          value={messageDraft}
          onChange={(event) => onMessageDraftChange(event.target.value)}
          placeholder={`Escreva uma dúvida ou atualização como ${currentUserName}.`}
        />
      </label>

      <div className="action-row">
        <button type="button" className="primary-button" onClick={onSubmit} disabled={isSending}>
          {isSending ? 'Enviando...' : 'Registrar mensagem'}
        </button>
      </div>
    </div>
  )
}

export default function ProcessesPage() {
  const location = useLocation()
  const { profile, toggleFavoriteProcess } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const canEditPostReceiptNotes = isAdmin || profile?.role === 'logistica'
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
  const [error, setError] = useState('')
  const [messagesError, setMessagesError] = useState('')
  const [processMessages, setProcessMessages] = useState([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [isImportingItems, setIsImportingItems] = useState(false)
  const [messageDraft, setMessageDraft] = useState('')
  const itemsSectionRef = useRef(null)
  const itemsFileInputRef = useRef(null)

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

  const filteredProcesses = useMemo(() => {
    return processes
      .filter((item) => {
        const query = searchTerm.trim().toLowerCase()
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
        return [
          item.id,
          visibleName,
          item.destination,
          item.processNumber,
          item.category,
          item.eta,
          item.etd,
          item.processStatus,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)
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
  const canShowMaritimeFlow =
    viewMode === 'edit' && isMaritimeCategory(draft.category) && isEtaReached(draft.eta)
  const canShowAirFlow = viewMode === 'edit' && isAirCategory(draft.category) && isEtaReached(draft.eta)

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
    setDraft({
      ...selectedProcess,
      items:
        selectedProcess.items?.length > 0
          ? selectedProcess.items
          : [{ id: `ITEM-${Date.now()}`, commercialName: '', quantity: 0 }],
    })
    setViewMode('post-receipt-edit')
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
      const saved = await saveProcess(payload, profile)
      await refreshProcesses(saved.id)
      setDraft(saved)
      setViewMode('detail')
      setDetailTab('general')
      setEditTab('general')
    } catch (saveError) {
      setError(buildActionErrorMessage('Não foi possível salvar o processo.', saveError))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSavePostReceiptNotes() {
    if (!canEditPostReceiptNotes || !selectedProcess) return
    setIsSaving(true)
    setError('')

    try {
      const saved = await saveProcessPostReceiptNotes(
        selectedProcess.id,
        String(draft.postReceiptNotes ?? '').trim(),
        profile
      )
      await refreshProcesses(saved.id)
      setDraft(saved)
      setViewMode('detail')
      setDetailTab('process')
    } catch (saveError) {
      setError(
        buildActionErrorMessage(
          'Não foi possível salvar as observações pós-recebimento da carga.',
          saveError
        )
      )
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
    setDetailTab('items')
    window.setTimeout(() => {
      itemsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  async function handleSendMessage() {
    if (!selectedProcess?.id || !profile) return

    setIsSendingMessage(true)
    setMessagesError('')
    try {
      const createdMessage = await createProcessMessage(
        selectedProcess.id,
        {
          content: messageDraft,
        },
        profile
      )
      await createProcessMessageNotifications({
        actor: profile,
        process: selectedProcess,
        message: createdMessage,
        existingMessages: processMessages,
      })
      const refreshedMessages = await listProcessMessages(selectedProcess.id)
      setProcessMessages(refreshedMessages)
      setMessageDraft('')
    } catch (sendError) {
      setMessagesError(buildActionErrorMessage('Não foi possível registrar a mensagem.', sendError))
    } finally {
      setIsSendingMessage(false)
    }
  }

  return (
    <section className="surface">
      <div className="section-heading">
        <div>
          <h2>Fila de processos</h2>
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
        <article className="list-card" style={{ marginTop: '16px' }}>
        <div className="card-heading">
          <div>
            <h3>Processos</h3>
          </div>
          <div className="admin-toolbar">
            <span className="inline-badge">{filteredProcesses.length} visíveis</span>
            {viewMode !== 'list' ? (
              <button type="button" className="ghost-button" onClick={() => setViewMode('list')}>
                Mostrar lista
              </button>
            ) : null}
          </div>
        </div>

        <div className="process-filters">
          <label className="field">
            <span>Buscar processo</span>
            <input
              className="text-input"
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Nome, destino, categoria, PO, ETA, ETD, status ou ID"
            />
          </label>
          <label className="field field--compact">
            <span>Categoria</span>
            <select
              className="text-input"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="Todos">Todas</option>
              {processCategoryOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>Período de ETA</span>
            <div className="process-date-range">
              <input
                className="text-input"
                type="date"
                value={etaStartDate}
                onChange={(event) => setEtaStartDate(event.target.value)}
              />
              <input
                className="text-input"
                type="date"
                value={etaEndDate}
                min={etaStartDate || undefined}
                onChange={(event) => setEtaEndDate(event.target.value)}
              />
            </div>
          </div>
          <label className="field">
            <span>Etapa operacional</span>
            <select
              className="text-input"
              value={operationFilter}
              onChange={(event) => setOperationFilter(event.target.value)}
            >
              <option value="Todos">Todas</option>
              <option value="Pós-chegada pendente">Pós-chegada pendente</option>
              <option value="Aguardando presença de carga">Aguardando presença de carga</option>
              <option value="DTA em andamento">DTA em andamento</option>
              <option value="DUIMP pendente">DUIMP pendente</option>
              <option value="Coleta pendente">Coleta pendente</option>
              <option value="Coleta agendada">Coleta agendada</option>
            </select>
          </label>
        </div>

        <div className="process-list process-list--scroll">
          {isLoading ? (
            <div className="empty-state">
              <strong>Carregando processos</strong>
              <p>Buscando os dados disponíveis no repositório configurado.</p>
            </div>
          ) : filteredProcesses.length > 0 ? (
            filteredProcesses.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`process-item process-item--button${selectedProcessId === item.id ? ' process-item--selected' : ''}`}
                onClick={() => handleSelectProcess(item.id)}
              >
                <div className="process-item__main">
                  <strong>{getProcessTitle(item, isAdmin)}</strong>
                  {getProcessSubtitle(item, isAdmin) ? <p>{getProcessSubtitle(item, isAdmin)}</p> : null}
                  <div className="process-item__line">{item.category}</div>
                  <div className="process-item__line">
                    {getDestinationLabel(item.category)}: {item.destination || '-'}
                  </div>
                    <div className="process-item__chips">
                      <span className={getStatusTagClass(item.processStatus)}>{item.processStatus}</span>
                      {shouldShowContainerQuantity(item.category) ? (
                        <span className="inline-badge">
                          {formatCargoUnit(item.containerQuantity, 'container', 'containers')}
                        </span>
                      ) : null}
                      <span className="inline-badge">
                        {formatCargoUnit(item.palletQuantity, 'pallet', 'pallets')}
                      </span>
                    </div>
                </div>
                <div className="process-item__meta">
                  <span>ETD: {formatDate(item.etd)}</span>
                  <span>ETA: {formatDate(item.eta)}</span>
                  <span>Previsão de entrega: {getEstimatedDeliveryLabel(item)}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="empty-state">
              <strong>Nenhum processo encontrado</strong>
              <p>Ajuste a busca ou cadastre um novo processo.</p>
            </div>
          )}
        </div>
        </article>
      ) : null}

      {(viewMode === 'create' || viewMode === 'edit') && isAdmin ? (
        <article className="list-card" style={{ marginTop: '16px' }}>
          <div className="card-heading">
            <div>
              <h3>{viewMode === 'create' ? 'Criar processo' : 'Editar processo'}</h3>
            </div>
            <div className="admin-toolbar">
              <span className="inline-badge">{draft.category || 'Sem categoria'}</span>
              <button type="button" className="ghost-button" onClick={() => setViewMode('list')}>
                Voltar para lista
              </button>
            </div>
          </div>

          <div className="tab-row">
            <button
              type="button"
              className={`tab-button${editTab === 'general' ? ' tab-button--active' : ''}`}
              onClick={() => setEditTab('general')}
            >
              Geral
            </button>
            <button
              type="button"
              className={`tab-button${editTab === 'items' ? ' tab-button--active' : ''}`}
              onClick={() => setEditTab('items')}
            >
              Itens
            </button>
          </div>

          <div className="detail-stack tab-panel-spacing">
            {editTab === 'general' ? (
              <>
            <label className="field">
              <span>Nome do processo</span>
              <input className="text-input" type="text" value={draft.name} onChange={(event) => handleDraftChange('name', event.target.value)} placeholder="Ex.: Importação Atlas" />
            </label>

            <div className="detail-card detail-card--split">
              <label className="field">
                <span>Categoria</span>
                <select className="text-input" value={draft.category} onChange={(event) => handleDraftChange('category', event.target.value)}>
                  {processCategoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Destino</span>
                <input className="text-input" type="text" value={draft.destination} onChange={(event) => handleDraftChange('destination', event.target.value)} placeholder="Porto ou aeroporto de destino" />
              </label>
            </div>

            {draft.category !== 'CONSOLIDADO' ? (
              <label className="field">
                <span>Código do processo</span>
                <input className="text-input" type="text" value={draft.processNumber} onChange={(event) => handleDraftChange('processNumber', event.target.value)} placeholder="Número do processo" />
              </label>
            ) : null}

            <div className="detail-card detail-card--split">
              <label className="field"><span>ETD</span><input className="text-input" type="date" value={draft.etd} onChange={(event) => handleDraftChange('etd', event.target.value)} /></label>
              <label className="field"><span>ETA</span><input className="text-input" type="date" value={draft.eta} onChange={(event) => handleDraftChange('eta', event.target.value)} /></label>
            </div>

            <div className="detail-card detail-card--split">
              <label className="field">
                <span>Status do processo</span>
                <select className="text-input" value={draft.processStatus} onChange={(event) => handleDraftChange('processStatus', event.target.value)}>
                  {processStatusOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <div className="detail-card detail-card--soft">
                <span className="detail-label">Leitura rápida</span>
                <span className={getStatusTagClass(draft.processStatus)}>{draft.processStatus}</span>
              </div>
            </div>

            <div className="detail-card detail-card--split">
              <label className="field"><span>Quantidade de containers</span><input className="text-input" type="number" min="0" value={draft.containerQuantity} onChange={(event) => handleDraftChange('containerQuantity', event.target.value)} /></label>
              <label className="field"><span>Quantidade de pallets</span><input className="text-input" type="number" min="0" value={draft.palletQuantity} onChange={(event) => handleDraftChange('palletQuantity', event.target.value)} /></label>
            </div>

            <label className="field">
              <span>Observações do processo</span>
              <textarea className="text-input text-area" value={draft.processNotes} onChange={(event) => handleDraftChange('processNotes', event.target.value)} placeholder="Informações operacionais relevantes do processo." />
            </label>

            {viewMode === 'edit' && draft.etaOriginal ? <div className="detail-card"><span className="detail-label">ETA original</span><p>{formatDate(draft.etaOriginal)}</p></div> : null}

            {viewMode === 'edit' && isMaritimeCategory(draft.category) ? (
              <div className="detail-card">
                <span className="detail-label">MAPA</span>
                <label className="field">
                  <span>Status</span>
                  <select className="text-input" value={draft.mapaStatus} onChange={(event) => handleDraftChange('mapaStatus', event.target.value)}>
                    <option value="">Selecione o status</option>
                    {mapaStatusOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                {shouldEditMapaInspection(draft.mapaStatus) ? <label className="field"><span>Vistoria agendada para</span><input className="text-input" type="datetime-local" value={draft.mapaInspectionScheduledAt} onChange={(event) => handleDraftChange('mapaInspectionScheduledAt', event.target.value)} /></label> : null}
              </div>
            ) : null}

            {canShowMaritimeFlow ? (
              <div className="detail-card">
                <span className="detail-label">Pós-atracação</span>
                <div className="checkbox-grid">
                  <label className="checkbox-field"><input type="checkbox" checked={draft.berthed} onChange={(event) => handleDraftChange('berthed', event.target.checked)} /><span>Atracou?</span></label>
                  {draft.berthed ? <label className="checkbox-field"><input type="checkbox" checked={draft.cargoPresenceInformed} onChange={(event) => handleDraftChange('cargoPresenceInformed', event.target.checked)} /><span>Presença de carga informada?</span></label> : null}
                </div>
                {draft.cargoPresenceInformed ? <label className="field"><span>DUIMP</span><select className="text-input" value={draft.duimpStatus} onChange={(event) => handleDraftChange('duimpStatus', event.target.value)}><option value="">Selecione o status</option>{duimpStatusOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : null}
                {draft.duimpStatus === 'Parametrizada' ? <label className="field"><span>Canal da parametrização</span><select className="text-input" value={draft.parameterizationChannel} onChange={(event) => handleDraftChange('parameterizationChannel', event.target.value)}><option value="">Selecione o canal</option>{channelOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : null}
                {draft.parameterizationChannel === 'Verde' && mapaAllowsCollection(draft.mapaStatus) ? <label className="field"><span>Coleta</span><select className="text-input" value={draft.collectionStatus} onChange={(event) => handleDraftChange('collectionStatus', event.target.value)}><option value="">Selecione o status</option>{collectionStatusOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : null}
                {shouldEditCollectionSchedule(draft.collectionStatus) ? <><label className="field"><span>Janela agendada</span><input className="text-input" type="datetime-local" value={draft.collectionScheduledAt} onChange={(event) => handleDraftChange('collectionScheduledAt', event.target.value)} /></label>{draft.collectionScheduledAt ? <div className="collection-window-card"><div><span className="detail-label">Janela de coleta</span><p>{formatDateTime(draft.collectionScheduledAt)}</p></div></div> : null}</> : null}
                {draft.collectionStatus && keepsCollectionSchedule(draft.collectionStatus) && !shouldEditCollectionSchedule(draft.collectionStatus) ? <div className="detail-card"><span className="detail-label">Coleta</span><p>{draft.collectionStatus}</p></div> : null}
              </div>
            ) : null}

            {canShowAirFlow ? (
              <div className="detail-card">
                <span className="detail-label">Pós-chegada</span>
                <div className="checkbox-grid"><label className="checkbox-field"><input type="checkbox" checked={draft.arrived} onChange={(event) => handleDraftChange('arrived', event.target.checked)} /><span>Chegou?</span></label></div>
                {draft.arrived ? <label className="field"><span>DTA</span><select className="text-input" value={draft.dtaStatus} onChange={(event) => handleDraftChange('dtaStatus', event.target.value)}><option value="">Selecione o status</option>{dtaStatusOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : null}
                {isDtaLoadingScheduled(draft.dtaStatus) ? <div className="detail-card detail-card--split"><label className="field"><span>Previsão do carregamento da DTA</span><input className="text-input" type="datetime-local" value={draft.dtaLoadingScheduledAt} onChange={(event) => handleDraftChange('dtaLoadingScheduledAt', event.target.value)} /></label><label className="field"><span>Previsão de chegada em Itajaí</span><input className="text-input" type="datetime-local" value={draft.dtaArrivalAtItajai} onChange={(event) => handleDraftChange('dtaArrivalAtItajai', event.target.value)} /></label></div> : null}
                {isDtaTransitCompleted(draft.dtaStatus) ? <label className="checkbox-field"><input type="checkbox" checked={draft.cargoPresenceInformed} onChange={(event) => handleDraftChange('cargoPresenceInformed', event.target.checked)} /><span>Presença de carga informada?</span></label> : null}
                {draft.cargoPresenceInformed ? <label className="field"><span>DUIMP</span><select className="text-input" value={draft.duimpStatus} onChange={(event) => handleDraftChange('duimpStatus', event.target.value)}><option value="">Selecione o status</option>{duimpStatusOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : null}
                {draft.duimpStatus === 'Parametrizada' ? <label className="field"><span>Canal da parametrização</span><select className="text-input" value={draft.parameterizationChannel} onChange={(event) => handleDraftChange('parameterizationChannel', event.target.value)}><option value="">Selecione o canal</option>{channelOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : null}
                {draft.parameterizationChannel === 'Verde' ? <label className="field"><span>Coleta</span><select className="text-input" value={draft.collectionStatus} onChange={(event) => handleDraftChange('collectionStatus', event.target.value)}><option value="">Selecione o status</option>{collectionStatusOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : null}
                {shouldEditCollectionSchedule(draft.collectionStatus) ? <><label className="field"><span>Janela agendada</span><input className="text-input" type="datetime-local" value={draft.collectionScheduledAt} onChange={(event) => handleDraftChange('collectionScheduledAt', event.target.value)} /></label>{draft.collectionScheduledAt ? <div className="collection-window-card"><div><span className="detail-label">Janela de coleta</span><p>{formatDateTime(draft.collectionScheduledAt)}</p></div></div> : null}</> : null}
                {draft.collectionStatus && keepsCollectionSchedule(draft.collectionStatus) && !shouldEditCollectionSchedule(draft.collectionStatus) ? <div className="detail-card"><span className="detail-label">Coleta</span><p>{draft.collectionStatus}</p></div> : null}
              </div>
            ) : null}
              </>
            ) : null}

            {editTab === 'items' ? (
              <div className="detail-card">
                <div className="card-heading process-detail-card-heading">
                  <div>
                    <span className="detail-label">Itens do processo</span>
                    <p>Nome comercial e quantidade vinculados ao processo. A importação aceita planilhas Excel com colunas de nome e quantidade.</p>
                  </div>
                  <div className="admin-toolbar">
                    <input
                      ref={itemsFileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleImportItemsFile}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => itemsFileInputRef.current?.click()}
                      disabled={isImportingItems}
                    >
                      {isImportingItems ? 'Importando planilha...' : 'Importar planilha'}
                    </button>
                    <button type="button" className="ghost-button" onClick={handleAddItem}>Adicionar item</button>
                  </div>
                </div>

                <div className="process-items-editor">
                  {(draft.items ?? []).map((item) => (
                    <div key={item.id} className="detail-card detail-card--split">
                      <label className="field">
                        <span>Nome comercial</span>
                        <input className="text-input" type="text" value={item.commercialName} onChange={(event) => handleItemChange(item.id, 'commercialName', event.target.value)} placeholder="Ex.: Resina Atlas" />
                      </label>
                      <div className="process-item-editor__actions">
                        <label className="field">
                          <span>Quantidade</span>
                          <input className="text-input" type="number" min="0" value={item.quantity} onChange={(event) => handleItemChange(item.id, 'quantity', event.target.value)} />
                        </label>
                        <button type="button" className="ghost-button" onClick={() => handleRemoveItem(item.id)}>Remover item</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="action-row"><button type="button" className="primary-button" onClick={handleSaveProcess} disabled={isSaving}>{isSaving ? 'Salvando...' : viewMode === 'create' ? 'Criar processo' : 'Salvar alteracoes'}</button></div>
        </article>
      ) : null}

      {viewMode === 'post-receipt-edit' && selectedProcess && canEditPostReceiptNotes ? (
        <article className="list-card" style={{ marginTop: '16px' }}>
          <div className="card-heading">
            <div>
              <h3>Observações pós-recebimento da carga</h3>
            </div>
            <div className="admin-toolbar">
              <span className={getStatusTagClass(selectedProcess.processStatus)}>
                {selectedProcess.processStatus}
              </span>
              <button type="button" className="ghost-button" onClick={() => setViewMode('detail')}>
                Voltar ao detalhe
              </button>
            </div>
          </div>

          <div className="detail-stack">
            <div className="detail-card">
              <span className="detail-label">Processo</span>
              <p>{getProcessTitle(selectedProcess, isAdmin)}</p>
            </div>
            <label className="field">
              <span>Observações pós-recebimento da carga no CD</span>
              <textarea
                className="text-input text-area"
                value={draft.postReceiptNotes}
                onChange={(event) => handleDraftChange('postReceiptNotes', event.target.value)}
                placeholder="Registre observações da carga após o recebimento no CD."
              />
            </label>
          </div>

          <div className="action-row">
            <button
              type="button"
              className="primary-button"
              onClick={handleSavePostReceiptNotes}
              disabled={isSaving}
            >
              {isSaving ? 'Salvando...' : 'Salvar observações'}
            </button>
          </div>
        </article>
      ) : null}

      {viewMode === 'detail' && selectedProcess ? (
        <article className="list-card" style={{ marginTop: '16px' }}>
          <div className="card-heading">
            <div><h3>Detalhe do processo</h3></div>
            <div className="admin-toolbar">
              <button type="button" className="ghost-button" onClick={() => setViewMode('list')}>Voltar para lista</button>
              <button type="button" className="ghost-button" onClick={() => toggleFavoriteProcess(selectedProcess.id)}>{favoriteProcessIds.includes(selectedProcess.id) ? 'Desfavoritar' : 'Favoritar'}</button>
              {canEditPostReceiptNotes && isProcessStatusFinalized(selectedProcess.processStatus) ? (
                <button type="button" className="ghost-button" onClick={handlePostReceiptEditMode}>
                  Editar obs. CD
                </button>
              ) : null}
              {isAdmin ? <button type="button" className="primary-button" onClick={handleEditMode}>Editar processo</button> : null}
            </div>
          </div>

          <div className="tab-row">
            <button type="button" className={`tab-button${detailTab === 'general' ? ' tab-button--active' : ''}`} onClick={() => setDetailTab('general')}>Detalhes gerais</button>
            <button type="button" className={`tab-button${detailTab === 'process' ? ' tab-button--active' : ''}`} onClick={() => setDetailTab('process')}>Processo</button>
            <button type="button" className={`tab-button${detailTab === 'items' ? ' tab-button--active' : ''}`} onClick={() => setDetailTab('items')}>Itens</button>
            <button type="button" className={`tab-button${detailTab === 'messages' ? ' tab-button--active' : ''}`} onClick={() => setDetailTab('messages')}>Mensagens</button>
          </div>

          <div className="detail-stack tab-panel-spacing">
            {detailTab === 'general' ? <><div className="detail-card"><span className="detail-label">Processo</span><p>{getProcessTitle(selectedProcess, isAdmin)}</p></div><div className="detail-card"><span className="detail-label">Categoria</span><p>{selectedProcess.category}</p></div>{selectedProcess.processNumber && canShowProcessName(selectedProcess, isAdmin) ? <div className="detail-card"><span className="detail-label">PO</span><p>{selectedProcess.processNumber}</p></div> : null}<div className="detail-card"><span className="detail-label">{getDestinationLabel(selectedProcess.category)}</span><p>{selectedProcess.destination || '-'}</p></div><div className="detail-card detail-card--split"><div><span className="detail-label">ETD</span><p>{formatDate(selectedProcess.etd)}</p></div><div><span className="detail-label">ETA</span><p>{formatDate(selectedProcess.eta)}</p></div></div>{selectedProcess.etaOriginal && selectedProcess.etaOriginal !== selectedProcess.eta ? <div className="detail-card"><span className="detail-label">ETA original</span><p>{formatDate(selectedProcess.etaOriginal)}</p></div> : null}<div className="detail-card"><div className="card-heading process-detail-card-heading"><div><span className="detail-label">Itens vinculados</span><p>{selectedProcess.items?.length ?? 0} itens cadastrados para este processo.</p></div><button type="button" className="ghost-button" onClick={handleOpenItemsTab}>Ver itens do processo</button></div></div></> : null}

            {detailTab === 'process' ? <><div className="detail-card"><div className="card-heading process-detail-card-heading"><div><span className="detail-label">Status do processo</span><p>Controle padronizado para evitar inconsistências de valor.</p></div><span className={getStatusTagClass(selectedProcess.processStatus)}>{selectedProcess.processStatus}</span></div></div><div className={`detail-card${shouldShowContainerQuantity(selectedProcess.category) ? ' detail-card--split' : ''}`}>{shouldShowContainerQuantity(selectedProcess.category) ? <div><span className="detail-label">Quantidade de containers</span><p>{formatCargoUnit(selectedProcess.containerQuantity, 'container', 'containers')}</p></div> : null}<div><span className="detail-label">Quantidade de pallets</span><p>{formatCargoUnit(selectedProcess.palletQuantity, 'pallet', 'pallets')}</p></div></div>{selectedProcess.processNotes ? <div className="detail-card"><span className="detail-label">Observações do processo</span><p>{selectedProcess.processNotes}</p></div> : null}{isProcessStatusFinalized(selectedProcess.processStatus) && selectedProcess.postReceiptNotes ? <div className="detail-card"><span className="detail-label">Observações pós-recebimento da carga</span><p>{selectedProcess.postReceiptNotes}</p></div> : null}{isMaritimeCategory(selectedProcess.category) && selectedProcess.mapaStatus ? <div className="detail-card"><span className="detail-label">MAPA</span><div className="detail-stack detail-stack--compact"><p>Status: {selectedProcess.mapaStatus}</p>{shouldEditMapaInspection(selectedProcess.mapaStatus) && selectedProcess.mapaInspectionScheduledAt ? <p>Vistoria agendada: {formatDateTime(selectedProcess.mapaInspectionScheduledAt)}</p> : null}</div></div> : null}{isMaritimeCategory(selectedProcess.category) && selectedProcess.berthed ? <div className="detail-card"><span className="detail-label">Andamento após chegada</span><p>Presença de carga informada: {selectedProcess.cargoPresenceInformed ? 'Sim' : 'Não'}</p></div> : null}{isAirCategory(selectedProcess.category) && selectedProcess.arrived ? <div className="detail-card"><span className="detail-label">Pós-chegada</span><div className="detail-stack detail-stack--compact">{selectedProcess.dtaStatus ? <p>DTA: {selectedProcess.dtaStatus}</p> : null}{selectedProcess.dtaLoadingScheduledAt ? <p>Carregamento DTA: {formatDateTime(selectedProcess.dtaLoadingScheduledAt)}</p> : null}{selectedProcess.dtaArrivalAtItajai ? <p>Chegada prevista em Itajaí: {formatDateTime(selectedProcess.dtaArrivalAtItajai)}</p> : null}{isDtaTransitCompleted(selectedProcess.dtaStatus) ? <p>Presença de carga informada: {selectedProcess.cargoPresenceInformed ? 'Sim' : 'Não'}</p> : null}</div></div> : null}{(isMaritimeCategory(selectedProcess.category) || isAirCategory(selectedProcess.category)) && selectedProcess.duimpStatus ? <div className={`detail-card ${getChannelToneClass(selectedProcess.parameterizationChannel)}`.trim()}><span className="detail-label">DUIMP</span><div className="detail-stack detail-stack--compact"><p>Status: {selectedProcess.duimpStatus}</p>{selectedProcess.parameterizationChannel ? <p>Canal da parametrização: {selectedProcess.parameterizationChannel}</p> : null}</div></div> : null}{(isMaritimeCategory(selectedProcess.category) || isAirCategory(selectedProcess.category)) && selectedProcess.collectionStatus === 'Coleta Agendada' && selectedProcess.collectionScheduledAt ? <div className="collection-window-card collection-window-card--detail"><div><span className="detail-label">Janela de coleta</span><p>{formatDateTime(selectedProcess.collectionScheduledAt)}</p></div></div> : null}{(isMaritimeCategory(selectedProcess.category) || isAirCategory(selectedProcess.category)) && selectedProcess.collectionStatus ? <div className="detail-card"><span className="detail-label">Coleta</span><p>{selectedProcess.collectionStatus}</p></div> : null}</> : null}

            {detailTab === 'items' ? <div ref={itemsSectionRef} className="detail-card"><div className="card-heading process-detail-card-heading"><div><span className="detail-label">Itens do processo</span><p>Itens comerciais vinculados diretamente a este processo.</p></div><span className="inline-badge">{selectedProcess.items?.length ?? 0} itens</span></div><div className="process-items-list">{selectedProcess.items?.length > 0 ? selectedProcess.items.map((item) => <div key={item.id} className="metric-card metric-card--stacked"><div className="process-item-display"><span className="detail-label">Nome comercial:</span><strong>{item.commercialName}</strong></div><div className="process-item-display"><span className="detail-label">Quantidade:</span><strong>{item.quantity}</strong></div></div>) : <div className="empty-state"><strong>Nenhum item cadastrado</strong><p>Os itens vinculados ao processo aparecerão aqui.</p></div>}</div></div> : null}

            {detailTab === 'messages' ? <ProcessMessagesPanel messages={processMessages} isLoading={isLoadingMessages} messageDraft={messageDraft} onMessageDraftChange={setMessageDraft} onSubmit={handleSendMessage} isSending={isSendingMessage} currentUserName={profile?.name ?? profile?.email ?? 'usuario'} /> : null}

            {isAdmin ? <div className="action-row"><button type="button" className="ghost-button" onClick={handleDeleteProcess} disabled={isSaving}>Excluir processo</button></div> : null}
          </div>
        </article>
      ) : null}
    </section>
  )
}
