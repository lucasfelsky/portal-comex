// Linha "COA Original" da secao "Documentos do processo": o COA e' uma LISTA de
// varios arquivos, sem rotacao (cada arquivo tem o proprio slot `coaOriginal:<id>`).
// Os COAs antigos (slot fixo `coaOriginal` + "versao anterior") entram na mesma lista.
//
// Admin: envia varios arquivos de uma vez (seletor `multiple` ou arrastando), renomeia
// e exclui. Logistica, tecnico e faturamento so' veem/visualizam/baixam. Os handlers de
// download/excluir/renomear/visualizar sao do `ProcessDocumentsPanel` (dialogos e recarga
// da lista ficam la); aqui mora so' o envio em sequencia e a lista.
//
// Padrão replicado (não é util compartilhado): guard `isMounted` em async.

import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { getFriendlyErrorDetail } from '../../utils/errorMessages'
import { formatDateTime } from '../../utils/dateFormat'
import { uploadProcessDocument } from '../../services/processDocumentsRepository'
import DocumentActionsMenu from './DocumentActionsMenu'
import { getDocumentPreviewKind } from './spreadsheetPreview'
import {
  MAX_COA_FILES_PER_PROCESS,
  canDeleteDocument,
  canRenameDocument,
  canUploadDocumentType,
  formatDocumentSize,
  getCoaDisplayName,
  getDocumentFileKindLabel,
  getDocumentTypeLabel,
  isFileDragEvent,
  listCoaDocuments,
  pickDroppedFiles,
} from './processDocuments'

const COA_TYPE = 'coaOriginal'
const UPLOAD_ERROR_TITLE = 'Não foi possível enviar o documento.'

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural
}

function buildLimitMessage(existing, selected) {
  const room = Math.max(0, MAX_COA_FILES_PER_PROCESS - existing)
  const detail =
    room === 0
      ? 'Exclua algum COA antes de enviar outro.'
      : `Este processo já tem ${existing} e cabem mais ${room}; você escolheu ${selected}.`
  return { name: '', detail: `Limite de ${MAX_COA_FILES_PER_PROCESS} COAs por processo. ${detail}` }
}

export default function ProcessCoaDocuments({
  documents,
  processId,
  profile,
  isDesktopVariant = false,
  downloadingId = '',
  rowErrors = {},
  onChanged,
  onDownload,
  onPreview,
  onRequestDelete,
  onRequestRename,
}) {
  const coaDocuments = listCoaDocuments(documents)
  const count = coaDocuments.length
  const role = profile?.role
  const canUpload = canUploadDocumentType(role, COA_TYPE)
  const label = getDocumentTypeLabel(COA_TYPE)

  const [progress, setProgress] = useState(null)
  const [uploadErrors, setUploadErrors] = useState([])
  const [resultMessage, setResultMessage] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef(null)
  const mountedRef = useRef(true)
  const busyRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const isUploading = progress !== null
  const room = Math.max(0, MAX_COA_FILES_PER_PROCESS - count)

  async function uploadFiles(files) {
    if (!canUpload || busyRef.current || files.length === 0) return
    if (files.length > room) {
      setResultMessage('')
      setUploadErrors([buildLimitMessage(count, files.length)])
      return
    }

    busyRef.current = true
    setUploadErrors([])
    setResultMessage('')
    const failures = []
    let sent = 0

    try {
      for (let index = 0; index < files.length; index += 1) {
        if (!mountedRef.current) return
        const file = files[index]
        setProgress({ current: index + 1, total: files.length })
        try {
          await uploadProcessDocument(processId, {
            type: COA_TYPE,
            file,
            actor: { uid: profile?.uid, name: profile?.name, role },
          })
          sent += 1
        } catch (error) {
          console.error(UPLOAD_ERROR_TITLE, error)
          failures.push({ name: file?.name ?? '', detail: getFriendlyErrorDetail(error) })
        }
      }
    } finally {
      busyRef.current = false
    }

    if (!mountedRef.current) return
    setProgress(null)
    setUploadErrors(failures)
    if (sent > 0) {
      setResultMessage(
        failures.length === 0
          ? `${sent} ${pluralize(sent, 'COA enviado', 'COAs enviados')}.`
          : `${sent} de ${files.length} COAs enviados.`
      )
      onChanged?.()
    }
  }

  function handleDragOver(event) {
    if (!canUpload || isUploading || !isFileDragEvent(event)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }

  function handleDragLeave(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return
    setIsDragOver(false)
  }

  function handleDrop(event) {
    if (!canUpload || isUploading || !isFileDragEvent(event)) return
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(false)
    const { files, error } = pickDroppedFiles(event.dataTransfer, room)
    if (error === 'too-many') {
      setResultMessage('')
      setUploadErrors([buildLimitMessage(count, event.dataTransfer?.files?.length ?? 0)])
      return
    }
    if (files.length > 0) uploadFiles(files)
  }

  function buildMenuItems(document_) {
    const displayName = getCoaDisplayName(document_)
    const items = []
    if (onPreview && getDocumentPreviewKind(document_.mimeType, document_.name)) {
      items.push({
        key: 'preview',
        label: 'Visualizar',
        ariaLabel: `Visualizar ${displayName}`,
        icon: 'eye',
        onSelect: () => onPreview(document_),
      })
    }
    if (canRenameDocument(profile, document_)) {
      items.push({
        key: 'rename',
        label: 'Renomear',
        ariaLabel: `Renomear ${displayName}`,
        icon: 'edit',
        onSelect: () => onRequestRename?.({ ...document_, description: displayName }),
      })
    }
    if (canDeleteDocument(profile, document_)) {
      items.push({
        key: 'delete',
        label: 'Excluir',
        ariaLabel: `Excluir ${displayName}`,
        icon: 'trash',
        danger: true,
        separatorBefore: true,
        onSelect: () => onRequestDelete?.(document_),
      })
    }
    return items
  }

  // Erros de baixar/excluir/renomear gravados pelo painel (chave = slot do documento).
  const panelErrors = Object.entries(rowErrors ?? {})
    .filter(([key]) => key === COA_TYPE || key.startsWith(`${COA_TYPE}:`))
    .map(([key, value]) => ({ key, ...value }))

  return (
    <div
      className={`documents-row-group coa-docs${isDragOver ? ' documents-drop-active' : ''}`}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="documents-row">
        <span className={`documents-row__icon${count > 0 ? ' documents-row__icon--on' : ''}`} aria-hidden="true">
          <Icon name="file" />
        </span>
        <div className="documents-row__content">
          <p className="documents-row__label">{label}</p>
          <p className="documents-row__meta field-hint">
            {count > 0
              ? 'Cada COA fica na lista, sem versão anterior.'
              : 'Nenhum COA enviado.'}
          </p>
          {isUploading ? (
            <div className="documents-progress">
              <span className="documents-progress__bar" role="progressbar" aria-label={`Enviando ${label}`} />
              <small className="field-hint" role="status">
                {`Enviando ${progress.current} de ${progress.total}…`}
              </small>
            </div>
          ) : null}
          {resultMessage && !isUploading ? (
            <small className="field-hint" role="status">
              {resultMessage}
            </small>
          ) : null}
          {uploadErrors.length > 0 ? (
            <div role="alert" className="documents-row__error coa-docs__errors">
              <strong>{UPLOAD_ERROR_TITLE}</strong>
              {uploadErrors.map((item, index) => (
                <p key={`${item.name}-${index}`} className="coa-docs__error">
                  {item.name ? `${item.name}: ` : ''}
                  {item.detail}
                </p>
              ))}
            </div>
          ) : null}
          {panelErrors.map((item) => (
            <p key={item.key} role="alert" className="documents-row__error">
              <strong>{item.title}</strong> {item.detail}
            </p>
          ))}
        </div>
        <div className="documents-row__badge">
          {count > 0 ? (
            <span className="inline-badge inline-badge--ok">{`${count} ${pluralize(count, 'arquivo', 'arquivos')}`}</span>
          ) : (
            <span className="inline-badge documents-badge--neutral">Não enviado</span>
          )}
        </div>
        {canUpload || count === 0 ? (
          <div className="documents-row__actions">
            {canUpload ? (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  aria-label={`Selecionar arquivos de ${label}`}
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? [])
                    event.target.value = ''
                    uploadFiles(files)
                  }}
                />
                <button
                  type="button"
                  className="secondary-button coa-docs__upload"
                  disabled={isUploading}
                  onClick={() => inputRef.current?.click()}
                >
                  <Icon name="plus" /> {count > 0 ? 'Adicionar COAs' : 'Enviar COAs'}
                </button>
              </>
            ) : (
              <span className="documents-lock">
                <Icon name="lock" />
                Somente o COMEX envia este documento
              </span>
            )}
          </div>
        ) : null}
      </div>

      {count > 0 ? (
        <ul className="coa-docs__list" aria-label="Arquivos de COA">
          {coaDocuments.map((document_) => {
            const displayName = getCoaDisplayName(document_)
            const metaText = [
              getDocumentFileKindLabel(document_.mimeType, document_.name),
              formatDocumentSize(document_.size),
              formatDateTime(document_.uploadedAt),
              document_.uploadedByName,
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <li key={document_.id} className="coa-docs__item">
                <span className="coa-docs__icon" aria-hidden="true">
                  <Icon name="file" size={18} />
                </span>
                <div className="coa-docs__text">
                  <p className="coa-docs__name">{displayName}</p>
                  {displayName !== document_.name ? <p className="documents-row__file">{document_.name}</p> : null}
                  <p className="documents-row__meta field-hint">{metaText}</p>
                </div>
                <div className="coa-docs__actions">
                  <button
                    type="button"
                    className="secondary-button coa-docs__download"
                    aria-label={`Baixar ${displayName}`}
                    title={`Baixar ${displayName}`}
                    disabled={downloadingId === document_.id}
                    aria-busy={downloadingId === document_.id || undefined}
                    onClick={() => onDownload?.(document_)}
                  >
                    <Icon name="download" size={16} /> Baixar
                  </button>
                  <DocumentActionsMenu title={displayName} mobile={!isDesktopVariant} items={buildMenuItems(document_)} />
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
