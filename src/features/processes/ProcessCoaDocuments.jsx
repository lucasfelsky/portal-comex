// Card "COA Original" da seção "Documentos do processo" (S11-D2): o COA é uma LISTA de vários arquivos (até 50 por
// processo), sem rotação (cada arquivo tem o próprio slot `coaOriginal:<id>`); os COAs antigos (slot fixo
// `coaOriginal` + "versão anterior") entram na mesma lista. Mesmo card, grade e botões dos vizinhos: nunca
// "Pendente" (o COA é opcional); vazio mostra "Opcional".
//
// Usado em FCL, LCL e AÉREO (admin e logística) e, no CONSOLIDADO, só pelos leitores (técnico e faturamento), que
// veem todos os COAs com a PO de cada arquivo ("Sem PO" nos antigos). No CONSOLIDADO, admin e logística usam a
// coluna "COA" da tabela por PO (`PoCoaCell`). Quem não envia e não tem COA não vê o card (L-5).
//
// Admin: envia vários arquivos (seletor `multiple` ou arrastando), renomeia e exclui. Os handlers de download/
// excluir/renomear/visualizar são do `ProcessDocumentsPanel`; aqui mora só o card (envio em `useCoaUpload`).

import Icon from '../../components/Icon'
import CoaAutoReadStatus from './CoaAutoReadStatus'
import CoaFileList from './CoaFileList'
import { COA_UPLOAD_BUTTON_CLASS } from './PoCoaCell'
import useCoaUpload, { COA_UPLOAD_ERROR_TITLE } from './useCoaUpload'
import { formatPurchaseOrderNumber } from './purchaseOrders'
import {
  getCoaPurchaseOrderNumber,
  getCoaUploadRoom,
  getDocumentTypeLabel,
  listCoaDocuments,
} from './processDocuments'

const COA_TYPE = 'coaOriginal'

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural
}

export default function ProcessCoaDocuments({
  documents,
  processId,
  profile,
  category,
  showPurchaseOrder = false,
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
  const coaDocuments = listCoaDocuments(documents)
  const count = coaDocuments.length
  const label = getDocumentTypeLabel(COA_TYPE)
  const room = getCoaUploadRoom({ documents, category })
  const upload = useCoaUpload({ processId, profile, category, room, onChanged })
  const { canUpload, isUploading } = upload

  // Leitor sem COA: o card some (L-5).
  if (!canUpload && count === 0) return null

  // Erros de baixar/excluir/renomear gravados pelo painel (chave = slot do documento).
  const panelErrors = Object.entries(rowErrors ?? {})
    .filter(([key]) => key === COA_TYPE || key.startsWith(`${COA_TYPE}:`))
    .map(([key, value]) => ({ key, ...value }))

  const getPurchaseOrderLabel = showPurchaseOrder
    ? (document_) => {
        const po = getCoaPurchaseOrderNumber(document_)
        return po ? formatPurchaseOrderNumber(po) : 'Sem PO'
      }
    : null

  return (
    <div
      className={`documents-row-group coa-card${isDesktopVariant ? '' : ' coa-card--mobile'}${upload.isDragOver ? ' documents-drop-active' : ''}`}
      {...upload.dropProps}
    >
      <div className="documents-row">
        <span className={`documents-row__icon${count > 0 ? ' documents-row__icon--on' : ''}`} aria-hidden="true">
          <Icon name="file" />
        </span>
        <div className="documents-row__content">
          <p className="documents-row__label">{label}</p>
          {count === 0 ? <p className="documents-row__meta field-hint">Nenhum COA enviado</p> : null}
        </div>
        <div className="documents-row__badge">
          {count > 0 ? (
            <span className="inline-badge inline-badge--ok">{`${count} ${pluralize(count, 'arquivo', 'arquivos')}`}</span>
          ) : (
            <span className="inline-badge documents-badge--neutral">Opcional</span>
          )}
        </div>
      </div>

      <CoaFileList
        documents={coaDocuments}
        profile={profile}
        isDesktopVariant={isDesktopVariant}
        downloadingId={downloadingId}
        badges={badges}
        getPurchaseOrderLabel={getPurchaseOrderLabel}
        onDownload={onDownload}
        onPreview={onPreview}
        onRequestDelete={onRequestDelete}
        onRequestRename={onRequestRename}
      />

      {isUploading ? (
        <div className="documents-progress">
          <span className="documents-progress__bar" role="progressbar" aria-label={`Enviando ${label}`} />
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
      <CoaAutoReadStatus autoRead={upload.autoRead} />
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

      {canUpload ? (
        <>
          <p className="coa-drop-hint">Solte os arquivos para enviar o COA</p>
          <div className="coa-card__foot">
            <input
              ref={upload.inputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              aria-label={`Selecionar arquivos de ${label}`}
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
              disabled={isUploading}
              aria-busy={isUploading || undefined}
              onClick={() => upload.inputRef.current?.click()}
            >
              Enviar COA
            </button>
          </div>
        </>
      ) : (
        <p className="documents-lock coa-card__lock">
          <Icon name="lock" />
          Somente o COMEX envia este documento
        </p>
      )}
    </div>
  )
}
