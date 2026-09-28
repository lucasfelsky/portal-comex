import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDateTime } from '../../utils/dateFormat'
import { getFriendlyErrorDetail } from '../../utils/errorMessages'
import { isFirebaseConfigured } from '../../lib/firebase'
import {
  deleteProcessDocument,
  getProcessDocumentDownloadUrl,
  listProcessDocuments,
  uploadProcessDocument,
} from '../../services/processDocumentsRepository'
import ConfirmDialog from '../../components/ConfirmDialog'
import Skeleton from '../../components/Skeleton'
import Icon from '../../components/Icon'
import {
  CONTAINER_WASH_CATEGORIES,
  MAX_DOCUMENT_MB,
  buildDocumentSlotKey,
  canDeleteDocument,
  canUploadDocumentType,
  formatDocumentSize,
  getDocumentFileKindLabel,
  getDocumentTypeLabel,
  getUnlinkedDocumentGroups,
  groupDocumentsBySlot,
} from './processDocuments'
import { CONTAINER_TYPE_OPTIONS } from './containers'
import { getProcessPurchaseOrders } from './purchaseOrders'

// F18b-2 (design aprovado - canvas Claude Design M8NdiBoZfvbmJxVY5oZL6e):
// reescrita da aba "Documentos". Padroes replicados (NAO sao util
// compartilhado): `isMounted` guard em async load + `buildDocumentError`
// (variante local de `buildActionErrorMessage` com titulo/detalhe
// separados, E6 do PLAN.md).
//
// Secoes: "Documentos do processo" (BL/AWB, Relatorio de carga, Invoice/
// Packing List fora do CONSOLIDADO, "Outro"), "Invoice e Packing List por
// PO" (so CONSOLIDADO), "FISPQ por item" (so item IMO com id), "Relatorio
// de lavacao por conteiner" (so FCL/CONSOLIDADO com conteineres) e
// "Documentos sem vinculo atual".
const PROCESS_LEVEL_TYPES = ['bl', 'cargoReport']
const PO_SCOPABLE_TYPES = ['invoice', 'packingList']

function buildDocumentError(title, error) {
  console.error(title, error)
  return { title, detail: getFriendlyErrorDetail(error) }
}

// D-3: data pura `YYYY-MM-DD` - formatador local, NUNCA `toISOString()`
// (mesmo padrao de `ProcessOperationalDetails.jsx:48-53`).
function formatShortDate(value) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural
}

export default function ProcessDocumentsPanel({ process, profile, onPendingCountChange }) {
  const processId = process?.id
  const category = process?.category
  const role = profile?.role
  const isConsolidated = category === 'CONSOLIDADO'
  const purchaseOrders = isConsolidated ? getProcessPurchaseOrders(process) : []

  const [documents, setDocuments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [refreshError, setRefreshError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [rowErrors, setRowErrors] = useState({})
  const [uploadingKey, setUploadingKey] = useState('')
  const [liveMessage, setLiveMessage] = useState('')
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fileInputsRef = useRef({})
  const substituteRefs = useRef({})
  const hasLoadedOnceRef = useRef(false)
  const focusAfterUploadRef = useRef(null)

  useEffect(() => {
    let isMounted = true

    async function loadDocuments() {
      const isFirstLoad = !hasLoadedOnceRef.current
      if (isFirstLoad) {
        setIsLoading(true)
        setLoadError(null)
      } else {
        setIsRefreshing(true)
      }
      setRefreshError(null)

      try {
        const list = await listProcessDocuments(processId)
        if (!isMounted) return
        setDocuments(list)
        hasLoadedOnceRef.current = true
      } catch (error) {
        if (!isMounted) return
        const built = buildDocumentError('Não foi possível carregar os documentos.', error)
        if (isFirstLoad) setLoadError(built)
        else setRefreshError(built)
      } finally {
        if (!isMounted) return
        if (isFirstLoad) setIsLoading(false)
        else setIsRefreshing(false)
      }
    }

    loadDocuments()

    return () => {
      isMounted = false
    }
  }, [processId, reloadToken])

  const groups = useMemo(() => groupDocumentsBySlot(documents), [documents])

  function findGroup(slotKey) {
    return groups.find((group) => group.slotKey === slotKey) ?? null
  }

  const otherDocuments = useMemo(
    () => documents.filter((document) => document.type === 'other'),
    [documents]
  )

  const allItems = Array.isArray(process?.items) ? process.items : []
  const imoItems = useMemo(
    () => allItems.filter((item) => item?.dangerousGoods === true && typeof item?.id === 'string' && item.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [process]
  )
  const nonImoCount = allItems.length - imoItems.length
  const showFispqSection = imoItems.length > 0

  const allContainers = Array.isArray(process?.containers) ? process.containers : []
  const washContainers = CONTAINER_WASH_CATEGORIES.includes(category) ? allContainers : []
  const showWashSection = washContainers.length > 0

  const unlinkedGroups = useMemo(
    () => getUnlinkedDocumentGroups(groups, process, purchaseOrders),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, process, purchaseOrders]
  )

  function getWashRowState(container) {
    const slotKey = buildDocumentSlotKey('containerWash', { containerId: container.id })
    const group = findGroup(slotKey)
    const hasDoc = Boolean(group?.primary)
    const isReturned = Boolean(String(container?.returnedAt ?? '').trim())
    const state = hasDoc ? 'sent' : isReturned ? 'pending' : 'not-required'
    return { state, group, slotKey, isReturned }
  }

  const pendentesCount = useMemo(() => {
    let count = 0
    if (showFispqSection) {
      for (const item of imoItems) {
        const group = findGroup(buildDocumentSlotKey('fispq', { itemId: item.id }))
        if (!group?.primary) count += 1
      }
    }
    if (showWashSection) {
      for (const container of washContainers) {
        if (getWashRowState(container).state === 'pending') count += 1
      }
    }
    return count
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, imoItems, washContainers, showFispqSection, showWashSection])

  const enviadosCount = useMemo(() => {
    let count = 0
    for (const type of PROCESS_LEVEL_TYPES) {
      if (findGroup(buildDocumentSlotKey(type))?.primary) count += 1
    }
    for (const type of PO_SCOPABLE_TYPES) {
      if (!isConsolidated) {
        if (findGroup(buildDocumentSlotKey(type, { category }))?.primary) count += 1
      } else {
        for (const order of purchaseOrders) {
          if (findGroup(buildDocumentSlotKey(type, { category, po: order.po }))?.primary) count += 1
        }
      }
    }
    count += otherDocuments.length
    if (showFispqSection) {
      for (const item of imoItems) {
        if (findGroup(buildDocumentSlotKey('fispq', { itemId: item.id }))?.primary) count += 1
      }
    }
    if (showWashSection) {
      for (const container of washContainers) {
        if (getWashRowState(container).state === 'sent') count += 1
      }
    }
    return count
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, isConsolidated, category, purchaseOrders, otherDocuments, imoItems, washContainers, showFispqSection, showWashSection])

  useEffect(() => {
    if (typeof onPendingCountChange === 'function') onPendingCountChange(pendentesCount)
  }, [pendentesCount, onPendingCountChange])

  useEffect(() => {
    if (!focusAfterUploadRef.current) return
    if (isLoading || isRefreshing) return
    const key = focusAfterUploadRef.current
    focusAfterUploadRef.current = null
    substituteRefs.current[key]?.focus()
  }, [documents, isLoading, isRefreshing])

  function triggerFilePicker(key) {
    fileInputsRef.current[key]?.click()
  }

  function registerFileInput(key) {
    return (node) => {
      fileInputsRef.current[key] = node
    }
  }

  function registerSubstituteRef(key) {
    return (node) => {
      substituteRefs.current[key] = node
    }
  }

  function clearRowError(key) {
    setRowErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  async function handleUploadFile(type, slotKey, extra, file) {
    clearRowError(slotKey)
    setUploadingKey(slotKey)
    setLiveMessage(`Enviando ${file.name}…`)

    try {
      await uploadProcessDocument(processId, {
        type,
        file,
        category,
        actor: { uid: profile?.uid, name: profile?.name, role },
        ...extra,
      })
      setLiveMessage('Documento enviado.')
      focusAfterUploadRef.current = slotKey
      setReloadToken((token) => token + 1)
    } catch (error) {
      setLiveMessage('')
      setRowErrors((current) => ({
        ...current,
        [slotKey]: buildDocumentError('Não foi possível enviar o documento.', error),
      }))
    } finally {
      setUploadingKey('')
    }
  }

  async function handleDownload(document_) {
    const slotKey = document_?.slotKey
    if (slotKey) clearRowError(slotKey)
    // D8: popup SINCRONO no clique (iOS/PWA) - so' navega depois de
    // resolver a URL.
    const win = window.open('', '_blank')
    try {
      const url = await getProcessDocumentDownloadUrl(document_.storagePath)
      if (win) win.location.href = url
    } catch (error) {
      win?.close()
      if (slotKey) {
        setRowErrors((current) => ({
          ...current,
          [slotKey]: buildDocumentError('Não foi possível baixar o documento.', error),
        }))
      }
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDeleteDoc) return
    setIsDeleting(true)
    const slotKey = confirmDeleteDoc.slotKey

    try {
      await deleteProcessDocument(processId, confirmDeleteDoc.id)
      setConfirmDeleteDoc(null)
      setReloadToken((token) => token + 1)
    } catch (error) {
      setConfirmDeleteDoc(null)
      if (slotKey) {
        setRowErrors((current) => ({
          ...current,
          [slotKey]: buildDocumentError('Não foi possível excluir o documento.', error),
        }))
      }
    } finally {
      setIsDeleting(false)
    }
  }

  // E2: renderiza 1 linha (Documentos do processo / FISPQ / lavacao).
  function renderRow({
    slotKey,
    title,
    meta,
    group,
    canUpload,
    canDelete,
    uploadLabel = 'Enviar',
    emptyText = 'Nenhum arquivo enviado.',
    emptyBadgeText = 'Não enviado',
    emptyBadgeTone = 'neutral',
    presentBadgeText = 'Atual',
    showBadgeOnPresent = true,
    onUpload,
  }) {
    const primary = group?.primary ?? null
    const previous = group?.previous ?? null
    const isRowUploading = uploadingKey === slotKey
    const rowError = rowErrors[slotKey]
    const badgeClass =
      emptyBadgeTone === 'warn'
        ? 'inline-badge inline-badge--warn'
        : emptyBadgeTone === 'danger'
          ? 'inline-badge inline-badge--danger'
          : 'inline-badge documents-badge--neutral'

    return (
      <div className="documents-row" key={slotKey}>
        <span className="documents-row__icon" aria-hidden="true">
          <Icon name="file" />
        </span>
        <div className="documents-row__content">
          <strong>{title}</strong>
          {meta}
          {primary ? (
            <>
              <span>{primary.name}</span>
              <small className="field-hint">
                {[
                  getDocumentFileKindLabel(primary.mimeType, primary.name),
                  formatDocumentSize(primary.size),
                  formatDateTime(primary.uploadedAt),
                  primary.uploadedByName,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </small>
              {showBadgeOnPresent ? (
                <span className="inline-badge inline-badge--ok">{presentBadgeText}</span>
              ) : null}
            </>
          ) : (
            <>
              <span>{emptyText}</span>
              <span className={badgeClass}>
                {emptyBadgeText === 'Pendente' ? <Icon name="alert" size={14} /> : null}
                {emptyBadgeText}
              </span>
            </>
          )}
          {previous ? (
            <div className="documents-row__previous">
              <span>{`Versão anterior: ${previous.name}`}</span>
              <button type="button" className="ghost-button" onClick={() => handleDownload(previous)}>
                Baixar
              </button>
            </div>
          ) : null}
          {isRowUploading ? (
            <div className="documents-progress">
              <span
                className="documents-progress__bar"
                role="progressbar"
                aria-label={`Enviando ${title}`}
              />
              {primary ? (
                <small className="field-hint">
                  {`Ao concluir, o ${title} atual vira "versão anterior" e o mais antigo é removido.`}
                </small>
              ) : null}
            </div>
          ) : null}
          {rowError ? (
            <p role="alert" className="documents-row__error">
              <strong>{rowError.title}</strong> {rowError.detail}
            </p>
          ) : null}
        </div>
        <div className="documents-row__actions">
          {primary ? (
            <button
              type="button"
              className="documents-icon-button ghost-button"
              aria-label={`Baixar ${primary.name}`}
              title={`Baixar ${primary.name}`}
              disabled={isRowUploading}
              onClick={() => handleDownload(primary)}
            >
              <Icon name="download" />
              <span className="documents-row__action-label">Baixar</span>
            </button>
          ) : null}
          {canUpload ? (
            <>
              <input
                type="file"
                ref={registerFileInput(slotKey)}
                style={{ display: 'none' }}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) onUpload(file)
                }}
              />
              <button
                type="button"
                className={primary ? 'documents-icon-button ghost-button' : 'primary-button'}
                aria-label={primary ? `Substituir ${title}` : uploadLabel}
                title={primary ? `Substituir ${title}` : uploadLabel}
                disabled={isRowUploading}
                ref={primary ? registerSubstituteRef(slotKey) : undefined}
                onClick={() => triggerFilePicker(slotKey)}
              >
                {primary ? (
                  <>
                    <Icon name="upload" />
                    <span className="documents-row__action-label">Substituir</span>
                  </>
                ) : (
                  uploadLabel
                )}
              </button>
            </>
          ) : !primary ? (
            <span className="documents-lock">
              <Icon name="lock" />
              Somente o COMEX envia este documento
            </span>
          ) : null}
          {primary && canDelete ? (
            <button
              type="button"
              className="documents-icon-button ghost-button"
              aria-label={`Excluir ${primary.name}`}
              title={`Excluir ${primary.name}`}
              disabled={isRowUploading}
              onClick={() => setConfirmDeleteDoc(primary)}
            >
              <Icon name="trash" />
              <span className="documents-row__action-label">Excluir</span>
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  function renderPoCell(type, order) {
    const slotKey = buildDocumentSlotKey(type, { category, po: order.po })
    const group = findGroup(slotKey)
    const primary = group?.primary ?? null
    const canUpload = canUploadDocumentType(role, type)
    const isRowUploading = uploadingKey === slotKey
    const rowError = rowErrors[slotKey]

    return (
      <td key={type}>
        {primary ? (
          <div className="documents-row__cell">
            <span>{primary.name}</span>
            <small className="field-hint">
              {[
                getDocumentFileKindLabel(primary.mimeType, primary.name),
                formatDocumentSize(primary.size),
                formatShortDate(String(primary.uploadedAt ?? '').slice(0, 10)),
              ]
                .filter(Boolean)
                .join(' · ')}
            </small>
            {group?.previous ? (
              <div className="documents-row__previous">
                <span>{`Versão anterior: ${group.previous.name}`}</span>
                <button type="button" className="ghost-button" onClick={() => handleDownload(group.previous)}>
                  Baixar
                </button>
              </div>
            ) : null}
            <div className="documents-row__actions">
              <button
                type="button"
                className="documents-icon-button ghost-button"
                aria-label={`Baixar ${primary.name}`}
                title={`Baixar ${primary.name}`}
                disabled={isRowUploading}
                onClick={() => handleDownload(primary)}
              >
                <Icon name="download" />
                <span className="documents-row__action-label">Baixar</span>
              </button>
              {canUpload ? (
                <>
                  <input
                    type="file"
                    ref={registerFileInput(slotKey)}
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file) handleUploadFile(type, slotKey, { po: order.po }, file)
                    }}
                  />
                  <button
                    type="button"
                    className="documents-icon-button ghost-button"
                    aria-label={`Substituir ${getDocumentTypeLabel(type)}`}
                    title={`Substituir ${getDocumentTypeLabel(type)}`}
                    disabled={isRowUploading}
                    ref={registerSubstituteRef(slotKey)}
                    onClick={() => triggerFilePicker(slotKey)}
                  >
                    <Icon name="upload" />
                    <span className="documents-row__action-label">Substituir</span>
                  </button>
                </>
              ) : null}
              {canDeleteDocument(profile, primary) ? (
                <button
                  type="button"
                  className="documents-icon-button ghost-button"
                  aria-label={`Excluir ${primary.name}`}
                  title={`Excluir ${primary.name}`}
                  disabled={isRowUploading}
                  onClick={() => setConfirmDeleteDoc(primary)}
                >
                  <Icon name="trash" />
                  <span className="documents-row__action-label">Excluir</span>
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="documents-row__cell">
            <span className="inline-badge documents-badge--neutral">Não enviado</span>
            {canUpload ? (
              <>
                <input
                  type="file"
                  ref={registerFileInput(slotKey)}
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) handleUploadFile(type, slotKey, { po: order.po }, file)
                  }}
                />
                <button
                  type="button"
                  className="primary-button"
                  disabled={isRowUploading}
                  onClick={() => triggerFilePicker(slotKey)}
                >
                  Enviar
                </button>
              </>
            ) : (
              <span className="documents-lock">
                <Icon name="lock" />
                Somente o COMEX envia este documento
              </span>
            )}
          </div>
        )}
        {isRowUploading ? (
          <div className="documents-progress">
            <span
              className="documents-progress__bar"
              role="progressbar"
              aria-label={`Enviando ${getDocumentTypeLabel(type)} da PO ${order.po}`}
            />
          </div>
        ) : null}
        {rowError ? (
          <p role="alert" className="documents-row__error">
            <strong>{rowError.title}</strong> {rowError.detail}
          </p>
        ) : null}
      </td>
    )
  }

  if (!processId) return null

  // D9: sem Firebase configurado, o painel so mostra o estado vazio e
  // esconde upload (mesma linha de `processEventsRepository.js`,
  // server-only).
  if (!isFirebaseConfigured) {
    return (
      <div className="detail-card">
        <span className="detail-label">Documentos</span>
        <div className="empty-state" role="status">
          <strong>Documentos disponíveis apenas com o Firebase configurado</strong>
        </div>
      </div>
    )
  }

  const isEmptyDocuments = documents.length === 0
  const showLoadedContent = !isLoading && !loadError

  const missingConsolidatedCount = isConsolidated
    ? purchaseOrders.reduce((count, order) => {
        const invoiceMissing = !findGroup(buildDocumentSlotKey('invoice', { category, po: order.po }))?.primary
        const packingMissing = !findGroup(buildDocumentSlotKey('packingList', { category, po: order.po }))?.primary
        return count + (invoiceMissing ? 1 : 0) + (packingMissing ? 1 : 0)
      }, 0)
    : 0

  return (
    <div className="detail-card documents-panel">
      <div className="card-heading process-detail-card-heading documents-summary">
        <div>
          <span className="detail-label">Documentos</span>
          {showLoadedContent ? (
            isEmptyDocuments ? (
              <div className="documents-empty-state" role="status">
                <Icon name="inbox" size={28} />
                <strong>Nenhum documento ainda</strong>
                <p>
                  {role === 'logistica'
                    ? 'Os documentos enviados pelo COMEX aparecem aqui.'
                    : 'Envie BL, relatório de carga, invoice e packing list. FISPQ e lavação aparecem quando houver item IMO ou contêiner.'}
                </p>
              </div>
            ) : (
              <>
                <div className="documents-summary__badges">
                  <span className="inline-badge inline-badge--ok">
                    {`${enviadosCount} ${pluralize(enviadosCount, 'enviado', 'enviados')}`}
                  </span>
                  {pendentesCount > 0 ? (
                    <span className="inline-badge inline-badge--warn">
                      {`${pendentesCount} ${pluralize(pendentesCount, 'pendente', 'pendentes')}`}
                    </span>
                  ) : null}
                </div>
                <p className="field-hint">
                  {`Visível só para COMEX e logística · PDF, Excel, Word ou imagem até ${MAX_DOCUMENT_MB} MB`}
                </p>
              </>
            )
          ) : null}
        </div>
        <button
          type="button"
          className="documents-icon-button ghost-button"
          aria-label="Atualizar lista de documentos"
          title="Atualizar lista de documentos"
          disabled={isRefreshing}
          aria-busy={isRefreshing}
          onClick={() => setReloadToken((token) => token + 1)}
        >
          <Icon name="refresh" />
        </button>
      </div>

      {refreshError ? (
        <div className="error-banner error-banner--retry" role="alert">
          <span>
            <strong>{refreshError.title}</strong> {refreshError.detail}
          </span>
          <button type="button" className="ghost-button" onClick={() => setReloadToken((token) => token + 1)}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      <p className="documents-live" aria-live="polite">
        {liveMessage}
      </p>

      {isLoading ? (
        <div className="detail-stack detail-stack--compact" role="status" aria-label="Carregando documentos">
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>
      ) : loadError ? (
        <div className="error-banner error-banner--retry" role="alert">
          <span>
            <strong>{loadError.title}</strong> {loadError.detail}
          </span>
          <button type="button" className="ghost-button" onClick={() => setReloadToken((token) => token + 1)}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="detail-stack detail-stack--compact">
          <div className="detail-card">
            <span className="detail-label">Documentos do processo</span>
            <div className="detail-stack detail-stack--compact">
              {PROCESS_LEVEL_TYPES.map((type) => {
                const slotKey = buildDocumentSlotKey(type)
                const group = findGroup(slotKey)
                return renderRow({
                  slotKey,
                  title: getDocumentTypeLabel(type),
                  group,
                  canUpload: canUploadDocumentType(role, type),
                  canDelete: group?.primary ? canDeleteDocument(profile, group.primary) : false,
                  onUpload: (file) => handleUploadFile(type, slotKey, {}, file),
                })
              })}

              {!isConsolidated
                ? PO_SCOPABLE_TYPES.map((type) => {
                    const slotKey = buildDocumentSlotKey(type, { category })
                    const group = findGroup(slotKey)
                    return renderRow({
                      slotKey,
                      title: getDocumentTypeLabel(type),
                      group,
                      canUpload: canUploadDocumentType(role, type),
                      canDelete: group?.primary ? canDeleteDocument(profile, group.primary) : false,
                      onUpload: (file) => handleUploadFile(type, slotKey, {}, file),
                    })
                  })
                : null}

              {otherDocuments.map((document_) =>
                renderRow({
                  slotKey: document_.slotKey,
                  title: `Outro · ${document_.description || document_.name}`,
                  group: { slotKey: document_.slotKey, primary: document_, previous: null },
                  canUpload: false,
                  canDelete: canDeleteDocument(profile, document_),
                  showBadgeOnPresent: false,
                })
              )}

              {canUploadDocumentType(role, 'other') ? (
                <>
                  <input
                    type="file"
                    ref={registerFileInput('other:new')}
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file) handleUploadFile('other', 'other:new', { description: 'Documento adicional' }, file)
                    }}
                  />
                  <button
                    type="button"
                    className="ghost-button documents-add-other"
                    disabled={uploadingKey === 'other:new'}
                    onClick={() => triggerFilePicker('other:new')}
                  >
                    <Icon name="plus" /> Adicionar outro documento
                  </button>
                  {rowErrors['other:new'] ? (
                    <p role="alert" className="documents-row__error">
                      <strong>{rowErrors['other:new'].title}</strong> {rowErrors['other:new'].detail}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          {isConsolidated ? (
            <div className="detail-card">
              <div className="card-heading process-detail-card-heading">
                <span className="detail-label">Invoice e Packing List por PO</span>
                {missingConsolidatedCount > 0 ? (
                  <span className="inline-badge inline-badge--warn">
                    {`${missingConsolidatedCount} de ${purchaseOrders.length * 2} faltando`}
                  </span>
                ) : null}
              </div>
              {purchaseOrders.length === 0 ? (
                <p>Nenhuma PO cadastrada no processo.</p>
              ) : (
                <div className="documents-po-table-wrap">
                  <table className="detail-table documents-po-table">
                    <caption className="documents-visually-hidden">Invoice e Packing List por PO</caption>
                    <thead>
                      <tr>
                        <th scope="col">PO</th>
                        <th scope="col">Invoice</th>
                        <th scope="col">Packing List</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseOrders.map((order) => (
                        <tr key={order.po}>
                          <th scope="row">{`PO ${order.po}`}</th>
                          {renderPoCell('invoice', order)}
                          {renderPoCell('packingList', order)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {showFispqSection ? (
            <div className="detail-card">
              <span className="detail-label">FISPQ por item</span>
              <p>
                {'Obrigatória para itens marcados como carga perigosa (IMO/DG).'}
                {nonImoCount > 0
                  ? ` ${nonImoCount} ${pluralize(nonImoCount, 'item sem IMO não aparece aqui.', 'itens sem IMO não aparecem aqui.')}`
                  : ''}
              </p>
              <div className="detail-stack detail-stack--compact">
                {imoItems.map((item) => {
                  const slotKey = buildDocumentSlotKey('fispq', { itemId: item.id })
                  const group = findGroup(slotKey)
                  const title = item.commercialName || 'Item sem nome'
                  const chips = (
                    <div className="documents-chip-row">
                      {item.unNumber ? <span className="documents-chip">{`ONU ${item.unNumber}`}</span> : null}
                      {item.imoClass ? <span className="documents-chip">{`Classe ${item.imoClass}`}</span> : null}
                    </div>
                  )
                  return renderRow({
                    slotKey,
                    title,
                    meta: chips,
                    group,
                    canUpload: canUploadDocumentType(role, 'fispq'),
                    canDelete: group?.primary ? canDeleteDocument(profile, group.primary) : false,
                    uploadLabel: 'Enviar FISPQ',
                    emptyText: 'Nenhuma FISPQ enviada.',
                    emptyBadgeText: 'Pendente',
                    emptyBadgeTone: 'warn',
                    presentBadgeText: 'Enviada',
                    onUpload: (file) => handleUploadFile('fispq', slotKey, { itemId: item.id }, file),
                  })
                })}
              </div>
            </div>
          ) : null}

          {showWashSection ? (
            <div className="detail-card">
              <span className="detail-label">Relatório de lavação por contêiner</span>
              <div className="detail-stack detail-stack--compact">
                {washContainers.map((container, index) => {
                  const { state, slotKey, group, isReturned } = getWashRowState(container)
                  const title = container.number || `Contêiner ${index + 1}`
                  const typeLabel =
                    CONTAINER_TYPE_OPTIONS.find((option) => option.value === container.type)?.label ??
                    container.type ??
                    '—'
                  const metaText = !isReturned
                    ? `${typeLabel} · aguardando devolução do vazio`
                    : state === 'sent'
                      ? `${typeLabel} · vazio devolvido em ${formatShortDate(container.returnedAt)}`
                      : `${typeLabel} · vazio devolvido em ${formatShortDate(container.returnedAt)} · nenhum relatório enviado`

                  return renderRow({
                    slotKey,
                    title,
                    meta: <small className="field-hint">{metaText}</small>,
                    group,
                    canUpload: canUploadDocumentType(role, 'containerWash'),
                    canDelete: group?.primary ? canDeleteDocument(profile, group.primary) : false,
                    uploadLabel: state === 'pending' ? 'Enviar relatório' : 'Enviar',
                    emptyText: 'Nenhum relatório enviado.',
                    emptyBadgeText: state === 'pending' ? 'Pendente' : 'Ainda não exigido',
                    emptyBadgeTone: state === 'pending' ? 'warn' : 'neutral',
                    presentBadgeText: 'Enviado',
                    onUpload: (file) => handleUploadFile('containerWash', slotKey, { containerId: container.id }, file),
                  })
                })}
              </div>
            </div>
          ) : null}

          {unlinkedGroups.length > 0 ? (
            <div className="detail-card">
              <span className="detail-label">Documentos sem vínculo atual</span>
              <div className="detail-stack detail-stack--compact">
                {unlinkedGroups.map((group) => (
                  <div className="documents-row" key={group.slotKey}>
                    <span className="documents-row__icon" aria-hidden="true">
                      <Icon name="file" />
                    </span>
                    <div className="documents-row__content">
                      <strong>{group.primary?.name}</strong>
                      <span className="inline-badge documents-badge--neutral">{group.reason}</span>
                      <small className="field-hint">
                        {[
                          getDocumentFileKindLabel(group.primary?.mimeType, group.primary?.name),
                          formatDocumentSize(group.primary?.size),
                          formatDateTime(group.primary?.uploadedAt),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                      {group.previous ? (
                        <div className="documents-row__previous">
                          <span>{`Versão anterior: ${group.previous.name}`}</span>
                          <button type="button" className="ghost-button" onClick={() => handleDownload(group.previous)}>
                            Baixar
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="documents-row__actions">
                      <button
                        type="button"
                        className="documents-icon-button ghost-button"
                        aria-label={`Baixar ${group.primary?.name}`}
                        title={`Baixar ${group.primary?.name}`}
                        onClick={() => handleDownload(group.primary)}
                      >
                        <Icon name="download" />
                        <span className="documents-row__action-label">Baixar</span>
                      </button>
                      {canDeleteDocument(profile, group.primary) ? (
                        <button
                          type="button"
                          className="documents-icon-button ghost-button"
                          aria-label={`Excluir ${group.primary?.name}`}
                          title={`Excluir ${group.primary?.name}`}
                          onClick={() => setConfirmDeleteDoc(group.primary)}
                        >
                          <Icon name="trash" />
                          <span className="documents-row__action-label">Excluir</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDeleteDoc)}
        title="Excluir documento?"
        message="Esta ação é irreversível e o arquivo será removido do armazenamento."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        tone="danger"
        busy={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteDoc(null)}
      />
    </div>
  )
}
