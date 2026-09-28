import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDateTime } from '../../utils/dateFormat'
import { buildActionErrorMessage } from '../../utils/errorMessages'
import { isFirebaseConfigured } from '../../lib/firebase'
import {
  deleteProcessDocument,
  getProcessDocumentDownloadUrl,
  listProcessDocuments,
  uploadProcessDocument,
} from '../../services/processDocumentsRepository'
import ConfirmDialog from '../../components/ConfirmDialog'
import {
  buildDocumentSlotKey,
  canDeleteDocument,
  canUploadDocumentType,
  formatDocumentSize,
  getDocumentTypeLabel,
  groupDocumentsBySlot,
} from './processDocuments'
import { getProcessPurchaseOrders } from './purchaseOrders'

// F18a (D9): aba "Documentos" do detalhe do processo - visivel so pra
// admin/logistica (guard fica no ProcessDetailView, D6). Padrao `isMounted`
// guard de `ProcessHistoryPanel.jsx` (nao e' util compartilhado) +
// `buildActionErrorMessage` de `src/utils/errorMessages`.
//
// No F18a so os 4 tipos de nivel-processo (BL/AWB, Relatorio de carga,
// Invoice, Packing List) + "Outros". FISPQ por item e lavacao por
// conteiner ficam para o F18b (a rule/storage ja aceitam os 7 tipos - D1
// do PLAN.md - so a UI e' que vem depois).
//
// AD-1 (adendo do orquestrador): no CONSOLIDADO, Invoice/Packing List sao
// agrupados POR PO (1 linha por PO) - o envio exige escolher a PO num
// <select>.
const PROCESS_LEVEL_TYPES = ['bl', 'cargoReport']
const PO_SCOPABLE_TYPES = ['invoice', 'packingList']

export default function ProcessDocumentsPanel({ process, profile }) {
  const processId = process?.id
  const category = process?.category
  const role = profile?.role
  const isConsolidated = category === 'CONSOLIDADO'
  const purchaseOrders = isConsolidated ? getProcessPurchaseOrders(process) : []

  const [documents, setDocuments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [actionError, setActionError] = useState('')
  const [uploadingKey, setUploadingKey] = useState('')
  const [poSelection, setPoSelection] = useState({})
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const fileInputsRef = useRef({})

  useEffect(() => {
    let isMounted = true

    async function loadDocuments() {
      setIsLoading(true)
      setLoadError('')

      try {
        const list = await listProcessDocuments(processId)
        if (!isMounted) return
        setDocuments(list)
      } catch (error) {
        if (isMounted) {
          setLoadError(buildActionErrorMessage('Não foi possível carregar os documentos', error))
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadDocuments()

    return () => {
      isMounted = false
    }
  }, [processId, reloadToken])

  const groups = useMemo(() => groupDocumentsBySlot(documents), [documents])
  const otherDocuments = useMemo(
    () => documents.filter((document) => document.type === 'other'),
    [documents]
  )

  function findGroup(slotKey) {
    return groups.find((group) => group.slotKey === slotKey) ?? null
  }

  function triggerFilePicker(key) {
    fileInputsRef.current[key]?.click()
  }

  async function handleFileSelected(type, key, extra, event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploadingKey(key)
    setActionError('')

    try {
      await uploadProcessDocument(processId, {
        type,
        file,
        category,
        actor: { uid: profile?.uid, name: profile?.name, role },
        ...extra,
      })
      setReloadToken((token) => token + 1)
    } catch (error) {
      setActionError(buildActionErrorMessage('Não foi possível enviar o documento', error))
    } finally {
      setUploadingKey('')
    }
  }

  async function handleDownload(document) {
    setActionError('')
    // D8: popup SINCRONO no clique (iOS/PWA) - so' navega depois de
    // resolver a URL.
    const win = window.open('', '_blank')
    try {
      const url = await getProcessDocumentDownloadUrl(document.storagePath)
      if (win) win.location.href = url
    } catch (error) {
      win?.close()
      setActionError(buildActionErrorMessage('Não foi possível baixar o documento', error))
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDeleteDoc) return
    setIsDeleting(true)

    try {
      await deleteProcessDocument(processId, confirmDeleteDoc.id)
      setConfirmDeleteDoc(null)
      setReloadToken((token) => token + 1)
    } catch (error) {
      setActionError(buildActionErrorMessage('Não foi possível excluir o documento', error))
    } finally {
      setIsDeleting(false)
    }
  }

  function renderDocumentRow(group, { title, canUpload, uploadKey, onUploadClick }) {
    const primary = group?.primary ?? null
    const previous = group?.previous ?? null

    return (
      <div className="detail-block__row" key={uploadKey}>
        <div className="process-item-display">
          <strong>{title}</strong>
        </div>
        {primary ? (
          <div className="process-item-display">
            <span>{primary.name}</span>
            <small className="field-hint">
              {formatDateTime(primary.uploadedAt)} · {primary.uploadedByName} · {formatDocumentSize(primary.size)}
            </small>
            <button type="button" className="ghost-button" onClick={() => handleDownload(primary)}>
              Baixar
            </button>
            {canDeleteDocument(profile, primary) ? (
              <button type="button" className="ghost-button" onClick={() => setConfirmDeleteDoc(primary)}>
                Excluir
              </button>
            ) : null}
          </div>
        ) : (
          <div className="empty-state" role="status">
            <p>Nenhum documento enviado.</p>
          </div>
        )}
        {previous ? (
          <div className="process-item-display">
            <span className="inline-badge">Versão anterior</span>
            <span>{previous.name}</span>
            <button type="button" className="ghost-button" onClick={() => handleDownload(previous)}>
              Baixar
            </button>
          </div>
        ) : null}
        {canUpload ? (
          <>
            <input
              type="file"
              ref={(node) => {
                fileInputsRef.current[uploadKey] = node
              }}
              style={{ display: 'none' }}
              onChange={onUploadClick}
            />
            <button
              type="button"
              className="primary-button"
              disabled={uploadingKey === uploadKey}
              onClick={() => triggerFilePicker(uploadKey)}
            >
              {uploadingKey === uploadKey ? 'Enviando...' : primary ? 'Substituir' : 'Enviar'}
            </button>
          </>
        ) : null}
      </div>
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

  return (
    <div className="detail-card">
      <div className="card-heading process-detail-card-heading">
        <div>
          <span className="detail-label">Documentos</span>
          <p>Documentos do processo (BL/AWB, relatório de carga, invoice, packing list).</p>
        </div>
        <button type="button" className="ghost-button" onClick={() => setReloadToken((token) => token + 1)}>
          Atualizar
        </button>
      </div>

      {actionError ? (
        <div className="error-banner" role="alert">
          {actionError}
        </div>
      ) : null}

      {isLoading ? (
        <div className="empty-state" role="status">
          <strong>Carregando documentos</strong>
        </div>
      ) : loadError ? (
        <div className="empty-state" role="alert">
          <strong>{loadError}</strong>
        </div>
      ) : (
        <div className="detail-stack detail-stack--compact">
          {PROCESS_LEVEL_TYPES.map((type) => {
            const slotKey = buildDocumentSlotKey(type)
            return renderDocumentRow(findGroup(slotKey), {
              title: getDocumentTypeLabel(type),
              canUpload: canUploadDocumentType(role, type),
              uploadKey: slotKey,
              onUploadClick: (event) => handleFileSelected(type, slotKey, {}, event),
            })
          })}

          {PO_SCOPABLE_TYPES.map((type) => {
            if (!isConsolidated) {
              const slotKey = buildDocumentSlotKey(type, { category })
              return renderDocumentRow(findGroup(slotKey), {
                title: getDocumentTypeLabel(type),
                canUpload: canUploadDocumentType(role, type),
                uploadKey: slotKey,
                onUploadClick: (event) => handleFileSelected(type, slotKey, {}, event),
              })
            }

            const selectedPo = poSelection[type] ?? purchaseOrders[0]?.po ?? ''

            return (
              <div className="detail-card" key={type}>
                <span className="detail-label">{getDocumentTypeLabel(type)} por PO</span>
                {canUploadDocumentType(role, type) ? (
                  <label className="field">
                    <span>PO para o próximo envio</span>
                    <select
                      className="text-input"
                      aria-label={`PO para ${getDocumentTypeLabel(type)}`}
                      value={selectedPo}
                      onChange={(event) =>
                        setPoSelection((current) => ({ ...current, [type]: event.target.value }))
                      }
                    >
                      {purchaseOrders.map((order) => (
                        <option key={order.po} value={order.po}>
                          {order.po}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {purchaseOrders.map((order) => {
                  const slotKey = buildDocumentSlotKey(type, { category, po: order.po })
                  const uploadKey = `${type}:${order.po}`
                  return renderDocumentRow(findGroup(slotKey), {
                    title: `PO ${order.po}`,
                    canUpload: canUploadDocumentType(role, type) && selectedPo === order.po,
                    uploadKey,
                    onUploadClick: (event) => handleFileSelected(type, uploadKey, { po: order.po }, event),
                  })
                })}
              </div>
            )
          })}

          <div className="detail-card">
            <div className="card-heading process-detail-card-heading">
              <div>
                <span className="detail-label">Outros</span>
                <p>Documentos avulsos, sem versionamento.</p>
              </div>
              {canUploadDocumentType(role, 'other') ? (
                <>
                  <input
                    type="file"
                    ref={(node) => {
                      fileInputsRef.current['other'] = node
                    }}
                    style={{ display: 'none' }}
                    onChange={(event) => handleFileSelected('other', 'other', { description: 'Documento adicional' }, event)}
                  />
                  <button
                    type="button"
                    className="primary-button"
                    disabled={uploadingKey === 'other'}
                    onClick={() => triggerFilePicker('other')}
                  >
                    {uploadingKey === 'other' ? 'Enviando...' : 'Enviar'}
                  </button>
                </>
              ) : null}
            </div>
            {otherDocuments.length > 0 ? (
              <div className="process-messages-list">
                {otherDocuments.map((document) => (
                  <article key={document.id} className="process-message-card">
                    <div className="process-message-card__meta">
                      <strong>{document.description || document.name}</strong>
                      <span>{formatDateTime(document.uploadedAt)}</span>
                    </div>
                    <p>{document.name}</p>
                    <button type="button" className="ghost-button" onClick={() => handleDownload(document)}>
                      Baixar
                    </button>
                    {canDeleteDocument(profile, document) ? (
                      <button type="button" className="ghost-button" onClick={() => setConfirmDeleteDoc(document)}>
                        Excluir
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state" role="status">
                <p>Nenhum documento avulso enviado.</p>
              </div>
            )}
          </div>
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
