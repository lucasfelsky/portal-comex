import { useEffect, useMemo, useState } from 'react'
import useMediaQuery from '../hooks/useMediaQuery'
import { useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import Stagger from '../components/Stagger'
import {
  getChannelToneClass,
  getDisplayedCollectionStatus,
  isCollectionScheduleRetainingStatus as keepsCollectionSchedule,
  isDtaTransitCompletedStatus,
  shouldHideProcessCardSchedule,
  shouldHideProcessStatusBadge,
} from '../features/processes/processStatusView'
import {
  getProcessTitle,
  getProcessSubtitle,
} from '../features/processes/processLabels'
import {
  isMaritimeCategory,
  isAirCategory,
  shouldShowContainerQuantity,
} from '../features/processes/processCategories'
import ProcessDerivedStatusBadge from '../features/processes/ProcessDerivedStatusBadge'
import { getProcessStatusDetail } from '../features/processes/processDerivedStatus'
import { getCargoHazardBadges } from '../features/processes/operationalOptions'
import WeeklyArrivalsCard, {
  formatPoLine,
  formatShortDate,
  formatShortDateTime,
} from '../features/processes/WeeklyArrivalsCard'
import {
  formatBarStatusLabel,
  getAnnouncementDayLabel,
  getDashboardKpiNotes,
  getDashboardKpis,
  getPreviousWeekArrivalsCount,
  summarizeAnnouncement,
} from '../features/processes/dashboardKpis'
import { getProcessStage, PROCESS_STAGES } from '../features/processes/processStage'
import { projectProcessesForViewer } from '../features/processes/customsVisibility'
import Icon from '../components/Icon'
import StatCard from '../components/StatCard'
import { getCollectionWindows } from '../utils/collectionWindows'
import { formatRelativeTime } from '../utils/dateFormat'
import { listAnnouncements } from '../services/announcementsRepository'
import { getBarStatus } from '../services/barStatusRepository'
import { listProcesses } from '../services/processesRepository'
import { buildProcessLinkState } from '../utils/processNavigation'
import { getEstimatedDeliveryDate } from '../utils/deliveryForecast'
import { formatCargoUnit, formatContainerCount, formatPalletCount } from '../utils/cargoUnits'
import { getEffectiveLicenses } from '../features/processes/licenses'
import { hasArrivalSignal, hasCargoPresenceSignal } from '../features/processes/arrivalCustoms'

function formatTimestamp(value) {
  if (!value) return 'Agora'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

// Ciclo 2a (redesign Fase 2): eyebrow do hero desktop do Dashboard — so'
// exibicao (nao e' data manual comparavel/armazenada, entao nao precisa
// de `toDateKey`/`toDateKeyLocal`; segue o mesmo padrao de formatacao
// via `Intl.DateTimeFormat` ja usado por `formatDate`/`formatDateTime`
// acima).
function formatHeadingDate(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(value)
}

function getEstimatedDeliveryLabel(process) {
  return formatDate(getEstimatedDeliveryDate(process))
}

const isRestrictedCategory = (category) => ['FCL', 'LCL', 'AEREO'].includes(category)

function getDestinationLabel(category) {
  return category === 'AEREO' ? 'Aeroporto de Destino' : 'Porto de Atracação'
}

function getDuimpSummary(process) {
  const status = String(process?.duimpStatus ?? '').trim()
  const channel = String(process?.parameterizationChannel ?? '').trim()

  if (!status) return '-'
  if (channel) return `${status} · Canal ${channel}`
  return status
}

function hasUpdatedEta(process) {
  return Boolean(process?.eta && process?.etaOriginal && process.etaOriginal !== process.eta)
}

// ---------------------------------------------------------------------------
// Refino F4a (Dashboard.dc.html) — markup do DESKTOP (>= 1041px).
//
// O desktop renderiza uma arvore propria (classes `dash-*`, escopadas por
// `.surface--dashboard` no CSS); tablet e mobile continuam com a arvore legada
// (`dashboard-*`), byte a byte igual a antes, porque `src/mobile-redesign.css`
// e os blocos `max-width` dependem dessa estrutura. A escolha e feita por
// matchMedia (mesmo breakpoint do CSS), entao nunca ha DOM duplicado.
// ---------------------------------------------------------------------------

const DESKTOP_QUERY = '(min-width: 1041px)'

// "SEGUNDA · 19 DE OUTUBRO" (o maiusculo vem do CSS): dia da semana sem "-feira".
function formatDesktopEyebrowDate(value) {
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' })
    .format(value)
    .replace(/-feira$/i, '')
  const rest = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(value)
  return `${weekday} · ${rest}`
}

// Tom do valor do canal de parametrizacao (Verde/Amarelo/Vermelho/Cinza).
function getChannelTone(channel) {
  if (channel === 'Verde') return 'success'
  if (channel === 'Amarelo') return 'warning'
  if (channel === 'Vermelho') return 'danger'
  if (channel === 'Cinza') return 'neutral'
  return ''
}

// Fatos de valor longo (DUIMP + canal, anuencias, coleta, janelas) ocupam a linha
// inteira da grade de 3 colunas; os curtos (porto, previsao, presenca...) seguem 1/3.
function isWideFact(key) {
  return key === 'licenses' || key === 'duimp' || key === 'collection' || key.startsWith('window-')
}

// Fatos do card de favorito (3 colunas, quebra de linha se houver mais de 3):
// reaproveita TODAS as linhas que o card legado mostra (destino, previsao,
// pos-atracacao / DTA, DUIMP, coleta e janelas), so' com o rotulo do mock.
function getFavoriteFacts(item) {
  const maritimePostArrival = isMaritimeCategory(item.category) && hasArrivalSignal(item)
  const airPostArrival = isAirCategory(item.category) && hasArrivalSignal(item)
  const hideSchedule = shouldHideProcessCardSchedule(item)
  const hideEta = maritimePostArrival || airPostArrival || hideSchedule
  const facts = []

  facts.push({
    key: 'destination',
    label: item.category === 'AEREO' ? 'Aeroporto de destino' : 'Porto de atracação',
    value: item.destination || '-',
  })

  if (!hideSchedule) {
    facts.push({
      key: 'delivery',
      label: 'Previsão de entrega',
      value: formatShortDate(getEstimatedDeliveryDate(item)),
    })
  }

  if (!hideEta && item.etaOriginal && item.etaOriginal !== item.eta) {
    facts.push({ key: 'eta-original', label: 'ETA original', value: formatShortDate(item.etaOriginal) })
  }

  const pushCollection = () => {
    if (item.collectionStatus && !keepsCollectionSchedule(item.collectionStatus)) {
      facts.push({ key: 'collection', label: 'Coleta', value: getDisplayedCollectionStatus(item.collectionStatus) })
    }
    if (
      item.collectionStatus &&
      keepsCollectionSchedule(item.collectionStatus) &&
      item.collectionStatus !== 'Coleta Agendada'
    ) {
      facts.push({ key: 'collection', label: 'Coleta', value: getDisplayedCollectionStatus(item.collectionStatus) })
    }
    if (item.collectionStatus === 'Coleta Agendada') {
      const windows = getCollectionWindows(item)
      windows.forEach((window, index) => {
        facts.push({
          key: `window-${window.id ?? index}`,
          label: window.containerNumber
            ? `Coleta · contêiner ${window.containerNumber}`
            : windows.length > 1
              ? `Janela de coleta ${index + 1}`
              : 'Janela de coleta',
          value: formatShortDateTime(window.scheduledAt),
        })
      })
    }
  }

  if (maritimePostArrival) {
    facts.push({
      key: 'presence',
      label: 'Presença de carga',
      value: hasCargoPresenceSignal(item) ? 'Informada' : 'Pendente',
    })
    const licenses = getEffectiveLicenses(item)
    if (licenses.length > 0) {
      facts.push({
        key: 'licenses',
        label: 'Anuências',
        value: licenses.map((license) => `${license.agency} — ${license.status}`).join(' · '),
      })
    }
    if (item.duimpStatus) {
      facts.push({
        key: 'duimp',
        label: 'DUIMP',
        value: getDuimpSummary(item),
        tone: getChannelTone(item.parameterizationChannel),
      })
    }
    pushCollection()
  }

  if (airPostArrival) {
    if (item.dtaStatus) facts.push({ key: 'dta', label: 'DTA', value: item.dtaStatus })
    if (item.dtaLoadingScheduledAt) {
      facts.push({ key: 'dta-loading', label: 'Carregamento DTA', value: formatShortDateTime(item.dtaLoadingScheduledAt) })
    }
    if (item.dtaArrivalAtItajai) {
      facts.push({ key: 'dta-arrival', label: 'Chegada em Itajaí', value: formatShortDateTime(item.dtaArrivalAtItajai) })
    }
    if (isDtaTransitCompletedStatus(item.dtaStatus)) {
      facts.push({
        key: 'presence',
        label: 'Presença de carga',
        value: hasCargoPresenceSignal(item) ? 'Informada' : 'Pendente',
      })
    }
    if (item.duimpStatus) {
      facts.push({
        key: 'duimp',
        label: 'DUIMP',
        value: getDuimpSummary(item),
        tone: getChannelTone(item.parameterizationChannel),
      })
    }
    pushCollection()
  }

  return facts
}

// Trecho de data do eyebrow: "ETA 20/10" / "ETA atualizada 20/10" (azul, D14) ou,
// sem ETA visivel, a data da proxima janela de coleta agendada.
function getFavoriteEyebrowDate(item) {
  const hideEta =
    (isMaritimeCategory(item.category) && hasArrivalSignal(item)) ||
    (isAirCategory(item.category) && hasArrivalSignal(item)) ||
    shouldHideProcessCardSchedule(item)
  if (!hideEta && item.eta) {
    const updated = hasUpdatedEta(item)
    return { text: `${updated ? 'ETA atualizada' : 'ETA'} ${formatShortDate(item.eta)}`, updated }
  }
  if (item.collectionStatus === 'Coleta Agendada') {
    const [firstWindow] = getCollectionWindows(item)
    if (firstWindow?.scheduledAt) return { text: formatShortDate(firstWindow.scheduledAt), updated: false }
  }
  return null
}

function FavoriteCard({ item, canSeeName, onOpen, onUnfavorite }) {
  const title = getProcessTitle(item, canSeeName)
  const subtitle = formatPoLine(getProcessSubtitle(item, canSeeName))
  // O selo derivado e o status do card; o eyebrow so detalha quando acrescenta algo.
  const eyebrowStatus = getProcessStatusDetail(item)
  const eyebrowDate = getFavoriteEyebrowDate(item)
  const { currentStage, isComplete } = getProcessStage(item)
  const activeStage = isComplete ? PROCESS_STAGES.length : currentStage
  const hazardBadges = getCargoHazardBadges(item)
  const cargoLine = [
    subtitle,
    item.category,
    shouldShowContainerQuantity(item.category) && item.containerQuantity > 0
      ? formatContainerCount(item.containerQuantity)
      : '',
    item.palletQuantity > 0 ? formatPalletCount(item.palletQuantity) : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const facts = getFavoriteFacts(item)

  return (
    <article className="dash-fav">
      <div className="dash-fav__top">
        <div className="dash-fav__id">
          {eyebrowStatus || eyebrowDate ? (
            <span className="dash-fav__eyebrow">
              {eyebrowStatus}
              {eyebrowStatus && eyebrowDate ? ' · ' : ''}
              {eyebrowDate ? (
                <span className={`dash-fav__eta${eyebrowDate.updated ? ' dash-fav__eta--updated' : ''}`}>
                  {eyebrowDate.text}
                </span>
              ) : null}
            </span>
          ) : null}
          <button type="button" className="dash-fav__name" onClick={() => onOpen?.(item.id)}>
            {title}
          </button>
          {cargoLine ? <span className="dash-fav__meta">{cargoLine}</span> : null}
          {/* Status derivado visivel (era badge no card legado): tag sob a linha de PO,
              junto dos selos de carga — fora do eyebrow, que segue o mock. */}
          <span className="dash-fav__tags">
            <ProcessDerivedStatusBadge process={item} />
            {hazardBadges.map((badge) => (
              <span key={badge.label} className={`inline-badge inline-badge--${badge.tone}`}>{badge.label}</span>
            ))}
          </span>
        </div>
        <button
          type="button"
          className="dash-fav__star"
          aria-label={`Desfavoritar ${title}`}
          title="Desfavoritar"
          onClick={() => onUnfavorite?.(item.id)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
            <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
          </svg>
        </button>
      </div>

      <ol className="dash-stages" aria-label="Etapas do processo">
        {PROCESS_STAGES.map((label, index) => {
          const state = index < activeStage ? 'done' : index === activeStage ? 'now' : 'todo'
          return (
            <li
              key={label}
              className={`dash-stages__item dash-stages__item--${state}`}
              aria-current={state === 'now' ? 'step' : undefined}
            >
              <span className="dash-stages__bar" aria-hidden="true" />
              <span className="dash-stages__label">{label}</span>
            </li>
          )
        })}
      </ol>

      {facts.length > 0 ? (
        <dl className="dash-facts">
          {facts.map((fact) => (
            <div
              key={fact.key}
              className={`dash-facts__item${isWideFact(fact.key) ? ' dash-facts__item--wide' : ''}`}
            >
              <dt>{fact.label}</dt>
              <dd className={fact.tone ? `dash-facts__value--${fact.tone}` : undefined}>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  )
}

function AnnouncementsPanel({ announcements, isLoading, error, onRetry, renderLoadError }) {
  const [lead, ...previous] = announcements
  const channelOf = (announcement) => String(announcement.channel ?? '').trim()

  return (
    <section className="dash-card dash-announcements" aria-labelledby="dash-announcements-title">
      <h3 id="dash-announcements-title">Comunicados recentes</h3>
      {isLoading ? (
        <div className="dash-announcements__skeleton" role="status" aria-label="Carregando comunicados">
          <Skeleton variant="heading" width="40%" />
          <Skeleton variant="line" width="85%" />
          <Skeleton variant="line" width="60%" />
        </div>
      ) : error ? (
        renderLoadError(error, onRetry)
      ) : lead ? (
        <>
          <article className="dash-announce dash-announce--lead">
            <span
              className="dash-announce__eyebrow"
              title={formatTimestamp(lead.updatedAt ?? lead.createdAt)}
            >
              {[channelOf(lead), getAnnouncementDayLabel(lead)].filter(Boolean).join(' · ')}
            </span>
            <strong className="dash-announce__title">{lead.title}</strong>
            <p className="dash-announce__summary">{summarizeAnnouncement(lead.content)}</p>
          </article>
          {previous.map((announcement) => (
            <article
              key={announcement.id}
              className="dash-announce dash-announce--row"
              title={summarizeAnnouncement(announcement.content)}
            >
              <span className="dash-announce__when">
                {[getAnnouncementDayLabel(announcement), channelOf(announcement)].filter(Boolean).join(' · ')}
              </span>
              <strong className="dash-announce__title">{announcement.title}</strong>
            </article>
          ))}
        </>
      ) : (
        <EmptyState
          illustration="news"
          title="Nenhum comunicado publicado"
          message="Os avisos internos criados no admin serão exibidos aqui."
        />
      )}
    </section>
  )
}

export default function DashboardPage() {
  const { profile, toggleFavoriteProcess } = useAuth()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const navigate = useNavigate()
  const canSeeName = profile?.role === 'admin' || profile?.role === 'logistica'
  const favoriteKey = (profile?.favoriteProcessIds ?? []).join('|')
  const [announcements, setAnnouncements] = useState([])
  const [barStatus, setBarStatus] = useState(null)
  // DUIMP sob aguas (D-1/D-3): `rawLoadedProcesses` vem do Firestore;
  // `loadedProcesses` e' a visao por perfil (KPIs, favoritos e semana leem
  // esta). Admin/logistica = identidade.
  const [rawLoadedProcesses, setLoadedProcesses] = useState([])
  const loadedProcesses = useMemo(
    () => projectProcessesForViewer(rawLoadedProcesses, profile?.role),
    [rawLoadedProcesses, profile?.role]
  )
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true)
  const [isLoadingBarStatus, setIsLoadingBarStatus] = useState(true)
  const [isLoadingProcesses, setIsLoadingProcesses] = useState(true)
  const [announcementsError, setAnnouncementsError] = useState(null)
  const [processesError, setProcessesError] = useState(null)
  const [announcementsReloadKey, setAnnouncementsReloadKey] = useState(0)
  const [processesReloadKey, setProcessesReloadKey] = useState(0)

  const dashboardKpis = useMemo(() => getDashboardKpis(loadedProcesses), [loadedProcesses])
  // F4a (D12): notas dos KPIs do desktop ("+N vs. semana passada", barra...).
  const previousWeekArrivals = useMemo(
    () => getPreviousWeekArrivalsCount(loadedProcesses),
    [loadedProcesses]
  )
  const kpiNotes = useMemo(
    () => getDashboardKpiNotes(dashboardKpis, previousWeekArrivals, barStatus?.tone),
    [dashboardKpis, previousWeekArrivals, barStatus?.tone]
  )

  const favoriteProcesses = useMemo(() => {
    const ids = new Set(favoriteKey ? favoriteKey.split('|') : [])
    return loadedProcesses.filter((item) => ids.has(item.id))
  }, [loadedProcesses, favoriteKey])

  function handleSelectProcess(processId) {
    if (!processId) return
    navigate('/processos', { state: buildProcessLinkState(processId, 'general', '/') })
  }

  function retryAnnouncements() {
    setAnnouncementsReloadKey((key) => key + 1)
  }

  function retryProcesses() {
    setProcessesReloadKey((key) => key + 1)
  }

  function kpiValue(n) {
    if (isLoadingProcesses) return <Skeleton width="3ch" height="1em" />
    if (processesError) return '—'
    return n
  }

  function renderLoadError(message, onRetry) {
    return (
      <div className="error-banner error-banner--retry" role="alert">
        <span>{message}</span>
        {onRetry ? (
          <button type="button" className="ghost-button" onClick={onRetry}>
            Tentar novamente
          </button>
        ) : null}
      </div>
    )
  }

  useEffect(() => {
    let isMounted = true

    async function loadBarStatus() {
      try {
        const loadedBarStatus = await getBarStatus()
        if (isMounted) {
          setBarStatus(loadedBarStatus)
        }
      } catch (error) {
        console.error('Falha ao carregar a condição da barra.', error)
        if (isMounted) {
          setBarStatus(null)
        }
      } finally {
        if (isMounted) {
          setIsLoadingBarStatus(false)
        }
      }
    }

    loadBarStatus()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadAnnouncementsData() {
      setIsLoadingAnnouncements(true)
      try {
        const loadedAnnouncements = await listAnnouncements()
        if (isMounted) {
          setAnnouncements(loadedAnnouncements.slice(0, 3))
          setAnnouncementsError(null)
        }
      } catch (error) {
        console.error('Falha ao carregar os comunicados.', error)
        if (isMounted) {
          setAnnouncementsError('Não foi possível carregar os comunicados.')
        }
      } finally {
        if (isMounted) {
          setIsLoadingAnnouncements(false)
        }
      }
    }

    loadAnnouncementsData()

    return () => {
      isMounted = false
    }
  }, [announcementsReloadKey])

  useEffect(() => {
    let isMounted = true

    async function loadProcessesData() {
      setIsLoadingProcesses(true)
      try {
        // Recebidos ha 7+ dias (arquivados automaticos) ficam fora do Dashboard,
        // como antes: so a fila/Arquivados de Chegadas os mostra.
        const loaded = (await listProcesses()).filter((item) => !item.autoArchived)
        if (isMounted) {
          setLoadedProcesses(loaded)
          setProcessesError(null)
        }
      } catch (error) {
        console.error('Falha ao carregar os processos.', error)
        if (isMounted) {
          setProcessesError('Não foi possível carregar os processos.')
        }
      } finally {
        if (isMounted) {
          setIsLoadingProcesses(false)
        }
      }
    }

    loadProcessesData()

    return () => {
      isMounted = false
    }
  }, [processesReloadKey])

  // Refino F4a: desktop (>= 1041px) renderiza a arvore do Dashboard.dc.html.
  if (isDesktop) {
    const barTone = isLoadingBarStatus || !barStatus ? 'neutral' : barStatus.tone || 'neutral'
    const barText = isLoadingBarStatus
      ? 'Carregando'
      : barStatus
        ? formatBarStatusLabel(barStatus)
        : 'Indisponível'
    const barTitle = barStatus
      ? [
          barStatus.notes,
          barStatus.updatedAt ? `Praticagem ZP-21 · atualizado ${formatRelativeTime(barStatus.updatedAt)}` : '',
        ]
          .filter(Boolean)
          .join(' — ')
      : undefined
    const kpiCards = [
      { key: 'chegadasNaSemana', label: 'Chegadas na semana' },
      { key: 'emTransito', label: 'Em trânsito' },
      { key: 'aguardandoAtracacao', label: 'Aguardando atracação' },
      { key: 'canalVermelho', label: 'Canal vermelho', alert: dashboardKpis.canalVermelho > 0 },
    ]

    return (
      <section className="surface surface--dashboard">
        <header className="dash-head">
          <div className="dash-head__titles">
            <span className="dash-head__eyebrow">{formatDesktopEyebrowDate(new Date())}</span>
            <h2>Visão geral</h2>
          </div>
          <span className={`dash-bar dash-bar--${barTone}`} title={barTitle}>
            <span className="dash-bar__dot" aria-hidden="true" />
            Barra do Rio · {barText}
          </span>
        </header>

        <section className="dash-kpis dash-rise" aria-label="Indicadores">
          {kpiCards.map((card) => (
            <StatCard
              key={card.key}
              className={`dash-kpi${card.alert && !isLoadingProcesses && !processesError ? ' dash-kpi--alert' : ''}`}
              label={card.label}
              value={kpiValue(dashboardKpis[card.key])}
              note={
                isLoadingProcesses ? (
                  <Skeleton width="12ch" height="0.85em" />
                ) : processesError ? (
                  ''
                ) : (
                  kpiNotes[card.key].text
                )
              }
              noteTone={isLoadingProcesses || processesError ? 'neutral' : kpiNotes[card.key].tone}
            />
          ))}
        </section>

        <div className="dash-grid dash-rise" style={{ '--dash-rise-delay': '80ms' }}>
          <WeeklyArrivalsCard
            variant="desktop"
            processes={loadedProcesses}
            canSeeName={canSeeName}
            isLoading={isLoadingProcesses}
            loadError={processesError}
            onRetry={retryProcesses}
            onSelectProcess={handleSelectProcess}
            onViewAll={() => navigate('/processos')}
          />
          <AnnouncementsPanel
            announcements={announcements}
            isLoading={isLoadingAnnouncements}
            error={announcementsError}
            onRetry={retryAnnouncements}
            renderLoadError={renderLoadError}
          />
        </div>

        <section
          className="dash-card dash-favorites dash-rise"
          style={{ '--dash-rise-delay': '160ms' }}
          aria-labelledby="dash-favorites-title"
        >
          <div className="dash-card__head">
            <h3 id="dash-favorites-title">Processos favoritos</h3>
            {!isLoadingProcesses && !processesError && favoriteProcesses.length > 0 ? (
              <span className="dash-card__count">
                {formatCargoUnit(favoriteProcesses.length, 'processo', 'processos')}
              </span>
            ) : null}
          </div>

          {isLoadingProcesses ? (
            <div className="dash-favorites__grid" role="status" aria-label="Carregando favoritos">
              {[0, 1].map((index) => (
                <div key={index} className="dash-fav dash-fav--skeleton">
                  <Skeleton.ProcessCard />
                </div>
              ))}
            </div>
          ) : processesError ? (
            renderLoadError(processesError, retryProcesses)
          ) : favoriteProcesses.length > 0 ? (
            <div className="dash-favorites__grid">
              {favoriteProcesses.map((item) => (
                <FavoriteCard
                  key={item.id}
                  item={item}
                  canSeeName={canSeeName}
                  onOpen={handleSelectProcess}
                  onUnfavorite={toggleFavoriteProcess}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              illustration="inbox"
              title="Nenhum processo favoritado"
              message="Marque processos na aba Chegadas para acompanhá-los aqui no dashboard."
            />
          )}
        </section>
      </section>
    )
  }

  return (
    <section className="surface surface--dashboard">
      <div className="section-heading dashboard-heading">
        <div>
          <span className="dashboard-heading__eyebrow">{formatHeadingDate(new Date())}</span>
          <h2>Visão geral</h2>
        </div>
        {/* F16.3: no mobile este bloco vira o TIDE CARD (protótipo) — hero
            gradiente por tom, dot pulsante e nota de atualização. O dot e a
            nota só existem no mobile (CSS); no desktop segue o inline. */}
        <div
          className={`dashboard-bar-inline${barStatus ? ` dashboard-bar-inline--${barStatus.tone}` : ''}`}
          aria-label="Condicao da Barra do Rio Itajai-Acu"
        >
          <span className="dashboard-bar-inline__label">Barra do Rio</span>
          {isLoadingBarStatus ? (
            <span className="dashboard-bar-card__text">Carregando</span>
          ) : barStatus ? (
            <>
              <span className="dashboard-bar-inline__status">
                <span className="dashboard-bar-inline__dot" aria-hidden="true" />
                <span
                  className={`dashboard-bar-card__text dashboard-bar-card__text--${barStatus.tone}`}
                >
                  {barStatus.label}
                </span>
              </span>
              {barStatus.updatedAt ? (
                <span className="dashboard-bar-inline__note">
                  Praticagem ZP-21 · atualizado {formatRelativeTime(barStatus.updatedAt)}
                </span>
              ) : null}
            </>
          ) : (
            <span className="dashboard-bar-card__text">Indisponível</span>
          )}
        </div>
      </div>

      {/* Ciclo 2a (redesign Fase 2): faixa de KPIs, so' visivel no
          desktop via CSS (@media min-width:1041px em styles.css).
          Deriva de `loadedProcesses` (ja carregado acima) — sem nova
          query/estado/loading. */}
      <div className="dashboard-stat-row">
        <StatCard label="Chegadas na semana" value={kpiValue(dashboardKpis.chegadasNaSemana)} icon="arrivals" />
        <StatCard label="Em trânsito" value={kpiValue(dashboardKpis.emTransito)} icon="ship" />
        <StatCard label="Aguardando atracação" value={kpiValue(dashboardKpis.aguardandoAtracacao)} icon="bell" />
        <StatCard label="Canal vermelho" value={kpiValue(dashboardKpis.canalVermelho)} icon="check" />
      </div>

      <Stagger>
        <article className="list-card">
        <div className="card-heading card-heading--tight">
          <div>
            <h3>Comunicados recentes</h3>
          </div>
        </div>

        <div
          className={`announcement-list announcement-list--scroll${isLoadingAnnouncements ? '' : ' skeleton-reveal'}`}
        >
          {isLoadingAnnouncements ? (
            <Skeleton.Group count={3} gap={12}>
              <Skeleton variant="title" />
              <Skeleton variant="subtitle" />
            </Skeleton.Group>
          ) : announcementsError ? (
            renderLoadError(announcementsError, retryAnnouncements)
          ) : announcements.length > 0 ? (
            announcements.map((announcement) => (
              <div key={announcement.id} className="announcement-card">
                <div className="announcement-card__meta">
                  <span>{formatTimestamp(announcement.updatedAt)}</span>
                  <span>{announcement.channel}</span>
                </div>
                <strong>{announcement.title}</strong>
                <p>{announcement.content}</p>
              </div>
            ))
          ) : (
            <EmptyState
              illustration="news"
              icon="news"
              title="Nenhum comunicado publicado"
              message="Os avisos internos criados no admin serao exibidos aqui."
            />
          )}
        </div>
      </article>

      <article className="list-card dashboard-favorites-card">        <div className="card-heading">
          <div>
            <h3>Processos favoritos</h3>
          </div>
        </div>

        <div className={`process-list process-list--scroll${isLoadingProcesses ? '' : ' skeleton-reveal'}`}>
          {isLoadingProcesses ? (
            <>
              {/* Skeleton antigo: continua no tablet/mobile (CSS esconde no desktop). */}
              <div className="skeleton-legacy">
                <Skeleton.Group count={3} gap={12}>
                  <Skeleton variant="title" />
                  <Skeleton variant="subtitle" />
                </Skeleton.Group>
              </div>
              {/* Desktop: skeleton no formato real do card (Componentes.dc.html). */}
              <div className="process-list-skeletons process-list-skeletons--card" aria-hidden="true">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="process-card-skeleton">
                    <Skeleton.ProcessCard />
                  </div>
                ))}
              </div>
            </>
          ) : processesError ? (
            renderLoadError(processesError, retryProcesses)
          ) : favoriteProcesses.length > 0 ? (
            favoriteProcesses.map((item) => {
              const showMaritimePostArrival = isMaritimeCategory(item.category) && hasArrivalSignal(item)
              const showAirPostArrival = isAirCategory(item.category) && hasArrivalSignal(item)
              const hideSchedule = shouldHideProcessCardSchedule(item)
              const hideEta = showMaritimePostArrival || showAirPostArrival || hideSchedule
              // O selo derivado e o status; o texto cru so aparece quando acrescenta algo.
              const statusDetail = shouldHideProcessStatusBadge(item)
                ? ''
                : getProcessStatusDetail(item, { source: 'processStatus' })

              return (
                <div key={item.id} className="process-item dashboard-favorites-item">
                  {/* F16.3: ícone por categoria (só mobile — CSS). */}
                  <span className="process-item__leading" aria-hidden="true">
                    <Icon name={isAirCategory(item.category) ? 'plane' : 'ship'} size={18} />
                  </span>
                  <div className="process-item__main">
                    <strong>{getProcessTitle(item, canSeeName)}</strong>
                    {getProcessSubtitle(item, canSeeName) ? (
                      <p>{getProcessSubtitle(item, canSeeName)}</p>
                    ) : null}
                    <div className="process-item__line">{item.category}</div>
                    <div className="process-item__line">{getDestinationLabel(item.category)}: {item.destination || '-'}</div>
                    {/* F16.3: resumo condensado — só mobile (CSS); o detalhe
                        verboso (meta, pós-atracação) some lá. */}
                    <div className="process-item__summary">
                      {[
                        item.eta ? `ETA ${formatDate(item.eta).slice(0, 5)}` : null,
                        item.destination || null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    <div className="process-item__chips">
                      <ProcessDerivedStatusBadge process={item} />
                      {statusDetail ? <span className="inline-badge">{statusDetail}</span> : null}
                      {shouldShowContainerQuantity(item.category) && item.containerQuantity > 0 ? (
                        <span className="inline-badge">
                          {formatContainerCount(item.containerQuantity)}
                        </span>
                      ) : null}
                      {item.palletQuantity > 0 ? (
                        <span className="inline-badge">
                          {formatPalletCount(item.palletQuantity)}
                        </span>
                      ) : null}
                      {getCargoHazardBadges(item).map((badge) => (
                        <span key={badge.label} className={`inline-badge inline-badge--${badge.tone}`}>{badge.label}</span>
                      ))}
                    </div>

                    {showMaritimePostArrival ? (
                      <div className="dashboard-process-inline">
                        <div className="dashboard-process-inline__row">
                          <span className="detail-label">Pós-atracação</span>
                          <p>Presença de carga: {hasCargoPresenceSignal(item) ? 'Informada' : 'Pendente'}</p>
                        </div>
                        {getEffectiveLicenses(item).length > 0 ? (
                          <div className="dashboard-process-inline__row">
                            <span className="detail-label">Anuências</span>
                            <p>
                              {getEffectiveLicenses(item)
                                .map((license) => `${license.agency} — ${license.status}`)
                                .join(' · ')}
                            </p>
                          </div>
                        ) : null}
                        {item.duimpStatus ? (
                          <div
                            className={`dashboard-process-inline__row dashboard-process-inline__row--duimp ${getChannelToneClass(item.parameterizationChannel)}`.trim()}
                          >
                            <span className="detail-label">DUIMP</span>
                            <p>{getDuimpSummary(item)}</p>
                          </div>
                        ) : null}
                        {item.collectionStatus && !keepsCollectionSchedule(item.collectionStatus) ? (
                          <div className="dashboard-process-inline__row">
                            <span className="detail-label">Coleta</span>
                            <p>{getDisplayedCollectionStatus(item.collectionStatus)}</p>
                          </div>
                        ) : null}
                        {item.collectionStatus && keepsCollectionSchedule(item.collectionStatus) && item.collectionStatus !== 'Coleta Agendada' ? (
                          <div className="dashboard-process-inline__row">
                            <span className="detail-label">Coleta</span>
                            <p>{getDisplayedCollectionStatus(item.collectionStatus)}</p>
                          </div>
                        ) : null}
                        {item.collectionStatus === 'Coleta Agendada' && getCollectionWindows(item).length > 0 ? (
                          <ul className="dashboard-collection-windows">
                            {getCollectionWindows(item).map((window) => (
                              <li key={window.id} className="collection-window-card collection-window-card--inline">
                                <div>
                                  <span className="detail-label">Contêiner {window.containerNumber}</span>
                                  <p>{formatDateTime(window.scheduledAt)}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}

                    {showAirPostArrival ? (
                      <div className="dashboard-process-inline">
                        {item.dtaStatus ? (
                          <div className="dashboard-process-inline__row">
                            <span className="detail-label">DTA</span>
                            <p>{item.dtaStatus}</p>
                          </div>
                        ) : null}
                        {item.dtaLoadingScheduledAt ? (
                          <div className="dashboard-process-inline__row">
                            <span className="detail-label">Carregamento DTA</span>
                            <p>{formatDateTime(item.dtaLoadingScheduledAt)}</p>
                          </div>
                        ) : null}
                        {item.dtaArrivalAtItajai ? (
                          <div className="dashboard-process-inline__row">
                            <span className="detail-label">Chegada em Itajaí</span>
                            <p>{formatDateTime(item.dtaArrivalAtItajai)}</p>
                          </div>
                        ) : null}
                        {isDtaTransitCompletedStatus(item.dtaStatus) ? (
                          <div className="dashboard-process-inline__row">
                            <span className="detail-label">Presença de carga</span>
                            <p>{hasCargoPresenceSignal(item) ? 'Informada' : 'Pendente'}</p>
                          </div>
                        ) : null}
                        {item.duimpStatus ? (
                          <div
                            className={`dashboard-process-inline__row dashboard-process-inline__row--duimp ${getChannelToneClass(item.parameterizationChannel)}`.trim()}
                          >
                            <span className="detail-label">DUIMP</span>
                            <p>{getDuimpSummary(item)}</p>
                          </div>
                        ) : null}
                        {item.collectionStatus && !keepsCollectionSchedule(item.collectionStatus) ? (
                          <div className="dashboard-process-inline__row">
                            <span className="detail-label">Coleta</span>
                            <p>{getDisplayedCollectionStatus(item.collectionStatus)}</p>
                          </div>
                        ) : null}
                        {item.collectionStatus && keepsCollectionSchedule(item.collectionStatus) && item.collectionStatus !== 'Coleta Agendada' ? (
                          <div className="dashboard-process-inline__row">
                            <span className="detail-label">Coleta</span>
                            <p>{getDisplayedCollectionStatus(item.collectionStatus)}</p>
                          </div>
                        ) : null}
                        {item.collectionStatus === 'Coleta Agendada' && getCollectionWindows(item).length > 0 ? (
                          <ul className="dashboard-collection-windows">
                            {getCollectionWindows(item).map((window) => (
                              <li key={window.id} className="collection-window-card collection-window-card--inline">
                                <div>
                                  <span className="detail-label">Contêiner {window.containerNumber}</span>
                                  <p>{formatDateTime(window.scheduledAt)}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="process-item__meta process-item__meta--top">
                    <span className="dashboard-favorites-item__star" aria-hidden="true">
                      <Icon name="star-filled" size={16} />
                    </span>
                    {!hideEta ? (
                      <span className={hasUpdatedEta(item) ? 'eta-meta-highlight' : ''}>
                        {hasUpdatedEta(item) ? 'ETA atualizada' : 'ETA'}: {formatDate(item.eta)}
                      </span>
                    ) : null}
                    {!hideSchedule ? (
                      <span>Previsão de entrega: {getEstimatedDeliveryLabel(item)}</span>
                    ) : null}
                    {!hideEta && item.etaOriginal && item.etaOriginal !== item.eta ? (
                      <span className="eta-meta-secondary">ETA original: {formatDate(item.etaOriginal)}</span>
                    ) : null}
                  </div>
                </div>
              )
            })
          ) : (
            <EmptyState
              illustration="inbox"
              icon="inbox"
              title="Nenhum processo favoritado"
              message="Marque processos na aba Chegadas para acompanhá-los aqui no dashboard."
            />
          )}
        </div>
      </article>

      <WeeklyArrivalsCard
        processes={loadedProcesses}
        canSeeName={canSeeName}
        isLoading={isLoadingProcesses}
        loadError={processesError}
        onRetry={retryProcesses}
        onSelectProcess={handleSelectProcess}
      />
      </Stagger>
    </section>
  )
}
