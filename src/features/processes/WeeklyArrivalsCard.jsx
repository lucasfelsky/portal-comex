import {
  getProcessTitle,
  getProcessSubtitle,
} from './processLabels'
import { getCollectionWindows } from '../../utils/collectionWindows'
import {
  isProcessTrulyFinalized,
  getUnscheduledItemLabel,
} from './processStatus'
import {
  getEstimatedDeliveryDate,
  getScheduledCollectionDeliveryShift,
} from '../../utils/deliveryForecast'
import ProcessDerivedStatusBadge from './ProcessDerivedStatusBadge'

// PR #13 (2026-07-09): helper pra extrair YYYY-MM-DD em local
// time (nao UTC). `Date.toISOString().slice(0, 10)` sempre usa
// UTC e quebra pra quem esta' em timezone west (ex: BRT = UTC-3,
// meia-noite local vira 03:00 do dia seguinte em UTC).
// Usamos componentes locais e zero-pad manual.
// Se o input for uma string YYYY-MM-DD (formato de data pura),
// retornamos a string direto sem fazer parse (evita virar meia-
// noite UTC, que em BRT vira 21:00 do dia anterior e bagunca a
// comparacao).
// Exportado (sem underscore) pra ser testavel em unit tests
// sem precisar reimplementar a logica.
export function toDateKeyLocal(value) {
  if (typeof value === 'string') {
    // Match exato de YYYY-MM-DD (formato de data, sem hora)
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
    // Outros formatos de string: parsea como Date
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return ''
}

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

function formatDateOnly(value) {
  if (!value) return '-'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  if (match) return `${match[3]}/${match[2]}/${match[1]}`
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function getWindowDeliveryEstimate(process, window) {
  if (!process || !window?.scheduledAt) return ''

  return getEstimatedDeliveryDate({
    ...process,
    collectionScheduledAt: window.scheduledAt,
    collectionStatus: 'Coleta Agendada',
  })
}

function getWindowDeliveryShift(process, window) {
  if (!process || !window?.scheduledAt) return ''

  return getScheduledCollectionDeliveryShift({
    ...process,
    collectionScheduledAt: window.scheduledAt,
    collectionStatus: 'Coleta Agendada',
  })
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

// PR #5 (2026-07-09): considera "finalizado" APENAS quando o
// processo ja' entrou em estoque. Antes, usava
// `isProcessStatusFinalized` (processStatus = 'Carga recebida'), o que
// escondia o processo do dashboard antes da hora — antes mesmo de
// entrar em estoque, o que era o problema reportado. Tambem removi
// `isCdUnloadingOrReceivedStatus` daqui (incluia "em estoque"); a
// checagem de "em estoque" ja' e' feita por `isProcessTrulyFinalized`.
export function isProcessVisibleInWeeklyArrivals(process) {
  if (!process) return false
  if (isProcessTrulyFinalized(process)) return false
  return true
}

// Extrai janelas agendadas dentro da semana (com fallback pro campo
// legado `collectionScheduledAt`).
function getWeekWindows(process, start, end) {
  const windows = getCollectionWindows(process)
  return windows
    .filter((window) => {
      if (!window?.scheduledAt) return false
      const time = new Date(window.scheduledAt).getTime()
      if (Number.isNaN(time)) return false
      return time >= start.getTime() && time <= end.getTime()
    })
    .sort((left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime())
}

// PR #5 (2026-07-09): retorna 2 grupos:
// - `scheduled`: processos com pelo menos 1 janela agendada na semana.
//   Mostra data da janela + shift via `getScheduledCollectionDelivery*`.
// - `unscheduled`: processos SEM janela mas com previsao automatica de
//   entrega no armazem caindo na semana (via `getEstimatedDeliveryDate`).
//   Mostra a previsao de entrega no CD (ETA + business days / rolling
//   customs / warehouseDeliveryDateOverride).
// O `isProcessVisibleInWeeklyArrivals` ja' filtra processos com
// `collectionStatus === 'Carga disponível em estoque'` (sinal de
// finalizado de verdade).
export function getWeeklyArrivalProcesses(processes, now = new Date()) {
  const { start, end } = getWeekRange(now)

  const scheduled = []
  const unscheduled = []

  for (const process of processes) {
    if (!isProcessVisibleInWeeklyArrivals(process)) continue

    const weekWindows = getWeekWindows(process, start, end)
    if (weekWindows.length > 0) {
      scheduled.push({ process, windows: weekWindows })
      continue
    }

    // Sem janela agendada na semana: ver se a previsao automatica de
    // entrega no armazem cai na semana. Se sim, entra como
    // "Coleta nao agendada".
    // PR #13 (2026-07-09): comparacao agora e' feita em YYYY-MM-DD
    // (so' a data), nao em ms (que tinha problema de timezone:
    // `new Date('2026-07-09')` e' meia-noite UTC, mas `start` e' meia-
    // noite local. Quando a janela era HOJE matutino, a previsao
    // calculada (hoje) caia ANTES de `start` e o processo sumia do
    // card. Agora extraimos a data em local time e comparamos
    // diretamente.
    const estimatedDelivery = getEstimatedDeliveryDate(process)
    if (!estimatedDelivery) continue

    const deliveryKey = toDateKeyLocal(estimatedDelivery)
    const startKey = toDateKeyLocal(start)
    const endKey = toDateKeyLocal(end)
    if (deliveryKey < startKey || deliveryKey > endKey) continue

    unscheduled.push({ process, estimatedDelivery })
  }

  // Ordena: scheduled pela data da primeira janela, unscheduled pela
  // data de previsao.
  const byFirstWindow = (left, right) =>
    new Date(left.windows[0].scheduledAt).getTime() - new Date(right.windows[0].scheduledAt).getTime()
  const byEstimatedDelivery = (left, right) =>
    new Date(left.estimatedDelivery).getTime() - new Date(right.estimatedDelivery).getTime()

  scheduled.sort(byFirstWindow)
  unscheduled.sort(byEstimatedDelivery)

  return { scheduled, unscheduled }
}

function UnscheduledItem({ process, estimatedDelivery, isAdmin, onSelectProcess }) {
  // PR #6 (2026-07-09): label dinamica baseada no collectionStatus.
  // Antes era fixa "Coleta ainda nao agendada", o que ficava
  // estranho quando o processo ja' estava em transito (a caminho
  // do CD) ou em processamento no CD.
  const statusLabel = getUnscheduledItemLabel(process)
  return (
    <div
      key={process.id}
      className="process-item weekly-arrivals-item weekly-arrivals-item--clickable"
      role="button"
      tabIndex={0}
      onClick={() => onSelectProcess?.(process.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelectProcess?.(process.id)
        }
      }}
    >
      <div className="process-item__main">
        <strong>{getProcessTitle(process, isAdmin)}</strong>
        {getProcessSubtitle(process, isAdmin) ? (
          <p>{getProcessSubtitle(process, isAdmin)}</p>
        ) : null}
        <div className="process-item__line">{process.category}</div>
        {/*
          PR #12 (2026-07-09): badge "Carga a caminho do CD" removida
          do card "Previsao de entrega no armazem" (UnscheduledItem).
          A info ja' e' mostrada no notes (statusLabel abaixo), entao
          renderizar a badge aqui era duplicacao visual. Manter
          somente no UnscheduledItem pra nao' poluir a UX.
        */}
        <ul className="weekly-arrivals-windows">
          <li className="weekly-arrivals-windows__item">
            <span className="detail-label">Previsao de entrega no armazem</span>
            <p className="weekly-arrivals-windows__row">
              <strong className="weekly-arrivals-windows__date">{formatDateOnly(estimatedDelivery)}</strong>
            </p>
            {statusLabel ? (
              <small className="weekly-arrivals-windows__notes">{statusLabel}</small>
            ) : null}
          </li>
        </ul>
      </div>
      <div className="process-item__meta process-item__meta--top">
        <span className="ghost-button weekly-arrivals-item__cta" aria-hidden="true">
          Abrir processo →
        </span>
      </div>
    </div>
  )
}

function ScheduledItem({ process, windows, isAdmin, onSelectProcess }) {
  return (
    <div
      key={process.id}
      className="process-item weekly-arrivals-item weekly-arrivals-item--clickable"
      role="button"
      tabIndex={0}
      onClick={() => onSelectProcess?.(process.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelectProcess?.(process.id)
        }
      }}
    >
      <div className="process-item__main">
        <strong>{getProcessTitle(process, isAdmin)}</strong>
        {getProcessSubtitle(process, isAdmin) ? (
          <p>{getProcessSubtitle(process, isAdmin)}</p>
        ) : null}
        <div className="process-item__line">{process.category}</div>
        <div className="process-item__chips">
          <ProcessDerivedStatusBadge process={process} />
        </div>

        <ul className="weekly-arrivals-windows">
          {windows.map((window) => {
            const deliveryEstimate = getWindowDeliveryEstimate(process, window)
            const deliveryShift = getWindowDeliveryShift(process, window)

            return (
              <li key={window.id} className="weekly-arrivals-windows__item">
                <span className="detail-label">Container {window.containerNumber}</span>
                <p className="weekly-arrivals-windows__row">
                  <strong className="weekly-arrivals-windows__date">{formatDateOnly(deliveryEstimate)}</strong>
                  {deliveryShift ? (
                    <span className="weekly-arrivals-windows__shift">{deliveryShift}</span>
                  ) : null}
                </p>
                {window.notes ? (
                  <small className="weekly-arrivals-windows__notes">{window.notes}</small>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
      <div className="process-item__meta process-item__meta--top">
        <span className="ghost-button weekly-arrivals-item__cta" aria-hidden="true">
          Abrir processo →
        </span>
      </div>
    </div>
  )
}

export default function WeeklyArrivalsCard({
  processes,
  isAdmin,
  isLoading,
  onSelectProcess,
}) {
  const { scheduled, unscheduled } = isLoading
    ? { scheduled: [], unscheduled: [] }
    : getWeeklyArrivalProcesses(processes)
  const total = scheduled.length + unscheduled.length

  return (
    <article className="list-card">
      <div className="card-heading">
        <div>
          <h3>Chegadas da semana</h3>
          <p>
            Previsao de entrega no armazem (sem coleta agendada) e coletas
            agendadas (com data e turno) entre hoje e o proximo domingo.
          </p>
        </div>
        <span className="inline-badge">
          {isLoading ? '...' : `${total} ${total === 1 ? 'processo' : 'processos'}`}
        </span>
      </div>

      <div className="process-list process-list--scroll">
        {isLoading ? (
          <div className="empty-state">
            <strong>Carregando chegadas</strong>
            <p>Buscando processos com chegada prevista para a semana.</p>
          </div>
        ) : total === 0 ? (
          <div className="empty-state">
            <strong>Nenhuma chegada prevista</strong>
            <p>Quando um processo tiver coleta agendada ou entrega prevista para a semana, aparecera aqui.</p>
          </div>
        ) : (
          <>
            {scheduled.length > 0 ? (
              <section className="weekly-arrivals-section" aria-labelledby="weekly-arrivals-scheduled-heading">
                <h4 id="weekly-arrivals-scheduled-heading" className="weekly-arrivals-section__title">
                  Coleta agendada
                </h4>
                {scheduled.map(({ process, windows }) => (
                  <ScheduledItem
                    key={process.id}
                    process={process}
                    windows={windows}
                    isAdmin={isAdmin}
                    onSelectProcess={onSelectProcess}
                  />
                ))}
              </section>
            ) : null}

            {unscheduled.length > 0 ? (
              <section className="weekly-arrivals-section" aria-labelledby="weekly-arrivals-unscheduled-heading">
                <h4 id="weekly-arrivals-unscheduled-heading" className="weekly-arrivals-section__title">
                  Previsao de entrega no armazem
                </h4>
                {unscheduled.map(({ process, estimatedDelivery }) => (
                  <UnscheduledItem
                    key={process.id}
                    process={process}
                    estimatedDelivery={estimatedDelivery}
                    isAdmin={isAdmin}
                    onSelectProcess={onSelectProcess}
                  />
                ))}
              </section>
            ) : null}
          </>
        )}
      </div>
    </article>
  )
}