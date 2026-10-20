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
import Icon from '../../components/Icon'
import Skeleton from '../../components/Skeleton'
import { getCargoHazardBadges } from './operationalOptions'

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

// F4a (Dashboard.dc.html): data curta "dd/mm" (mock: "23/10"). Acrescenta
// "/aaaa" so quando o ano difere do atual (nao ha ambiguidade na semana, mas os
// favoritos podem apontar para o ano seguinte). Nunca usa toISOString().
export function formatShortDate(value, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toDateKeyLocal(value))
  if (!match) return '-'
  const [, year, month, day] = match
  return Number(year) === now.getFullYear() ? `${day}/${month}` : `${day}/${month}/${year}`
}

// "dd/mm · HH:MM" (horario local). Valor so com data cai em "dd/mm".
export function formatShortDateTime(value, now = new Date()) {
  const date = formatShortDate(value, now)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return date
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) return date
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  return `${date} · ${hours}:${minutes}`
}

// Linha mono "PO 4500128734 · FCL" do mock: o subtitulo do app vem como "PO: n".
export function formatPoLine(subtitle) {
  return String(subtitle ?? '').replace(/^PO:\s*/, 'PO ')
}

const MONTH_ABBREVIATIONS =['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

// Ladrilho de data da chegada (mes mono 10/600 + dia Sora 18/700): usa a chegada
// efetiva (atracacao / chegada aerea) quando existe e, senao, a ETA.
export function getArrivalTile(process) {
  const key = toDateKeyLocal(process?.berthedAt || process?.arrivedAt || process?.eta || '')
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return { key: '', month: '—', day: '--' }
  return { key, month: MONTH_ABBREVIATIONS[Number(match[1]) - 1] ?? '—', day: match[2] }
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

function UnscheduledItem({ process, estimatedDelivery, canSeeName, onSelectProcess }) {
  // PR #6 (2026-07-09): label dinamica baseada no collectionStatus.
  // Antes era fixa "Coleta ainda nao agendada", o que ficava
  // estranho quando o processo ja' estava em transito (a caminho
  // do CD) ou em processamento no CD.
  const statusLabel = getUnscheduledItemLabel(process)
  const hazardBadges = getCargoHazardBadges(process)
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
        <strong>{getProcessTitle(process, canSeeName)}</strong>
        {getProcessSubtitle(process, canSeeName) ? (
          <p>{getProcessSubtitle(process, canSeeName)}</p>
        ) : null}
        <div className="process-item__line">{process.category}</div>
        {hazardBadges.length > 0 ? (
          <div className="process-item__chips">
            {hazardBadges.map((badge) => (
              <span key={badge.label} className={`inline-badge inline-badge--${badge.tone}`}>{badge.label}</span>
            ))}
          </div>
        ) : null}
        {/*
          PR #12 (2026-07-09): badge "Carga a caminho do CD" removida
          do card "Previsao de entrega no armazem" (UnscheduledItem).
          A info ja' e' mostrada no notes (statusLabel abaixo), entao
          renderizar a badge aqui era duplicacao visual. Manter
          somente no UnscheduledItem pra nao' poluir a UX.
        */}
        <ul className="weekly-arrivals-windows">
          <li className="weekly-arrivals-windows__item">
            <span className="detail-label">Previsão de entrega no armazém</span>
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
        <span className="ghost-button ghost-button--secondary weekly-arrivals-item__cta" aria-hidden="true">
          Abrir processo →
        </span>
      </div>
    </div>
  )
}

function ScheduledItem({ process, windows, canSeeName, onSelectProcess }) {
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
        <strong>{getProcessTitle(process, canSeeName)}</strong>
        {getProcessSubtitle(process, canSeeName) ? (
          <p>{getProcessSubtitle(process, canSeeName)}</p>
        ) : null}
        <div className="process-item__line">{process.category}</div>
        <div className="process-item__chips">
          <ProcessDerivedStatusBadge process={process} />
          {getCargoHazardBadges(process).map((badge) => (
            <span key={badge.label} className={`inline-badge inline-badge--${badge.tone}`}>{badge.label}</span>
          ))}
        </div>

        <ul className="weekly-arrivals-windows">
          {windows.map((window) => {
            const deliveryEstimate = getWindowDeliveryEstimate(process, window)
            const deliveryShift = getWindowDeliveryShift(process, window)

            return (
              <li key={window.id} className="weekly-arrivals-windows__item">
                <span className="detail-label">Contêiner {window.containerNumber}</span>
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
        <span className="ghost-button ghost-button--secondary weekly-arrivals-item__cta" aria-hidden="true">
          Abrir processo →
        </span>
      </div>
    </div>
  )
}

// F4a — desktop (>=1041px): linhas do Dashboard.dc.html (ladrilho de data, nome,
// "PO · categoria", previsao de entrega e tag de status derivado). As secoes
// "Coleta agendada" / "Previsao de entrega" do legado viram uma lista unica: a
// diferenca continua legivel pela tag de status e pelas linhas de previsao (uma
// por janela de coleta, com contêiner, turno e observacao).
function DesktopArrivalItem({ entry, canSeeName, onSelectProcess }) {
  const { process } = entry
  const subtitle = formatPoLine(getProcessSubtitle(process, canSeeName))
  const meta = [subtitle, process.category].filter(Boolean).join(' · ')
  const tile = getArrivalTile(process)
  const hazardBadges = getCargoHazardBadges(process)
  const rows = entry.windows
    ? entry.windows.map((window) => ({
        id: window.id,
        container: window.containerNumber,
        delivery: getWindowDeliveryEstimate(process, window),
        shift: getWindowDeliveryShift(process, window),
        note: window.notes,
      }))
    : [
        {
          id: 'estimate',
          container: '',
          delivery: entry.estimatedDelivery,
          shift: '',
          note: getUnscheduledItemLabel(process),
        },
      ]

  return (
    <div
      className="dash-arrival"
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
      <time className="dash-arrival__tile" dateTime={tile.key || undefined}>
        <span className="dash-arrival__month">{tile.month}</span>
        <span className="dash-arrival__day">{tile.day}</span>
      </time>
      <span className="dash-arrival__body">
        <span className="dash-arrival__name">{getProcessTitle(process, canSeeName)}</span>
        {meta ? <span className="dash-arrival__meta">{meta}</span> : null}
        {rows.map((row) => (
          <span key={row.id} className="dash-arrival__delivery">
            {row.container ? `Contêiner ${row.container} · ` : ''}
            Previsão de entrega no armazém: <strong>{formatShortDate(row.delivery)}</strong>
            {row.shift ? ` · ${row.shift}` : ''}
            {row.note ? <small className="dash-arrival__note">{row.note}</small> : null}
          </span>
        ))}
      </span>
      <span className="dash-arrival__aside">
        <ProcessDerivedStatusBadge process={process} />
        {hazardBadges.map((badge) => (
          <span key={badge.label} className={`inline-badge inline-badge--${badge.tone}`}>{badge.label}</span>
        ))}
      </span>
    </div>
  )
}

function DesktopWeeklyArrivals({
  scheduled,
  unscheduled,
  isLoading,
  loadError,
  onRetry,
  onSelectProcess,
  onViewAll,
  canSeeName,
}) {
  const entries = [...scheduled, ...unscheduled]

  return (
    <section className="dash-card dash-arrivals" aria-labelledby="dash-arrivals-title">
      <div className="dash-card__head">
        <h3 id="dash-arrivals-title">Chegadas da semana</h3>
        {onViewAll ? (
          <a
            className="dash-card__link"
            href="/processos"
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
              event.preventDefault()
              onViewAll()
            }}
          >
            Ver todas
          </a>
        ) : null}
      </div>

      {isLoading ? (
        <div className="dash-arrivals__list" role="status" aria-label="Carregando chegadas">
          {[0, 1, 2].map((index) => (
            <div key={index} className="dash-arrival dash-arrival--skeleton" aria-hidden="true">
              <Skeleton width="52px" height="58px" radius="10px" />
              <span className="dash-arrival__body">
                <Skeleton variant="heading" width="62%" />
                <Skeleton variant="line" width="38%" />
                <Skeleton variant="line" width="70%" />
              </span>
              <Skeleton variant="pill" width="110px" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="error-banner error-banner--retry" role="alert">
          <span>{loadError}</span>
          {onRetry ? (
            <button type="button" className="ghost-button" onClick={onRetry}>
              Tentar novamente
            </button>
          ) : null}
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <Icon name="nav-arrivals" size={40} strokeWidth={1.5} className="empty-state__glyph" />
          <strong>Nenhuma chegada prevista</strong>
          <p>Quando um processo tiver coleta agendada ou entrega prevista para a semana, aparecerá aqui.</p>
        </div>
      ) : (
        <div className="dash-arrivals__list">
          {entries.map((entry) => (
            <DesktopArrivalItem
              key={entry.process.id}
              entry={entry}
              canSeeName={canSeeName}
              onSelectProcess={onSelectProcess}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default function WeeklyArrivalsCard({
  processes,
  canSeeName,
  isLoading,
  loadError = null,
  onRetry,
  onSelectProcess,
  variant = 'legacy',
  onViewAll,
}) {
  const { scheduled, unscheduled } = isLoading || loadError
    ? { scheduled: [], unscheduled: [] }
    : getWeeklyArrivalProcesses(processes)
  const total = scheduled.length + unscheduled.length

  if (variant === 'desktop') {
    return (
      <DesktopWeeklyArrivals
        scheduled={scheduled}
        unscheduled={unscheduled}
        isLoading={isLoading}
        loadError={loadError}
        onRetry={onRetry}
        onSelectProcess={onSelectProcess}
        onViewAll={onViewAll}
        canSeeName={canSeeName}
      />
    )
  }

  return (
    <article className="list-card weekly-arrivals-card">
      <div className="card-heading">
        <div>
          <h3>Chegadas da semana</h3>
          <p>
            Previsão de entrega no armazém (sem coleta agendada) e coletas
            agendadas (com data e turno) entre hoje e o proximo domingo.
          </p>
        </div>
      </div>

      <div className="process-list process-list--scroll">
        {isLoading ? (
          <div className="empty-state">
            <strong>Carregando chegadas</strong>
            <p>Buscando processos com chegada prevista para a semana.</p>
          </div>
        ) : loadError ? (
          <div className="error-banner error-banner--retry" role="alert">
            <span>{loadError}</span>
            {onRetry ? (
              <button type="button" className="ghost-button" onClick={onRetry}>
                Tentar novamente
              </button>
            ) : null}
          </div>
        ) : total === 0 ? (
          <div className="empty-state">
            <Icon name="nav-arrivals" size={40} strokeWidth={1.5} className="empty-state__glyph" />
            <strong>Nenhuma chegada prevista</strong>
            <p>Quando um processo tiver coleta agendada ou entrega prevista para a semana, aparecerá aqui.</p>
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
                    canSeeName={canSeeName}
                    onSelectProcess={onSelectProcess}
                  />
                ))}
              </section>
            ) : null}

            {unscheduled.length > 0 ? (
              <section className="weekly-arrivals-section" aria-labelledby="weekly-arrivals-unscheduled-heading">
                <h4 id="weekly-arrivals-unscheduled-heading" className="weekly-arrivals-section__title">
                  Previsão de entrega no armazém
                </h4>
                {unscheduled.map(({ process, estimatedDelivery }) => (
                  <UnscheduledItem
                    key={process.id}
                    process={process}
                    estimatedDelivery={estimatedDelivery}
                    canSeeName={canSeeName}
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