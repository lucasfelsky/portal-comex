// S11-D2: lista de arquivos de COA (card do COA, célula da PO e bloco "COA sem PO"). Cada arquivo: ícone, nome,
// meta, selo da leitura (D-20, só admin), Baixar e Ações (Visualizar/Renomear/Excluir), ambos ícones de 36 px com
// área de toque de 44 px. Acima de `maxVisible` arquivos a lista expande no próprio card ("+N arquivos", L-1).
//
// Nada de envio aqui: os handlers de download/visualizar/excluir/renomear são do `ProcessDocumentsPanel`.

import { useId, useState } from 'react'
import Icon from '../../components/Icon'
import { formatDateTime } from '../../utils/dateFormat'
import DocumentActionsMenu from './DocumentActionsMenu'
import { getDocumentPreviewKind } from './spreadsheetPreview'
import {
  canDeleteDocument,
  canRenameDocument,
  formatDocumentSize,
  getCoaDisplayName,
  getDocumentFileKindLabel,
} from './processDocuments'

export const COA_MAX_VISIBLE_FILES = 2

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural
}

// Data curta (só o dia) para a meta compacta do desktop; o celular mostra data, hora e quem enviou.
function formatShortDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

export default function CoaFileList({
  documents,
  profile,
  isDesktopVariant = false,
  downloadingId = '',
  badges = {},
  ariaLabel = 'Arquivos de COA',
  maxVisible = COA_MAX_VISIBLE_FILES,
  getPurchaseOrderLabel = null,
  renderLead = null,
  renderPanel = null,
  onDownload,
  onPreview,
  onRequestDelete,
  onRequestRename,
}) {
  const [expanded, setExpanded] = useState(false)
  const extraId = useId()
  const visible = documents.slice(0, maxVisible)
  const extra = documents.slice(maxVisible)

  function buildMenuItems(document_, displayName) {
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

  function renderItem(document_) {
    const displayName = getCoaDisplayName(document_)
    const badge = badges[document_.id] ?? null
    const poLabel = getPurchaseOrderLabel ? getPurchaseOrderLabel(document_) : ''
    const kindAndSize = [getDocumentFileKindLabel(document_.mimeType, document_.name), formatDocumentSize(document_.size)]
    const metaText = [
      poLabel,
      ...kindAndSize,
      isDesktopVariant ? formatShortDate(document_.uploadedAt) : formatDateTime(document_.uploadedAt),
      isDesktopVariant ? '' : document_.uploadedByName,
    ]
      .filter(Boolean)
      .join(' · ')
    const lead = renderLead ? renderLead(document_) : null
    const panel = renderPanel ? renderPanel(document_) : null
    return (
      <li key={document_.id} className={`coa-file${lead ? ' coa-file--lead' : ''}`}>
        <span className="coa-file__icon" aria-hidden="true">
          <Icon name="file" size={16} />
        </span>
        <div className="coa-file__text">
          <p className="coa-file__name" title={displayName}>
            {displayName}
          </p>
          {displayName !== document_.name ? <p className="coa-file__original">{document_.name}</p> : null}
          <p className="coa-file__meta">{metaText}</p>
          {badge ? <span className={`inline-badge documents-coa-badge${badge.tone}`}>{badge.text}</span> : null}
        </div>
        <div className="coa-file__actions">
          {lead}
          <button
            type="button"
            className="coa-icon-button"
            aria-label={`Baixar ${displayName}`}
            title="Baixar"
            disabled={downloadingId === document_.id}
            aria-busy={downloadingId === document_.id || undefined}
            onClick={() => onDownload?.(document_)}
          >
            <Icon name="download" size={16} />
          </button>
          <DocumentActionsMenu title={displayName} mobile={!isDesktopVariant} items={buildMenuItems(document_, displayName)} />
        </div>
        {panel}
      </li>
    )
  }

  if (documents.length === 0) return null

  return (
    <>
      <ul className="coa-files" role="list" aria-label={ariaLabel}>
        {visible.map(renderItem)}
      </ul>
      {extra.length > 0 && expanded ? (
        <ul id={extraId} className="coa-files coa-files--extra" role="list" aria-label={ariaLabel.replace(/^Arquivos/, 'Mais arquivos')}>
          {extra.map(renderItem)}
        </ul>
      ) : null}
      {extra.length > 0 ? (
        <button
          type="button"
          className="coa-more"
          aria-expanded={expanded}
          aria-controls={expanded ? extraId : undefined}
          onClick={() => setExpanded((current) => !current)}
        >
          <span>{expanded ? 'Mostrar menos' : `+${extra.length} ${pluralize(extra.length, 'arquivo', 'arquivos')}`}</span>
          <Icon name="chevron-down" size={14} />
        </button>
      ) : null}
    </>
  )
}
