// S11-D2 (D-4, L-4, L-12, L-16): bloco "COA sem PO" do CONSOLIDADO, abaixo da tabela por PO e só quando existe. Lista
// os COAs que não pertencem a nenhuma PO atual: enviados antes da coluna por PO ("Sem PO") ou de uma PO que saiu do
// processo ("PO removida"). Admin e logística baixam/visualizam; só o admin renomeia, exclui e vincula.
//
// "Vincular à PO" (admin): escolhe uma das POs do processo (todas aparecem) e grava só a PO do arquivo; PO que já tem 50
// COAs mostra "Limite de 50 COAs por PO." e não vincula. Erro com o padrão local `buildActionErrorMessage`.

import { useState } from 'react'
import { setCoaPurchaseOrder } from '../../services/processDocumentsRepository'
import CoaFileList from './CoaFileList'
import { COA_UPLOAD_BUTTON_CLASS } from './PoCoaCell'
import { formatPurchaseOrderNumber } from './purchaseOrders'
import {
  MAX_COA_FILES_PER_PURCHASE_ORDER,
  getCoaDisplayName,
  getCoaUploadRoom,
  listCoaDocumentsWithoutPurchaseOrder,
} from './processDocuments'

// Padrão replicado (não é util compartilhado): mensagem de erro de ação.
function buildActionErrorMessage(prefix, error) {
  const details = error?.code ?? error?.message
  return details ? `${prefix} (${details})` : prefix
}

const LINK_ICON = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </svg>
)

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural
}

export default function CoaWithoutPurchaseOrderBlock({
  documents,
  purchaseOrders,
  processId,
  profile,
  canSeePoReference = false,
  isDesktopVariant = false,
  downloadingId = '',
  rowErrors = {},
  badges = {},
  onChanged,
  onNotice,
  onDownload,
  onPreview,
  onRequestDelete,
  onRequestRename,
}) {
  const [openId, setOpenId] = useState('')
  const [choices, setChoices] = useState({})
  const [busyId, setBusyId] = useState('')
  const [errors, setErrors] = useState({})

  const orphans = listCoaDocumentsWithoutPurchaseOrder(documents, purchaseOrders)
  if (orphans.length === 0) return null

  const isAdmin = profile?.role === 'admin'
  const canLink = isAdmin && purchaseOrders.length > 0
  const reasons = new Map(orphans.map((entry) => [entry.document.id, entry.reason]))
  const files = orphans.map((entry) => entry.document)
  // Erros de baixar/excluir/renomear gravados pelo painel (chave = slot do documento), só dos COAs deste bloco.
  const slotKeys = new Set(files.map((document_) => document_.slotKey))
  const panelErrors = Object.entries(rowErrors ?? {})
    .filter(([key]) => slotKeys.has(key))
    .map(([key, value]) => ({ key, ...value }))

  function setError(documentId, message) {
    setErrors((current) => ({ ...current, [documentId]: message }))
  }

  async function handleConfirm(document_) {
    const po = String(choices[document_.id] ?? '').trim()
    if (!po || busyId) return
    if (getCoaUploadRoom({ documents, category: 'CONSOLIDADO', po }) <= 0) {
      setError(document_.id, `Limite de ${MAX_COA_FILES_PER_PURCHASE_ORDER} COAs por PO.`)
      return
    }
    setError(document_.id, '')
    setBusyId(document_.id)
    try {
      await setCoaPurchaseOrder(processId, document_.id, po, { uid: profile?.uid })
      setOpenId('')
      onNotice?.(`COA vinculado à ${formatPurchaseOrderNumber(po)}.`)
      onChanged?.()
    } catch (error) {
      setError(document_.id, buildActionErrorMessage('Não foi possível vincular o COA', error))
    } finally {
      setBusyId('')
    }
  }

  function renderLead(document_) {
    if (!canLink) return null
    const open = openId === document_.id
    return (
      <button
        type="button"
        className={COA_UPLOAD_BUTTON_CLASS}
        aria-label={`Vincular à PO: ${getCoaDisplayName(document_)}`}
        aria-expanded={open}
        aria-controls={open ? `coa-link-${document_.id}` : undefined}
        onClick={() => setOpenId(open ? '' : document_.id)}
      >
        {LINK_ICON}
        Vincular à PO
      </button>
    )
  }

  function renderPanel(document_) {
    if (!canLink || openId !== document_.id) return null
    const selectId = `coa-link-select-${document_.id}`
    const busy = busyId === document_.id
    return (
      <div className="coa-link" id={`coa-link-${document_.id}`}>
        <div className="coa-link__field">
          <label htmlFor={selectId}>PO deste arquivo</label>
          <select
            id={selectId}
            className="coa-link__select"
            value={choices[document_.id] ?? ''}
            disabled={busy}
            onChange={(event) => {
              setChoices((current) => ({ ...current, [document_.id]: event.target.value }))
              setError(document_.id, '')
            }}
          >
            <option value="">Escolha a PO</option>
            {purchaseOrders.map((order) => {
              const reference = canSeePoReference ? String(order.reference ?? '').trim() : ''
              return (
                <option key={order.po} value={order.po}>
                  {formatPurchaseOrderNumber(order.po)}
                  {reference ? ` · ${reference}` : ''}
                </option>
              )
            })}
          </select>
        </div>
        <button
          type="button"
          className={COA_UPLOAD_BUTTON_CLASS}
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={() => handleConfirm(document_)}
        >
          Confirmar
        </button>
        {errors[document_.id] ? (
          <p role="alert" className="documents-row__error coa-link__error">
            {errors[document_.id]}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className={`documents-section coa-orphans${isDesktopVariant ? '' : ' coa-orphans--mobile'}`}>
      <div className="documents-section__header">
        <div>
          <h3 className="documents-section__title">COA sem PO</h3>
          <p className="documents-section__subtitle">
            {isAdmin
              ? 'COAs enviados antes da coluna por PO. Vincule cada arquivo à PO certa.'
              : 'COAs enviados antes da coluna por PO.'}
          </p>
        </div>
        <span className="inline-badge documents-badge--neutral">
          {`${files.length} ${pluralize(files.length, 'arquivo', 'arquivos')}`}
        </span>
      </div>
      <CoaFileList
        documents={files}
        profile={profile}
        isDesktopVariant={isDesktopVariant}
        downloadingId={downloadingId}
        badges={badges}
        ariaLabel="COA sem PO"
        maxVisible={files.length}
        getPurchaseOrderLabel={(document_) => reasons.get(document_.id) ?? ''}
        renderLead={renderLead}
        renderPanel={renderPanel}
        onDownload={onDownload}
        onPreview={onPreview}
        onRequestDelete={onRequestDelete}
        onRequestRename={onRequestRename}
      />
      {panelErrors.map((item) => (
        <p key={item.key} role="alert" className="documents-row__error coa-orphans__error">
          <strong>{item.title}</strong> {item.detail}
        </p>
      ))}
    </div>
  )
}
