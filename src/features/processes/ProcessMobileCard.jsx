// Cartao de processo de Chegadas no mobile (<=720px, remake F4). Substitui a
// linha cinza do ProcessRow SO' no mobile: titulo com as marcas de carga
// (ProcessCargoMarks), "PO · modal" em mono, 5 segmentos de etapa, etapa + ETA,
// porto + fornecedor e as tags de STATUS em texto. Carga inflamavel/perigosa e
// o volume viram icones (as pilulas de texto equivalentes nao renderizam aqui;
// no tablet/desktop continuam). O wrapper de swipe (favoritar/arquivar) e as
// props sao as do ProcessRow: o pai passa `swipe`, `swipeActions` e o estado.
import Icon from '../../components/Icon'
import ProcessCargoMarks from './ProcessCargoMarks'
import { canShowProcessName, getProcessSubtitle, getProcessTitle } from './processLabels'
import { getProcessStage, PROCESS_STAGES } from './processStage'
import { getStatusTagClass } from './processStatusView'
import { shouldHideProcessStatusBadge } from './processStatus'
import { isAirCategory } from './processCategories'
import { formatDate, hasUpdatedEta } from './processListShared'

// "Carga inflamável"/"Carga perigosa" viraram icones: saem das tags do cartao.
const CARGO_ALERT_LABELS = new Set(['Carga inflamável', 'Carga perigosa'])
// Escalonamento da entrada (55ms por cartao, limitado a 10 para listas longas).
const STAGGER_MS = 55
const STAGGER_CAP = 10

export default function ProcessMobileCard({
  item,
  index = 0,
  canSeeName,
  isSelected,
  isFavorite,
  isRevealing,
  isArchivedRow = false,
  hideSchedule,
  alerts,
  swipe,
  swipeActions,
  favoriteStarPop,
  onSelectProcess,
  onToggleFavorite,
}) {
  const { currentStage, isComplete } = getProcessStage(item)
  const activeStage = isComplete ? PROCESS_STAGES.length : currentStage
  const stageLabel = PROCESS_STAGES[Math.min(activeStage, PROCESS_STAGES.length - 1)]
  const isAir = isAirCategory(item.category)

  const subtitle = getProcessSubtitle(item, canSeeName)
  const modalLabel = isAir ? 'Aéreo' : 'Marítimo'

  // Mesma regra do detalhe: o fornecedor do processo so' aparece onde o nome
  // aparece e nunca no CONSOLIDADO (fornecedor e referencia vivem em cada PO).
  const supplier =
    canShowProcessName(item, canSeeName) && item.category !== 'CONSOLIDADO'
      ? String(item.supplierName ?? '').trim()
      : ''
  const port = String(item.destination ?? '').trim()
  const etaText = hideSchedule || !item.eta ? '' : `ETA ${formatDate(item.eta).slice(0, 5)}`

  // O "+N" continua sobre a lista JA filtrada (sem as duas marcas de carga).
  const tagAlerts = alerts.filter((alert) => !CARGO_ALERT_LABELS.has(alert.label))
  const showStatusTag = !shouldHideProcessStatusBadge(item)

  return (
    <div
      className={`process-swipe-row${isRevealing ? ' process-swipe-row--revealing' : ''}`}
      style={{ '--d': `${Math.min(index, STAGGER_CAP) * STAGGER_MS}ms` }}
    >
      {swipeActions}
      <div
        role="button"
        tabIndex={0}
        className={`process-item process-item--button process-swipe-row__content m-pc${isSelected ? ' process-item--selected' : ''}`}
        style={{
          transform: `translateX(${swipe.translateX}px)`,
          transition: swipe.isDragging ? 'none' : undefined,
        }}
        onClick={swipe.guardClick(() => onSelectProcess(item.id))}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            swipe.guardClick(() => onSelectProcess(item.id))()
          }
        }}
        {...swipe.handlers}
      >
        <div className="m-pc__top">
          <div className="m-pc__id">
            <div className="m-pc__head">
              <strong className="m-pc__title">{getProcessTitle(item, canSeeName)}</strong>
              <ProcessCargoMarks process={item} />
            </div>
            <p className="m-pc__po">
              {subtitle ? (
                <>
                  <span>{subtitle}</span> ·{' '}
                </>
              ) : null}
              <span>{modalLabel}</span>
            </p>
          </div>
          {onToggleFavorite && !isArchivedRow ? (
            <button
              type="button"
              className={`m-pc__star${isFavorite ? ' m-pc__star--on' : ''}${favoriteStarPop ? ' m-pc__star--pop' : ''}`}
              aria-label={`${isFavorite ? 'Desfavoritar' : 'Favoritar'} ${getProcessTitle(item, canSeeName)}`}
              onClick={(event) => {
                event.stopPropagation()
                onToggleFavorite(item.id)
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Icon name={isFavorite ? 'star-filled' : 'star'} size={20} />
            </button>
          ) : null}
        </div>

        <div
          className="m-seg5"
          role="img"
          aria-label={`Etapa ${Math.min(activeStage + 1, PROCESS_STAGES.length)} de ${PROCESS_STAGES.length}: ${stageLabel}`}
        >
          {PROCESS_STAGES.map((label, stageIndex) => (
            <i
              key={label}
              style={{ '--k': stageIndex }}
              className={
                stageIndex < activeStage
                  ? 'm-seg5__i m-seg5__i--done'
                  : stageIndex === activeStage
                    ? 'm-seg5__i m-seg5__i--now'
                    : 'm-seg5__i'
              }
            />
          ))}
        </div>

        <div className="m-pc__meta">
          <span className="m-pc__stage">{stageLabel}</span>
          {etaText ? (
            <span className={`m-pc__eta${hasUpdatedEta(item) ? ' m-pc__eta--updated' : ''}`}>{etaText}</span>
          ) : null}
        </div>

        {port || supplier ? (
          <div className="m-pc__meta">
            {port ? (
              <span className="m-pc__port">
                <Icon name={isAir ? 'plane' : 'anchor'} size={15} />
                {port}
              </span>
            ) : (
              <span />
            )}
            {supplier ? <span className="m-pc__supplier">{supplier}</span> : null}
          </div>
        ) : null}

        {showStatusTag || tagAlerts.length > 0 ? (
          <div className="process-item__chips m-pc__tags">
            {showStatusTag ? (
              <span className={getStatusTagClass(item.processStatus)}>{item.processStatus}</span>
            ) : null}
            {tagAlerts.map((alert, alertIndex) => (
              <span
                key={`${alert.label}-${alertIndex}`}
                className={`inline-badge inline-badge--${alert.tone}${alertIndex >= 2 ? ' inline-badge--overflow' : ''}`}
              >
                {alert.label}
              </span>
            ))}
            {tagAlerts.length > 2 ? (
              <span
                className="inline-badge inline-badge--more"
                title={`${tagAlerts.length - 2} alerta(s) a mais`}
              >
                +{tagAlerts.length - 2}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
