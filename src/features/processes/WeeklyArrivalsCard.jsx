import {
  getProcessTitle,
  getProcessSubtitle,
} from './processLabels'
import { getCollectionWindows } from '../../utils/collectionWindows'
import {
  isCdUnloadingOrReceivedStatus,
  isProcessStatusFinalized,
} from './processStatus'
import ProcessDerivedStatusBadge from './ProcessDerivedStatusBadge'
import { getStatusTagClass, getQuickReadProcessStatus } from './processStatusView'

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function getWeekRange(now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  const dayOfWeek = start.getDay()
  const daysUntilSunday = (7 - dayOfWeek) % 7
  end.setDate(end.getDate() + daysUntilSunday)
  end.setHours(23, 59, 59, 999)

  return { start, end }
}

export function isProcessVisibleInWeeklyArrivals(process) {
  if (!process) return false
  if (isProcessStatusFinalized(process.processStatus)) return false
  if (isCdUnloadingOrReceivedStatus(process.collectionStatus)) return false
  return true
}

export function getWeeklyArrivalProcesses(processes, now = new Date()) {
  const { start, end } = getWeekRange(now)

  return processes
    .map((process) => {
      const windows = getCollectionWindows(process).filter((window) => {
        const time = new Date(window.scheduledAt).getTime()
        return time >= start.getTime() && time <= end.getTime()
      })

      if (windows.length === 0) return null
      if (!isProcessVisibleInWeeklyArrivals(process)) return null

      const sortedWindows = [...windows].sort(
        (left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
      )

      return { process, windows: sortedWindows }
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftTime = new Date(left.windows[0].scheduledAt).getTime()
      const rightTime = new Date(right.windows[0].scheduledAt).getTime()
      return leftTime - rightTime
    })
}

export default function WeeklyArrivalsCard({
  processes,
  isAdmin,
  isLoading,
  onSelectProcess,
}) {
  const items = isLoading ? [] : getWeeklyArrivalProcesses(processes)

  return (
    <article className="list-card">
      <div className="card-heading">
        <div>
          <h3>Chegadas da semana</h3>
          <p>Coletas previstas entre hoje e o próximo domingo.</p>
        </div>
        <span className="inline-badge">
          {isLoading ? '...' : `${items.length} ${items.length === 1 ? 'processo' : 'processos'}`}
        </span>
      </div>

      <div className="process-list process-list--scroll">
        {isLoading ? (
          <div className="empty-state">
            <strong>Carregando chegadas</strong>
            <p>Buscando coletas agendadas para a semana.</p>
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <strong>Nenhuma coleta prevista</strong>
            <p>Quando uma coleta for agendada, o processo aparecerá automaticamente aqui.</p>
          </div>
        ) : (
          items.map(({ process, windows }) => (
            <div key={process.id} className="process-item weekly-arrivals-item">
              <div className="process-item__main">
                <strong>{getProcessTitle(process, isAdmin)}</strong>
                {getProcessSubtitle(process, isAdmin) ? (
                  <p>{getProcessSubtitle(process, isAdmin)}</p>
                ) : null}
                <div className="process-item__line">{process.category}</div>
                <div className="process-item__chips">
                  <span className={getStatusTagClass(process.processStatus)}>
                    {getQuickReadProcessStatus(process)}
                  </span>
                  <ProcessDerivedStatusBadge process={process} />
                </div>

                <ul className="weekly-arrivals-windows">
                  {windows.map((window) => (
                    <li key={window.id} className="weekly-arrivals-windows__item">
                      <span className="detail-label">Container {window.containerNumber}</span>
                      <p>{formatDateTime(window.scheduledAt)}</p>
                      {window.notes ? (
                        <small className="weekly-arrivals-windows__notes">{window.notes}</small>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="process-item__meta process-item__meta--top">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => onSelectProcess?.(process.id)}
                >
                  Abrir processo
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </article>
  )
}