import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import {
  getChannelToneClass,
  getDisplayedCollectionStatus,
  getStatusTagClass,
  isCollectionScheduleRetainingStatus as keepsCollectionSchedule,
  isDtaTransitCompletedStatus,
  isMapaInspectionScheduledStatus as shouldShowMapaInspection,
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
import WeeklyArrivalsCard from '../features/processes/WeeklyArrivalsCard'
import { getCollectionWindows } from '../utils/collectionWindows'
import { listAnnouncements } from '../services/announcementsRepository'
import { getBarStatus } from '../services/barStatusRepository'
import { listProcesses } from '../services/processesRepository'
import { getEstimatedDeliveryDate } from '../utils/deliveryForecast'

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

function getEstimatedDeliveryLabel(process) {
  return formatDate(getEstimatedDeliveryDate(process))
}

const isRestrictedCategory = (category) => ['FCL', 'LCL', 'AEREO'].includes(category)

function formatCargoUnit(quantity, singularLabel, pluralLabel) {
  return `${quantity} ${quantity < 2 ? singularLabel : pluralLabel}`
}

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

export default function DashboardPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const favoriteProcessIds = profile?.favoriteProcessIds ?? []
  const [announcements, setAnnouncements] = useState([])
  const [barStatus, setBarStatus] = useState(null)
  const [loadedProcesses, setLoadedProcesses] = useState([])
  const [favoriteProcesses, setFavoriteProcesses] = useState([])
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true)
  const [isLoadingBarStatus, setIsLoadingBarStatus] = useState(true)
  const [isLoadingProcesses, setIsLoadingProcesses] = useState(true)
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(true)

  function handleSelectProcess(processId) {
    if (!processId) return
    navigate('/processos', { state: { selectedProcessId: processId } })
  }

  useEffect(() => {
    let isMounted = true

    async function loadDashboardData() {
      try {
        const [loadedAnnouncements, loadedBarStatus, loadedProcesses] = await Promise.all([
          listAnnouncements(),
          getBarStatus(),
          listProcesses(),
        ])

        if (!isMounted) return

        setAnnouncements(loadedAnnouncements.slice(0, 3))
        setBarStatus(loadedBarStatus)
        setLoadedProcesses(loadedProcesses)
        setFavoriteProcesses(loadedProcesses.filter((item) => favoriteProcessIds.includes(item.id)))
      } finally {
        if (isMounted) {
          setIsLoadingAnnouncements(false)
          setIsLoadingBarStatus(false)
          setIsLoadingProcesses(false)
          setIsLoadingFavorites(false)
        }
      }
    }

    loadDashboardData()

    return () => {
      isMounted = false
    }
  }, [favoriteProcessIds])

  return (
    <section className="surface">
      <div className="section-heading dashboard-heading">
        <div>
          <h2>Visão geral</h2>
        </div>
      </div>

      <article className="list-card">
        <div className="card-heading">
          <h3>Barra do Rio Itajaí-Açu</h3>
          {isLoadingBarStatus ? (
            <span className="dashboard-bar-card__text">Carregando</span>
          ) : barStatus ? (
            <span className={`dashboard-bar-card__text dashboard-bar-card__text--${barStatus.tone}`}>
              {barStatus.label}
            </span>
          ) : (
            <span className="dashboard-bar-card__text">Indisponível</span>
          )}
        </div>
      </article>

      <article className="list-card">
        <div className="card-heading">
          <div>
            <h3>Comunicados recentes</h3>
          </div>
        </div>

        <div className="announcement-list">
          {isLoadingAnnouncements ? (
            <Skeleton.Group count={3} gap={12}>
              <Skeleton variant="title" />
              <Skeleton variant="subtitle" />
            </Skeleton.Group>
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

      <WeeklyArrivalsCard
        processes={loadedProcesses}
        isAdmin={profile?.role === 'admin'}
        isLoading={isLoadingProcesses}
        onSelectProcess={handleSelectProcess}
      />

      <article className="list-card">
        <div className="card-heading">
          <div>
            <h3>Processos favoritos</h3>
          </div>
          <span className="inline-badge">{favoriteProcesses.length} favoritos</span>
        </div>

        <div className="process-list process-list--scroll">
          {isLoadingFavorites ? (
            <Skeleton.Group count={3} gap={12}>
              <Skeleton variant="title" />
              <Skeleton variant="subtitle" />
            </Skeleton.Group>
          ) : favoriteProcesses.length > 0 ? (
            favoriteProcesses.map((item) => {
              const showMaritimePostArrival = isMaritimeCategory(item.category) && item.berthed
              const showAirPostArrival = isAirCategory(item.category) && item.arrived
              const hideSchedule = shouldHideProcessCardSchedule(item)
              const hideEta = showMaritimePostArrival || showAirPostArrival || hideSchedule

              return (
                <div key={item.id} className="process-item">
                  <div className="process-item__main">
                    <strong>{getProcessTitle(item, profile?.role === 'admin')}</strong>
                    {getProcessSubtitle(item, profile?.role === 'admin') ? (
                      <p>{getProcessSubtitle(item, profile?.role === 'admin')}</p>
                    ) : null}
                    <div className="process-item__line">{item.category}</div>
                    <div className="process-item__line">{getDestinationLabel(item.category)}: {item.destination || '-'}</div>
                    <div className="process-item__chips">
                      {shouldHideProcessStatusBadge(item) ? null : (
                        <span className={getStatusTagClass(item.processStatus)}>
                          {item.processStatus}
                        </span>
                      )}
                      <ProcessDerivedStatusBadge process={item} />
                      {shouldShowContainerQuantity(item.category) ? (
                        <span className="inline-badge">
                          {formatCargoUnit(item.containerQuantity, 'container', 'containers')}
                        </span>
                      ) : null}
                      <span className="inline-badge">
                        {formatCargoUnit(item.palletQuantity, 'pallet', 'pallets')}
                      </span>
                    </div>

                    {showMaritimePostArrival ? (
                      <div className="dashboard-process-inline">
                        <div className="dashboard-process-inline__row">
                          <span className="detail-label">Pós-atracação</span>
                          <p>Presença de carga: {item.cargoPresenceInformed ? 'Informada' : 'Pendente'}</p>
                        </div>
                        {item.mapaStatus ? (
                          <div className="dashboard-process-inline__row">
                            <span className="detail-label">MAPA</span>
                            <p>
                              {item.mapaStatus}
                              {shouldShowMapaInspection(item.mapaStatus) && item.mapaInspectionScheduledAt
                                ? ` · Vistoria: ${formatDateTime(item.mapaInspectionScheduledAt)}`
                                : ''}
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
                                  <span className="detail-label">Container {window.containerNumber}</span>
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
                            <p>{item.cargoPresenceInformed ? 'Informada' : 'Pendente'}</p>
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
                                  <span className="detail-label">Container {window.containerNumber}</span>
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
              message="Marque processos na aba Processos para acompanha-los aqui no dashboard."
            />
          )}
        </div>
      </article>
    </section>
  )
}
