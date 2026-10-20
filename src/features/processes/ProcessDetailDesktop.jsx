import { useRef } from 'react'
import Spinner from '../../components/Spinner'
import { formatShortDate } from './WeeklyArrivalsCard'
import { hasArrivalSignal, hasDateValue } from './arrivalCustoms'
import { getDisplayedProcessStatus, isProcessStatusFinalized } from './processStatus'
import { getStatusTagClass } from './processStatusView'
import { getProcessStage, PROCESS_STAGES } from './processStage'
import { getProcessSubtitle, getProcessTitle } from './processLabels'
import { isMaritimeCategory } from './processCategories'

// Refino visual F4c — cabecalho, timeline e abas do detalhe (Processo.dc.html),
// arvore DESKTOP (>= 1041px). Escolhida pelo ProcessDetailView por matchMedia;
// tablet e mobile seguem na arvore legada (mobilebar, timeline compacta, select
// de secoes), que nao passa por aqui. Presentacional: todo o estado (menu
// "Mais acoes", confirmacao de exclusao, abas) mora no ProcessDetailView.

const DASH = '—'

// Data de uma etapa: dd/mm (com ano so quando difere do atual), horario local.
function short(value) {
  const text = formatShortDate(value)
  return text === '-' ? '' : text
}

// Datas mono por etapa da timeline (PLAN F4c item 2):
//   Embarque = ETD | Transito = ETD – ETA | Chegada = atracacao/chegada confirmada
//   ou "ETA dd/mm" | Liberacao = desembaraco concluido ou "—" |
//   Entrega = recebimento da carga ou "Prev. dd/mm" (previsao de entrega no armazem).
export function getTimelineStageDates(process, deliveryDate) {
  const etd = short(process?.etd || process?.shippedAt)
  const eta = short(process?.eta)
  const arrivalValue = isMaritimeCategory(process?.category) ? process?.berthedAt : process?.arrivedAt
  const arrival = hasArrivalSignal(process) && hasDateValue(arrivalValue) ? short(arrivalValue) : ''
  const cleared = short(process?.clearanceCompletedAt)
  const received = short(process?.cargoReceivedAt)
  const delivery = short(deliveryDate)

  let transit = DASH
  if (etd && eta) transit = `${etd} – ${eta}`
  else if (eta) transit = `até ${eta}`
  else if (etd) transit = `${etd} –`

  return [
    etd || DASH,
    transit,
    arrival || (eta ? `ETA ${eta}` : DASH),
    cleared || DASH,
    received || (delivery ? `Prev. ${delivery}` : DASH),
  ]
}

const STAR_PATH = 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'

export function DetailTimeline({ process, deliveryDate }) {
  const { currentStage, isComplete } = getProcessStage(process)
  const dates = getTimelineStageDates(process, deliveryDate)
  // Trilho unico: o preenchimento cobre as colunas concluidas (tudo, quando a
  // carga ja foi recebida) e anima por transform: scaleX.
  const filled = isComplete ? PROCESS_STAGES.length : currentStage

  return (
    <div className="pdv-timeline">
      <span className="pdv-timeline__track" aria-hidden="true">
        {PROCESS_STAGES.map((stage) => (
          <span key={stage} className="pdv-timeline__seg" />
        ))}
        {filled > 0 ? (
          <span className="pdv-timeline__fill" style={{ '--pdv-filled': filled }}>
            {PROCESS_STAGES.slice(0, filled).map((stage) => (
              <span key={stage} className="pdv-timeline__seg" />
            ))}
          </span>
        ) : null}
      </span>
      <ol className="pdv-timeline__list" aria-label="Etapas">
        {PROCESS_STAGES.map((stage, index) => {
          const done = isComplete || index < currentStage
          const now = !isComplete && index === currentStage
          const state = done ? 'done' : now ? 'now' : 'todo'
          return (
            <li
              key={stage}
              className={`pdv-stage pdv-stage--${state}`}
              style={{ '--i': index }}
              aria-current={now ? 'step' : undefined}
            >
              <span className="pdv-stage__node" aria-hidden="true" />
              <span className="pdv-stage__label">{stage}</span>
              <span className="pdv-stage__date">{dates[index]}</span>
              <span className="pdv-sr">{done ? 'Etapa concluída' : now ? 'Etapa atual' : 'Etapa futura'}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function DetailHeaderCard({
  process,
  deliveryDate,
  canSeeName,
  isAdmin,
  isSaving,
  isFavorite,
  favoriteStarPop,
  canEditPostReceiptNotes,
  canEditCollectionStatus,
  isMoreOpen,
  moreContainerRef,
  moreTriggerRef,
  firstMenuItemRef,
  onToggleMore,
  onOpenDeleteConfirm,
  onBack,
  onToggleFavorite,
  onEditMode,
  onPostReceiptEditMode,
  onCollectionStatusEditMode,
}) {
  const meta = [process.category, getProcessSubtitle(process, canSeeName).replace(/^PO:\s*/, 'PO '), process.destination]
    .filter(Boolean)
    .join(' · ')
  const favoriteLabel = isFavorite ? 'Desfavoritar' : 'Favoritar'

  return (
    <section className="pdv-card pdv-head" aria-label="Resumo do processo">
      <div className="pdv-head__row">
        <div className="pdv-head__titles">
          <button type="button" className="pdv-back" onClick={onBack}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="m15 6-6 6 6 6" />
            </svg>
            Voltar
          </button>
          <div className="pdv-head__title-line">
            <h2 className="pdv-head__name">{getProcessTitle(process, canSeeName)}</h2>
            <span className={getStatusTagClass(process.processStatus)}>
              {getDisplayedProcessStatus(process.processStatus, process.category)}
            </span>
          </div>
          <p className="pdv-head__meta">{meta}</p>
        </div>
        <div className="pdv-head__actions process-detail-toolbar">
          <button
            type="button"
            className={`pdv-icon-btn pdv-fav${isFavorite ? ' pdv-icon-btn--on' : ''}`}
            aria-label={favoriteLabel}
            aria-pressed={isFavorite}
            onClick={() => onToggleFavorite(process.id)}
          >
            <svg
              className={`pdv-star${favoriteStarPop ? ' favorite-star--pop' : ''}`}
              width="18"
              height="18"
              viewBox="0 0 24 24"
              strokeWidth="1.6"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d={STAR_PATH} />
            </svg>
            <span className="pdv-sr">{favoriteLabel}</span>
          </button>
          {canEditPostReceiptNotes && isProcessStatusFinalized(process.processStatus) ? (
            <button type="button" className="secondary-button pdv-btn" onClick={onPostReceiptEditMode}>
              Editar observações
            </button>
          ) : null}
          {canEditCollectionStatus ? (
            <button type="button" className="secondary-button pdv-btn" onClick={onCollectionStatusEditMode}>
              Status de coleta
            </button>
          ) : null}
          {isAdmin ? (
            <button type="button" className="primary-button pdv-btn pdv-btn--primary" onClick={onEditMode}>
              Editar processo
            </button>
          ) : null}
          {isAdmin ? (
            <div className="process-detail-more" ref={moreContainerRef}>
              <button
                type="button"
                className="pdv-icon-btn pdv-more process-detail-more__trigger"
                aria-label="Mais ações"
                title="Mais ações"
                aria-haspopup="menu"
                aria-expanded={isMoreOpen}
                aria-controls="process-detail-more-menu"
                ref={moreTriggerRef}
                onClick={onToggleMore}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                  <circle cx="5" cy="12" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="19" cy="12" r="1.8" />
                </svg>
              </button>
              {isMoreOpen ? (
                <div id="process-detail-more-menu" role="menu" className="process-detail-more__menu">
                  <button
                    type="button"
                    role="menuitem"
                    ref={firstMenuItemRef}
                    className="process-detail-more__item process-detail-more__item--danger"
                    disabled={isSaving}
                    onClick={onOpenDeleteConfirm}
                  >
                    {isSaving ? <Spinner size={14} /> : null} Excluir processo
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <DetailTimeline process={process} deliveryDate={deliveryDate} />
    </section>
  )
}

// Controle segmentado (Processo.dc.html `.pd-tab`): role tablist/tab com
// setas, Home e End. O painel ativo e' o tabpanel referenciado por `panelId`.
export function DetailTabs({ tabs, activeKey, panelId, onChange }) {
  const listRef = useRef(null)

  function handleKeyDown(event) {
    const keys = tabs.map((tab) => tab.key)
    const index = keys.indexOf(activeKey)
    let next = -1
    if (event.key === 'ArrowRight') next = (index + 1) % keys.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + keys.length) % keys.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = keys.length - 1
    if (next < 0) return
    event.preventDefault()
    onChange(keys[next])
    requestAnimationFrame(() => listRef.current?.querySelectorAll('[role="tab"]')[next]?.focus())
  }

  return (
    <div className="pdv-tabs" role="tablist" aria-label="Seções do processo" ref={listRef} onKeyDown={handleKeyDown}>
      {tabs.map((tab) => {
        const selected = tab.key === activeKey
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`${panelId}-tab-${tab.key}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            className={`pdv-tab${selected ? ' pdv-tab--active' : ''}`}
            onClick={() => onChange(tab.key)}
          >
            {tab.label}
            {tab.badge ? <span className="documents-tab-count">{tab.badge}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
