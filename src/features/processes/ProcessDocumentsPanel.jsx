import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDateTime } from '../../utils/dateFormat'
import { getFriendlyErrorDetail } from '../../utils/errorMessages'
import { isFirebaseConfigured } from '../../lib/firebase'
import {
  deleteProcessDocument,
  downloadProcessDocumentBlob,
  listProcessDocuments,
  saveBlobAsFile,
  setInvoicePackingListLink,
  uploadProcessDocument,
} from '../../services/processDocumentsRepository'
import ConfirmDialog from '../../components/ConfirmDialog'
import Skeleton from '../../components/Skeleton'
import Icon from '../../components/Icon'
import {
  CONTAINER_WASH_CATEGORIES,
  DROP_MULTIPLE_FILES_MESSAGE,
  MAX_DOCUMENT_MB,
  buildDocumentPendingFields,
  buildDocumentSlotKey,
  canDeleteDocument,
  canUploadDocumentType,
  formatDocumentSize,
  getDocumentFileKindLabel,
  getDocumentIndexFromDocuments,
  getDocumentTypeLabel,
  getInvoicePackingListLink,
  getUnlinkedDocumentGroups,
  groupDocumentsBySlot,
  isFileDragEvent,
  pickSingleDroppedFile,
} from './processDocuments'
import { CONTAINER_TYPE_OPTIONS } from './containers'
import { getProcessPurchaseOrders } from './purchaseOrders'
import { isShipmentConfirmed } from './shipmentConfirmation'

// F18b-2 (design aprovado - canvas Claude Design M8NdiBoZfvbmJxVY5oZL6e):
// reescrita da aba "Documentos" (rodada 3: fidelidade visual aos artboards
// Main.dc.html/Consolidado.dc.html/Mobile.dc.html - cada secao vira um card
// proprio, linha em grid de 4 colunas icone/conteudo/badge/acoes, versao
// anterior como sublinha fora da linha). Padroes replicados (NAO sao util
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

// Data curta a partir de um instante ISO completo (uploadedAt) - diferente
// de `formatShortDate` (que e' pra data pura `YYYY-MM-DD`): aqui o valor ja
// carrega hora/fuso, `new Date(value)` direto e' seguro (sem o bug de
// meia-noite UTC virar o dia anterior em BRT).
function formatShortDateFromIso(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural
}

function badgeClassForTone(tone) {
  if (tone === 'warn') return 'inline-badge inline-badge--warn'
  if (tone === 'danger') return 'inline-badge inline-badge--danger'
  if (tone === 'ok') return 'inline-badge inline-badge--ok'
  return 'inline-badge documents-badge--neutral'
}

function DocumentsSectionHeader({ title, subtitle, badge }) {
  return (
    <div className="documents-section__header">
      <div>
        <h3 className="documents-section__title">{title}</h3>
        {subtitle ? <p className="documents-section__subtitle">{subtitle}</p> : null}
      </div>
      {badge ?? null}
    </div>
  )
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
  const [downloadingId, setDownloadingId] = useState('')
  const [liveMessage, setLiveMessage] = useState('')
  const [otherDescription, setOtherDescription] = useState('')
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [dragOverKey, setDragOverKey] = useState('')
  const [pendingCombine, setPendingCombine] = useState({})
  const [linkBusyKey, setLinkBusyKey] = useState('')

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

  // Fonte unica da pendencia (FISPQ, lavacao e, com embarque confirmado,
  // BL/Relatorio de carga/Invoice/Packing List): a mesma regra usada pelo
  // contador da aba e pelo card "Dados pendentes". Le a subcolecao real.
  const shipmentConfirmed = isShipmentConfirmed(process)
  const pendentesCount = useMemo(
    () => buildDocumentPendingFields(process, getDocumentIndexFromDocuments(documents)).length,
    [process, documents]
  )

  // Slot Invoice/Packing List coberto: arquivo proprio OU (so' Packing List)
  // a Invoice atual do mesmo slot marcada como "tambem contem o Packing List".
  function hasDocumentCoverage(type, slotOptions) {
    const slotKey = buildDocumentSlotKey(type, slotOptions)
    if (findGroup(slotKey)?.primary) return true
    if (type !== 'packingList') return false
    return Boolean(getInvoicePackingListLink(groups, buildDocumentSlotKey('invoice', slotOptions)))
  }

  const enviadosCount = useMemo(() => {
    let count = 0
    for (const type of PROCESS_LEVEL_TYPES) {
      if (findGroup(buildDocumentSlotKey(type))?.primary) count += 1
    }
    for (const type of PO_SCOPABLE_TYPES) {
      if (!isConsolidated) {
        if (hasDocumentCoverage(type, { category })) count += 1
      } else {
        for (const order of purchaseOrders) {
          if (hasDocumentCoverage(type, { category, po: order.po })) count += 1
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

  // Review #202: so' publica a contagem derivada depois da 1a carga com
  // sucesso - durante o loading (`documents` = []) ou com erro na 1a carga
  // a aba mantem a contagem do `documentIndex` (sem falso "4 pendentes").
  useEffect(() => {
    if (isLoading || loadError) return
    if (typeof onPendingCountChange === 'function') onPendingCountChange(pendentesCount)
  }, [pendentesCount, onPendingCountChange, isLoading, loadError])

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

  // Arrastar e soltar: handlers de uma zona de drop (linha/celula). Sem
  // permissao de envio (ou enviando), nao devolve handler nem destaque.
  function getDropTargetProps(key, { enabled, onFile }) {
    if (!enabled || !onFile || uploadingKey === key) return {}

    function handleDragOver(event) {
      if (!isFileDragEvent(event)) return
      event.preventDefault()
      event.stopPropagation()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      setDragOverKey(key)
    }

    return {
      onDragEnter: handleDragOver,
      onDragOver: handleDragOver,
      onDragLeave: (event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return
        setDragOverKey((current) => (current === key ? '' : current))
      },
      onDrop: (event) => {
        if (!isFileDragEvent(event)) return
        event.preventDefault()
        event.stopPropagation()
        setDragOverKey('')
        const { file, error } = pickSingleDroppedFile(event.dataTransfer)
        if (error === 'multiple') {
          setRowErrors((current) => ({
            ...current,
            [key]: {
              title: 'Não foi possível enviar o documento.',
              detail: DROP_MULTIPLE_FILES_MESSAGE,
            },
          }))
          return
        }
        if (file) onFile(file)
      },
    }
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
      return true
    } catch (error) {
      setLiveMessage('')
      setRowErrors((current) => ({
        ...current,
        [slotKey]: buildDocumentError('Não foi possível enviar o documento.', error),
      }))
      return false
    } finally {
      setUploadingKey('')
    }
  }

  // Invoice: o envio/substituicao herda o estado do checkbox "tambem contem
  // o Packing List" (nunca quando o PL ja tem arquivo proprio).
  async function uploadInvoiceFile(invoiceSlotKey, packingSlotKey, extra, file) {
    const { checked, packingHasOwnFile } = getCombineState(invoiceSlotKey, packingSlotKey)
    const ok = await handleUploadFile(
      'invoice',
      invoiceSlotKey,
      { ...extra, alsoPackingList: checked && !packingHasOwnFile },
      file
    )
    if (ok) {
      setPendingCombine((current) => {
        if (!(invoiceSlotKey in current)) return current
        const next = { ...current }
        delete next[invoiceSlotKey]
        return next
      })
    }
    return ok
  }

  function getCombineState(invoiceSlotKey, packingSlotKey) {
    const invoicePrimary = findGroup(invoiceSlotKey)?.primary ?? null
    const checked = invoicePrimary
      ? invoicePrimary.alsoPackingList === true
      : Boolean(pendingCombine[invoiceSlotKey])
    const packingHasOwnFile = Boolean(findGroup(packingSlotKey)?.primary)
    return { invoicePrimary, checked, packingHasOwnFile }
  }

  // Grava o vinculo na Invoice atual (ou, sem Invoice, so' guarda a escolha
  // para o proximo envio). `errorKey` = linha que mostra o erro.
  async function handleSetPackingListLink(invoiceSlotKey, next, errorKey = invoiceSlotKey) {
    const invoicePrimary = findGroup(invoiceSlotKey)?.primary ?? null
    if (!invoicePrimary) {
      setPendingCombine((current) => ({ ...current, [invoiceSlotKey]: next }))
      return
    }
    clearRowError(errorKey)
    setLinkBusyKey(invoiceSlotKey)
    try {
      await setInvoicePackingListLink(processId, invoicePrimary.id, next, { uid: profile?.uid })
      setReloadToken((token) => token + 1)
    } catch (error) {
      setRowErrors((current) => ({
        ...current,
        [errorKey]: buildDocumentError('Não foi possível atualizar o vínculo com o Packing List.', error),
      }))
    } finally {
      setLinkBusyKey('')
    }
  }

  // Checkbox "Este arquivo tambem contem o Packing List" (so' quem envia Invoice).
  function renderCombineOption(invoiceSlotKey, packingSlotKey, po = '') {
    if (!canUploadDocumentType(role, 'invoice')) return null
    const { checked, packingHasOwnFile } = getCombineState(invoiceSlotKey, packingSlotKey)
    const blocked = !checked && packingHasOwnFile
    const busy = uploadingKey === invoiceSlotKey || linkBusyKey === invoiceSlotKey
    return (
      <div className="documents-combine">
        <label className="documents-combine__label">
          <input
            type="checkbox"
            checked={checked}
            disabled={blocked || busy}
            aria-label={po ? `Este arquivo também contém o Packing List da PO ${po}` : undefined}
            onChange={(event) => handleSetPackingListLink(invoiceSlotKey, event.target.checked)}
          />
          <span>Este arquivo também contém o Packing List</span>
        </label>
        {blocked ? <small className="field-hint">O Packing List já tem arquivo próprio.</small> : null}
      </div>
    )
  }

  async function handleAddOtherDocument(file) {
    const description = otherDescription.trim().slice(0, 80) || 'Documento adicional'
    const ok = await handleUploadFile('other', 'other:new', { description }, file)
    if (ok) setOtherDescription('')
  }

  async function handleDownload(document_, errorKey) {
    if (downloadingId) return
    const slotKey = errorKey ?? document_?.slotKey
    if (slotKey) clearRowError(slotKey)
    setDownloadingId(document_.id)
    setLiveMessage(`Baixando ${document_.name}…`)
    try {
      // L38: download autenticado via Cloud Function (sem URL persistida).
      const blob = await downloadProcessDocumentBlob(processId, document_.id)
      saveBlobAsFile(blob, document_.name || 'documento')
      setLiveMessage('Download concluído.')
    } catch (error) {
      setLiveMessage('')
      if (slotKey) {
        setRowErrors((current) => ({
          ...current,
          [slotKey]: buildDocumentError('Não foi possível baixar o documento.', error),
        }))
      }
    } finally {
      setDownloadingId('')
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDeleteDoc) return
    setIsDeleting(true)
    const slotKey = confirmDeleteDoc.slotKey

    try {
      // A versao anterior promovida herdaria o vinculo com o Packing List:
      // excluir a Invoice atual desfaz o vinculo antes.
      const deletedGroup = findGroup(slotKey)
      if (
        confirmDeleteDoc.type === 'invoice' &&
        deletedGroup?.primary?.id === confirmDeleteDoc.id &&
        deletedGroup.previous?.alsoPackingList === true
      ) {
        await setInvoicePackingListLink(processId, deletedGroup.previous.id, false, { uid: profile?.uid })
      }
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

  // Sublinha "Versão anterior" - FORA da grade da linha (sibling), recuada
  // pra alinhar com o inicio do texto (icone 40px + gap 14px do row).
  function renderPreviousLine(previous) {
    if (!previous) return null
    return (
      <div className="documents-row__previous">
        <Icon name="history" size={16} />
        <span>
          {`Versão anterior: ${previous.name} · ${formatDocumentSize(previous.size)} · ${formatShortDateFromIso(previous.uploadedAt)}`}
        </span>
        <button
          type="button"
          className="documents-link-button"
          disabled={downloadingId === previous.id}
          aria-busy={downloadingId === previous.id || undefined}
          onClick={() => handleDownload(previous)}
        >
          Baixar
        </button>
      </div>
    )
  }

  // E2: renderiza 1 linha (Documentos do processo / FISPQ / lavacao) em
  // grid de 4 colunas (icone / conteudo / badge / acoes) + a sublinha de
  // versao anterior como irmao (fora da grade), igual ao artboard.
  function renderRow({
    slotKey,
    icon = 'file',
    title,
    fileLine = null,
    metaLine,
    group,
    canUpload,
    canDelete,
    uploadLabel = 'Enviar',
    presentBadgeText = 'Atual',
    presentBadgeTone = 'ok',
    showBadgeOnPresent = true,
    emptyBadgeText = 'Não enviado',
    emptyBadgeTone = 'neutral',
    onUpload,
    extraContent = null,
    includedInInvoice = null,
  }) {
    const primary = group?.primary ?? null
    const previous = group?.previous ?? null
    const isRowUploading = uploadingKey === slotKey
    const rowError = rowErrors[slotKey]

    return (
      <div
        key={slotKey}
        className={`documents-row-group${dragOverKey === slotKey ? ' documents-drop-active' : ''}`}
        {...getDropTargetProps(slotKey, { enabled: Boolean(canUpload && onUpload), onFile: onUpload })}
      >
        <div className="documents-row">
          <span
            className={`documents-row__icon${primary ? ' documents-row__icon--on' : ''}`}
            aria-hidden="true"
          >
            <Icon name={icon} />
          </span>
          <div className="documents-row__content">
            <p className="documents-row__label">{title}</p>
            {primary ? fileLine : null}
            {metaLine}
            {extraContent}
            {isRowUploading ? (
              <div className="documents-progress">
                <span className="documents-progress__bar" role="progressbar" aria-label={`Enviando ${title}`} />
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
          <div className="documents-row__badge">
            {primary
              ? showBadgeOnPresent
                ? (
                  <span className={`${badgeClassForTone(presentBadgeTone)}${presentBadgeTone === 'warn' ? ' documents-badge--icon' : ''}`}>
                    {presentBadgeTone === 'warn' && presentBadgeText === 'Pendente' ? <Icon name="alert" size={14} /> : null}
                    {presentBadgeText}
                  </span>
                )
                : null
              : includedInInvoice
                ? <span className="inline-badge inline-badge--ok">Incluído na Invoice</span>
                : (
                <span className={`${badgeClassForTone(emptyBadgeTone)}${emptyBadgeText === 'Pendente' ? ' documents-badge--icon' : ''}`}>
                  {emptyBadgeText === 'Pendente' ? <Icon name="alert" size={14} /> : null}
                  {emptyBadgeText}
                </span>
              )}
          </div>
          <div className="documents-row__actions">
            {includedInInvoice ? (
              <>
                <button
                  type="button"
                  className="documents-icon-button ghost-button"
                  aria-label={`Baixar ${includedInInvoice.invoice.name}`}
                  title={`Baixar ${includedInInvoice.invoice.name}`}
                  disabled={downloadingId === includedInInvoice.invoice.id}
                  aria-busy={downloadingId === includedInInvoice.invoice.id || undefined}
                  onClick={() => handleDownload(includedInInvoice.invoice, slotKey)}
                >
                  <Icon name="download" />
                  <span className="documents-row__action-label">Baixar</span>
                </button>
                {includedInInvoice.canSeparate ? (
                  <button
                    type="button"
                    className="documents-icon-button ghost-button"
                    aria-label="Separar Packing List da Invoice"
                    title="Separar Packing List da Invoice"
                    disabled={linkBusyKey === includedInInvoice.invoiceSlotKey}
                    onClick={() => handleSetPackingListLink(includedInInvoice.invoiceSlotKey, false, slotKey)}
                  >
                    <span className="documents-row__action-label">Separar</span>
                  </button>
                ) : null}
              </>
            ) : null}
            {primary ? (
              <button
                type="button"
                className="documents-icon-button ghost-button"
                aria-label={`Baixar ${primary.name}`}
                title={`Baixar ${primary.name}`}
                disabled={isRowUploading || downloadingId === primary.id}
                aria-busy={downloadingId === primary.id || undefined}
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
            ) : !primary && !includedInInvoice ? (
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
        {renderPreviousLine(previous)}
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
    const invoiceSlotKey = buildDocumentSlotKey('invoice', { category, po: order.po })
    const packingSlotKey = buildDocumentSlotKey('packingList', { category, po: order.po })
    const invoiceLink = type === 'packingList' && !primary ? getInvoicePackingListLink(groups, invoiceSlotKey) : null
    const uploadFile = (file) =>
      type === 'invoice'
        ? uploadInvoiceFile(slotKey, packingSlotKey, { po: order.po }, file)
        : handleUploadFile(type, slotKey, { po: order.po }, file)

    return (
      <td
        key={type}
        className={dragOverKey === slotKey ? 'documents-drop-active' : undefined}
        {...getDropTargetProps(slotKey, {
          // PL "incluido na Invoice": so' volta a aceitar arquivo depois de "Separar".
          enabled: canUpload && !invoiceLink,
          onFile: uploadFile,
        })}
      >
        <div className="documents-po-cell">
          {primary ? (
            <>
              <span className="documents-row__icon documents-row__icon--on documents-po-cell__icon" aria-hidden="true">
                <Icon name="file" />
              </span>
              <div className="documents-po-cell__info">
                <span className="documents-po-cell__name">{primary.name}</span>
                <small className="field-hint">
                  {[
                    getDocumentFileKindLabel(primary.mimeType, primary.name),
                    formatDocumentSize(primary.size),
                    formatShortDateFromIso(primary.uploadedAt),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </div>
              <div className="documents-row__actions">
                <button
                  type="button"
                  className="documents-icon-button ghost-button"
                  aria-label={`Baixar ${primary.name}`}
                  title={`Baixar ${primary.name}`}
                  disabled={isRowUploading || downloadingId === primary.id}
                  aria-busy={downloadingId === primary.id || undefined}
                  onClick={() => handleDownload(primary)}
                >
                  <Icon name="download" />
                  <span className="documents-row__action-label">Baixar</span>
                </button>
                {canUpload ? (
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
              {canUpload ? (
                <input
                  type="file"
                  ref={registerFileInput(slotKey)}
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) uploadFile(file)
                  }}
                />
              ) : null}
              {group?.previous ? (
                <div className="documents-row__previous documents-po-cell__previous">
                  <Icon name="history" size={16} />
                  <span>
                    {`Versão anterior: ${group.previous.name} · ${formatDocumentSize(group.previous.size)} · ${formatShortDateFromIso(group.previous.uploadedAt)}`}
                  </span>
                  <button
                    type="button"
                    className="documents-link-button"
                    disabled={downloadingId === group.previous.id}
                    aria-busy={downloadingId === group.previous.id || undefined}
                    onClick={() => handleDownload(group.previous)}
                  >
                    Baixar
                  </button>
                </div>
              ) : null}
            </>
          ) : invoiceLink ? (
            <>
              <div className="documents-po-cell__info">
                <span className="inline-badge inline-badge--ok">Incluído na Invoice</span>
                <small className="field-hint">{`No mesmo arquivo da Invoice: ${invoiceLink.name}`}</small>
              </div>
              <div className="documents-row__actions">
                <button
                  type="button"
                  className="documents-icon-button ghost-button"
                  aria-label={`Baixar ${invoiceLink.name}`}
                  title={`Baixar ${invoiceLink.name}`}
                  disabled={downloadingId === invoiceLink.id}
                  aria-busy={downloadingId === invoiceLink.id || undefined}
                  onClick={() => handleDownload(invoiceLink, slotKey)}
                >
                  <Icon name="download" />
                  <span className="documents-row__action-label">Baixar</span>
                </button>
                {canUploadDocumentType(role, 'invoice') ? (
                  <button
                    type="button"
                    className="documents-icon-button ghost-button"
                    aria-label={`Separar Packing List da Invoice da PO ${order.po}`}
                    title="Separar Packing List da Invoice"
                    disabled={linkBusyKey === invoiceSlotKey}
                    onClick={() => handleSetPackingListLink(invoiceSlotKey, false, slotKey)}
                  >
                    <span className="documents-row__action-label">Separar</span>
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              {shipmentConfirmed ? (
                <span className="inline-badge inline-badge--warn documents-badge--icon">
                  <Icon name="alert" size={14} />
                  Pendente
                </span>
              ) : (
                <span className="inline-badge documents-badge--neutral">Não enviado</span>
              )}
              <span className="documents-po-cell__spacer" />
              {canUpload ? (
                <>
                  <input
                    type="file"
                    ref={registerFileInput(slotKey)}
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file) uploadFile(file)
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
            </>
          )}
        </div>
        {type === 'invoice' ? renderCombineOption(slotKey, packingSlotKey, order.po) : null}
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
      <div className="detail-card documents-panel-unconfigured">
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
        const packingMissing = !hasDocumentCoverage('packingList', { category, po: order.po })
        return count + (invoiceMissing ? 1 : 0) + (packingMissing ? 1 : 0)
      }, 0)
    : 0

  return (
    <div
      className="documents-panel"
      onDragOver={(event) => {
        if (!isFileDragEvent(event)) return
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
      }}
      onDrop={(event) => {
        if (!isFileDragEvent(event)) return
        event.preventDefault()
        setDragOverKey('')
      }}
    >
      <h2 className="documents-visually-hidden">Documentos</h2>

      <div className="documents-summary">
        {showLoadedContent && isEmptyDocuments ? (
          <div className="documents-empty-state documents-summary__badges" role="status">
            <Icon name="inbox" size={28} />
            <strong>Nenhum documento ainda</strong>
            <p>
              {role === 'logistica'
                ? 'Os documentos enviados pelo COMEX aparecem aqui.'
                : 'Envie BL, relatório de carga, invoice e packing list. FISPQ e lavação aparecem quando houver item IMO ou contêiner.'}
            </p>
            {pendentesCount > 0 ? (
              <span className="inline-badge inline-badge--warn">
                {`${pendentesCount} ${pluralize(pendentesCount, 'pendente', 'pendentes')}`}
              </span>
            ) : null}
          </div>
        ) : showLoadedContent ? (
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
            <p className="documents-summary__hint">
              {`Visível só para COMEX e logística · PDF, Excel, Word ou imagem até ${MAX_DOCUMENT_MB} MB`}
            </p>
          </>
        ) : (
          <div className="documents-summary__badges" />
        )}
        <button
          type="button"
          className="documents-icon-button ghost-button documents-summary__update"
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
        <div className="documents-sections">
          <div className="documents-section documents-section--process">
            <DocumentsSectionHeader
              title="Documentos do processo"
              subtitle="Cada tipo guarda o arquivo atual e a última versão anterior."
            />
            <div className="documents-section__rows">
              {PROCESS_LEVEL_TYPES.map((type) => {
                const slotKey = buildDocumentSlotKey(type)
                const group = findGroup(slotKey)
                const primary = group?.primary ?? null
                const metaText = primary
                  ? [
                      getDocumentFileKindLabel(primary.mimeType, primary.name),
                      formatDocumentSize(primary.size),
                      formatDateTime(primary.uploadedAt),
                      primary.uploadedByName,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Nenhum arquivo enviado'
                return renderRow({
                  slotKey,
                  title: getDocumentTypeLabel(type),
                  fileLine: primary ? <p className="documents-row__file">{primary.name}</p> : null,
                  metaLine: <p className="documents-row__meta field-hint">{metaText}</p>,
                  group,
                  canUpload: canUploadDocumentType(role, type),
                  canDelete: primary ? canDeleteDocument(profile, primary) : false,
                  onUpload: (file) => handleUploadFile(type, slotKey, {}, file),
                  ...(shipmentConfirmed ? { emptyBadgeText: 'Pendente', emptyBadgeTone: 'warn' } : {}),
                })
              })}

              {!isConsolidated
                ? PO_SCOPABLE_TYPES.map((type) => {
                    const slotKey = buildDocumentSlotKey(type, { category })
                    const group = findGroup(slotKey)
                    const primary = group?.primary ?? null
                    const invoiceLink =
                      type === 'packingList' && !primary ? getInvoicePackingListLink(groups, 'invoice') : null
                    const metaText = primary
                      ? [
                          getDocumentFileKindLabel(primary.mimeType, primary.name),
                          formatDocumentSize(primary.size),
                          formatDateTime(primary.uploadedAt),
                          primary.uploadedByName,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : invoiceLink
                        ? `No mesmo arquivo da Invoice: ${invoiceLink.name}`
                        : 'Nenhum arquivo enviado'
                    return renderRow({
                      slotKey,
                      title: getDocumentTypeLabel(type),
                      fileLine: primary ? <p className="documents-row__file">{primary.name}</p> : null,
                      metaLine: <p className="documents-row__meta field-hint">{metaText}</p>,
                      group,
                      canUpload: invoiceLink ? false : canUploadDocumentType(role, type),
                      canDelete: primary ? canDeleteDocument(profile, primary) : false,
                      onUpload:
                        type === 'invoice'
                          ? (file) => uploadInvoiceFile(slotKey, 'packingList', {}, file)
                          : (file) => handleUploadFile(type, slotKey, {}, file),
                      extraContent: type === 'invoice' ? renderCombineOption('invoice', 'packingList') : null,
                      includedInInvoice: invoiceLink
                        ? {
                            invoice: invoiceLink,
                            invoiceSlotKey: 'invoice',
                            canSeparate: canUploadDocumentType(role, 'invoice'),
                          }
                        : null,
                      ...(shipmentConfirmed ? { emptyBadgeText: 'Pendente', emptyBadgeTone: 'warn' } : {}),
                    })
                  })
                : null}

              {otherDocuments.map((document_) => {
                const metaText = [
                  'Outro',
                  getDocumentFileKindLabel(document_.mimeType, document_.name),
                  formatDocumentSize(document_.size),
                  formatDateTime(document_.uploadedAt),
                  document_.uploadedByName,
                ]
                  .filter(Boolean)
                  .join(' · ')
                return renderRow({
                  slotKey: document_.slotKey,
                  title: document_.description || document_.name,
                  fileLine: <p className="documents-row__file">{document_.name}</p>,
                  metaLine: <p className="documents-row__meta field-hint">{metaText}</p>,
                  group: { slotKey: document_.slotKey, primary: document_, previous: null },
                  canUpload: false,
                  canDelete: canDeleteDocument(profile, document_),
                  showBadgeOnPresent: false,
                })
              })}

              {canUploadDocumentType(role, 'other') ? (
                <div
                  className={`documents-add-other-row${dragOverKey === 'other:new' ? ' documents-drop-active' : ''}`}
                  {...getDropTargetProps('other:new', { enabled: true, onFile: handleAddOtherDocument })}
                >
                  <input
                    type="file"
                    ref={registerFileInput('other:new')}
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file) handleAddOtherDocument(file)
                    }}
                  />
                  <label className="field documents-add-other__name">
                    <span>Nome do documento (opcional)</span>
                    <input
                      className="text-input"
                      type="text"
                      maxLength={80}
                      autoComplete="off"
                      placeholder="Ex.: Certificado de análise"
                      value={otherDescription}
                      onChange={(event) => setOtherDescription(event.target.value)}
                      disabled={uploadingKey === 'other:new'}
                    />
                  </label>
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
                </div>
              ) : null}
            </div>
          </div>

          {isConsolidated ? (
            <div className="documents-section">
              <DocumentsSectionHeader
                title="Invoice e Packing List por PO"
                subtitle="No consolidado, cada PO tem a sua Invoice e o seu Packing List, cada um com a versão atual e a anterior."
                badge={
                  missingConsolidatedCount > 0 ? (
                    <span className="inline-badge inline-badge--warn documents-badge--icon">
                      <Icon name="alert" size={14} />
                      {`${missingConsolidatedCount} de ${purchaseOrders.length * 2} faltando`}
                    </span>
                  ) : null
                }
              />
              {purchaseOrders.length === 0 ? (
                <p className="documents-po-empty">Nenhuma PO cadastrada no processo.</p>
              ) : (
                <div className="documents-po-table-wrap">
                  <table className="documents-po-table">
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
                          <th scope="row">{order.po}</th>
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
            <div className="documents-section">
              <DocumentsSectionHeader
                title="FISPQ por item"
                subtitle={
                  'Obrigatória para itens marcados como carga perigosa (IMO/DG).' +
                  (nonImoCount > 0
                    ? ` ${nonImoCount} ${pluralize(nonImoCount, 'item sem IMO não aparece aqui.', 'itens sem IMO não aparecem aqui.')}`
                    : '')
                }
              />
              {imoItems.map((item) => {
                const slotKey = buildDocumentSlotKey('fispq', { itemId: item.id })
                const group = findGroup(slotKey)
                const primary = group?.primary ?? null
                const title = item.commercialName || 'Item sem nome'
                const hasChips = Boolean(item.unNumber || item.imoClass)
                const chips = (
                  <>
                    {item.unNumber ? <span className="documents-chip">{`ONU ${item.unNumber}`}</span> : null}
                    {item.imoClass ? <span className="documents-chip">{`Classe ${item.imoClass}`}</span> : null}
                  </>
                )
                const statusBase = primary
                  ? `${primary.name} · ${formatDocumentSize(primary.size)} · ${formatShortDateFromIso(primary.uploadedAt)}`
                  : 'Nenhuma FISPQ enviada'
                const statusText = hasChips ? ` · ${statusBase}` : statusBase
                return renderRow({
                  slotKey,
                  icon: 'flask',
                  title,
                  metaLine: (
                    <p className="documents-row__meta documents-row__meta--chips field-hint">
                      {chips}
                      <span>{statusText}</span>
                    </p>
                  ),
                  group,
                  canUpload: canUploadDocumentType(role, 'fispq'),
                  canDelete: primary ? canDeleteDocument(profile, primary) : false,
                  uploadLabel: 'Enviar FISPQ',
                  emptyBadgeText: 'Pendente',
                  emptyBadgeTone: 'warn',
                  presentBadgeText: 'Enviada',
                  onUpload: (file) => handleUploadFile('fispq', slotKey, { itemId: item.id }, file),
                })
              })}
            </div>
          ) : null}

          {showWashSection ? (
            <div className="documents-section">
              <DocumentsSectionHeader
                title="Relatório de lavação por contêiner"
                subtitle="Pendente depois que a devolução do vazio é registrada. A logística também pode enviar."
              />
              {washContainers.map((container, index) => {
                const { state, slotKey, group, isReturned } = getWashRowState(container)
                const primary = group?.primary ?? null
                const title = container.number || `Contêiner ${index + 1}`
                const typeLabel =
                  CONTAINER_TYPE_OPTIONS.find((option) => option.value === container.type)?.label ??
                  container.type ??
                  '—'
                const metaText = !isReturned
                  ? `${typeLabel} · aguardando devolução do vazio`
                  : primary
                    ? `${typeLabel} · vazio devolvido em ${formatShortDate(container.returnedAt)} · ${primary.name} · ${formatDocumentSize(primary.size)} · ${formatShortDateFromIso(primary.uploadedAt)}`
                    : `${typeLabel} · vazio devolvido em ${formatShortDate(container.returnedAt)} · nenhum relatório enviado`

                return renderRow({
                  slotKey,
                  icon: 'container',
                  title,
                  metaLine: <p className="documents-row__meta field-hint">{metaText}</p>,
                  group,
                  canUpload: canUploadDocumentType(role, 'containerWash'),
                  canDelete: primary ? canDeleteDocument(profile, primary) : false,
                  uploadLabel: state === 'pending' ? 'Enviar relatório' : 'Enviar',
                  emptyBadgeText: state === 'pending' ? 'Pendente' : 'Ainda não exigido',
                  emptyBadgeTone: state === 'pending' ? 'warn' : 'neutral',
                  presentBadgeText: 'Enviado',
                  onUpload: (file) => handleUploadFile('containerWash', slotKey, { containerId: container.id }, file),
                })
              })}
            </div>
          ) : null}

          {unlinkedGroups.length > 0 ? (
            <div className="documents-section">
              <DocumentsSectionHeader title="Documentos sem vínculo atual" />
              {unlinkedGroups.map((group) => {
                const metaText = [
                  getDocumentFileKindLabel(group.primary?.mimeType, group.primary?.name),
                  formatDocumentSize(group.primary?.size),
                  formatDateTime(group.primary?.uploadedAt),
                ]
                  .filter(Boolean)
                  .join(' · ')
                return renderRow({
                  slotKey: group.slotKey,
                  title: group.primary?.name,
                  metaLine: <p className="documents-row__meta field-hint">{metaText}</p>,
                  group,
                  canUpload: false,
                  canDelete: canDeleteDocument(profile, group.primary),
                  presentBadgeText: group.reason,
                  presentBadgeTone: 'neutral',
                })
              })}
            </div>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDeleteDoc)}
        title="Excluir documento?"
        message={
          'Esta ação é irreversível e o arquivo será removido do armazenamento.' +
          (confirmDeleteDoc?.alsoPackingList
            ? ' O Packing List marcado como incluído nesta Invoice volta a ficar sem arquivo.'
            : '')
        }
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
