// S11-D2: célula "COA" de uma PO na tabela "Invoice, Packing List e COA por PO" (CONSOLIDADO). Cada PO guarda seus
// COAs (vários arquivos, até 50 por PO): "Enviar COA" (admin; seletor múltiplo e arrastar e soltar), lista de arquivos
// com Baixar/Ações e erros só dos COAs desta PO. Quem não envia e não tem COA nesta PO vê a célula vazia (L-5).
// O COA é opcional: nunca "Pendente" e nunca entra no "faltando".

import CoaFileList from './CoaFileList'
import useCoaUpload, { COA_UPLOAD_ERROR_TITLE } from './useCoaUpload'
import { getCoaUploadRoom, listCoaDocumentsForPurchaseOrder } from './processDocuments'

// Mesma classe do "Enviar" da Invoice e do Packing List na tabela por PO (L-9).
export const COA_UPLOAD_BUTTON_CLASS = 'secondary-button documents-outline-button'

export default function PoCoaCell({
  order,
  documents,
  processId,
  profile,
  category,
  isDesktopVariant = false,
  downloadingId = '',
  rowErrors = {},
  badges = {},
  onChanged,
  onDownload,
  onPreview,
  onRequestDelete,
  onRequestRename,
}) {
  const po = String(order?.po ?? '').trim()
  const coaDocuments = listCoaDocumentsForPurchaseOrder(documents, po)
  const room = getCoaUploadRoom({ documents, category, po })
  const upload = useCoaUpload({ processId, profile, category, po, room, onChanged })
  const { canUpload, isUploading } = upload

  // Erros de baixar/excluir/renomear gravados pelo painel (chave = slot do documento), só dos COAs desta PO.
  const slotKeys = new Set(coaDocuments.map((document_) => document_.slotKey))
  const panelErrors = Object.entries(rowErrors ?? {})
    .filter(([key]) => slotKeys.has(key))
    .map(([key, value]) => ({ key, ...value }))

  const mobileClass = isDesktopVariant ? '' : ' documents-po-coa--mobile'
  if (!canUpload && coaDocuments.length === 0) {
    return <td className={`documents-po-coa documents-po-coa--empty${mobileClass}`} data-label="COA" />
  }

  const uploadControls = canUpload ? (
    <>
      <input
        ref={upload.inputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        aria-label={`Selecionar arquivos de COA da PO ${po}`}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          upload.uploadFiles(files)
        }}
      />
      <button
        type="button"
        ref={upload.buttonRef}
        className={COA_UPLOAD_BUTTON_CLASS}
        aria-label={`Enviar COA da PO ${po}`}
        disabled={isUploading}
        aria-busy={isUploading || undefined}
        onClick={() => upload.inputRef.current?.click()}
      >
        Enviar COA
      </button>
    </>
  ) : null

  return (
    <td
      className={`documents-po-coa${mobileClass}${upload.isDragOver ? ' documents-drop-active' : ''}`}
      data-label="COA"
      {...upload.dropProps}
    >
      <div className="coa-cell">
        {coaDocuments.length === 0 ? (
          <div className="coa-cell__empty">
            <span className="inline-badge documents-badge--neutral">Opcional</span>
            {uploadControls}
          </div>
        ) : (
          <CoaFileList
            documents={coaDocuments}
            profile={profile}
            isDesktopVariant={isDesktopVariant}
            downloadingId={downloadingId}
            badges={badges}
            ariaLabel={`Arquivos de COA da PO ${po}`}
            onDownload={onDownload}
            onPreview={onPreview}
            onRequestDelete={onRequestDelete}
            onRequestRename={onRequestRename}
          />
        )}
        {isUploading ? (
          <div className="documents-progress">
            <span className="documents-progress__bar" role="progressbar" aria-label={`Enviando COA da PO ${po}`} />
            <small className="field-hint" role="status">
              {`Enviando ${upload.progress.current} de ${upload.progress.total}…`}
            </small>
          </div>
        ) : null}
        {upload.resultMessage && !isUploading ? (
          <small className="field-hint" role="status">
            {upload.resultMessage}
          </small>
        ) : null}
        {upload.errors.length > 0 ? (
          <div role="alert" className="coa-errors">
            <strong>{COA_UPLOAD_ERROR_TITLE}</strong>
            {upload.errors.map((item, index) => (
              <p key={`${item.name}-${index}`}>
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
        {canUpload ? <p className="coa-drop-hint">Solte os arquivos para enviar o COA</p> : null}
        {coaDocuments.length > 0 && canUpload ? <div className="coa-cell__foot">{uploadControls}</div> : null}
      </div>
    </td>
  )
}
