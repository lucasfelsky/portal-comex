import { useEffect, useState } from 'react'
import useAuth from '../hooks/useAuth'
import { getProcessStatusTone } from '../features/processes/processStatus'
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
  return formatDate(getEstimatedDeliveryDate(process.eta, process.category))
}

const isRestrictedCategory = (category) => ['FCL', 'LCL', 'AEREO'].includes(category)
const isMaritimeCategory = (category) => ['FCL', 'LCL', 'CONSOLIDADO'].includes(category)
const isAirCategory = (category) => category === 'AEREO'
const shouldShowContainerQuantity = (category) => category !== 'AEREO' && category !== 'LCL'

function formatCargoUnit(quantity, singularLabel, pluralLabel) {
  return `${quantity} ${quantity < 2 ? singularLabel : pluralLabel}`
}

function getDestinationLabel(category) {
  return category === 'AEREO' ? 'Aeroporto de Destino' : 'Porto de Atracação'
}

function canShowProcessName(process, isAdmin) {
  return isAdmin || !isRestrictedCategory(process.category)
}

function getProcessTitle(process, isAdmin) {
  return canShowProcessName(process, isAdmin) ? process.name : `PO: ${process.processNumber || '-'}`
}

function getProcessSubtitle(process, isAdmin) {
  if (!canShowProcessName(process, isAdmin)) return ''
  if (process.category === 'CONSOLIDADO') return ''
  return process.processNumber ? `PO: ${process.processNumber}` : ''
}

function getChannelToneClass(channel) {
  if (channel === 'Verde') return 'detail-card--success'
  if (channel === 'Amarelo') return 'detail-card--warning'
  if (channel === 'Vermelho') return 'detail-card--danger'
  if (channel === 'Cinza') return 'detail-card--neutral'
  return ''
}

function getStatusTagClass(status) {
  return `status-tag status-tag--${getProcessStatusTone(status)}`
}

function normalizeDtaStatus(status) {
  return String(status ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function keepsCollectionSchedule(status) {
  return (
    status === 'Coleta Agendada' ||
    status === 'Veiculo no CD para descarga' ||
    status === 'Carga recebida'
  )
}

function getDuimpSummary(process) {
  if (!process.duimpStatus) return ''
  return process.parameterizationChannel
    ? `${process.duimpStatus} · Canal ${process.parameterizationChannel}`
    : process.duimpStatus
}

function shouldShowMapaInspection(status) {
  return status === 'Vistoria agendada, aguardando realizacao'
}

export default function DashboardPage() {
  const { profile } = useAuth()
  const favoriteProcessIds = profile?.favoriteProcessIds ?? []
  const [announcements, setAnnouncements] = useState([])
  const [barStatus, setBarStatus] = useState(null)
  const [favoriteProcesses, setFavoriteProcesses] = useState([])
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true)
  const [isLoadingBarStatus, setIsLoadingBarStatus] = useState(true)
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(true)

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
        setFavoriteProcesses(loadedProcesses.filter((item) => favoriteProcessIds.includes(item.id)))
      } finally {
        if (isMounted) {
          setIsLoadingAnnouncements(false)
          setIsLoadingBarStatus(false)
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

        <article className="list-card dashboard-bar-card dashboard-bar-card--header">
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
      </div>

      <div style={{ marginBottom: '24px' }}>
        <article className="list-card">
          <div className="card-heading">
            <div>
              <h3>Comunicados recentes</h3>
            </div>
          </div>

          <div className="announcement-list">
            {isLoadingAnnouncements ? (
              <div className="empty-state">
                <strong>Carregando comunicados</strong>
                <p>Buscando os avisos mais recentes para o painel inicial.</p>
              </div>
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
              <div className="empty-state">
                <strong>Nenhum comunicado publicado</strong>
                <p>Os avisos internos criados no admin serão exibidos aqui.</p>
              </div>
            )}
          </div>
        </article>
      </div>

      <article className="list-card">
        <div className="card-heading">
          <div>
            <h3>Processos favoritos</h3>
          </div>
          <span className="inline-badge">{favoriteProcesses.length} favoritos</span>
        </div>

        <div className="process-list process-list--scroll">
          {isLoadingFavorites ? (
            <div className="empty-state">
              <strong>Carregando favoritos</strong>
              <p>Buscando os processos marcados no seu perfil.</p>
            </div>
          ) : favoriteProcesses.length > 0 ? (
            favoriteProcesses.map((item) => {
              const showMaritimePostArrival = isMaritimeCategory(item.category) && item.berthed
              const showAirPostArrival = isAirCategory(item.category) && item.arrived
              const hideEta = showMaritimePostArrival || showAirPostArrival

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
                      <span className={getStatusTagClass(item.processStatus)}>{item.processStatus}</span>
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
                            <p>{item.collectionStatus}</p>
                          </div>
                        ) : null}
                        {item.collectionStatus && keepsCollectionSchedule(item.collectionStatus) && item.collectionStatus !== 'Coleta Agendada' ? (
                          <div className="dashboard-process-inline__row">
                            <span className="detail-label">Coleta</span>
                            <p>{item.collectionStatus}</p>
                          </div>
                        ) : null}
                        {item.collectionStatus === 'Coleta Agendada' && item.collectionScheduledAt ? (
                          <div className="collection-window-card collection-window-card--inline">
                            <div>
                              <span className="detail-label">Janela de coleta</span>
                              <p>{formatDateTime(item.collectionScheduledAt)}</p>
                            </div>
                          </div>
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
                        {normalizeDtaStatus(item.dtaStatus) === 'transito concluido' ? (
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
                            <p>{item.collectionStatus}</p>
                          </div>
                        ) : null}
                        {item.collectionStatus && keepsCollectionSchedule(item.collectionStatus) && item.collectionStatus !== 'Coleta Agendada' ? (
                          <div className="dashboard-process-inline__row">
                            <span className="detail-label">Coleta</span>
                            <p>{item.collectionStatus}</p>
                          </div>
                        ) : null}
                        {item.collectionStatus === 'Coleta Agendada' && item.collectionScheduledAt ? (
                          <div className="collection-window-card collection-window-card--inline">
                            <div>
                              <span className="detail-label">Janela de coleta</span>
                              <p>{formatDateTime(item.collectionScheduledAt)}</p>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="process-item__meta">
                    {!hideEta ? <span>ETA: {formatDate(item.eta)}</span> : null}
                    {!hideEta ? <span>Previsão de entrega: {getEstimatedDeliveryLabel(item)}</span> : null}
                    {!hideEta && item.etaOriginal && item.etaOriginal !== item.eta ? (
                      <span>ETA original: {formatDate(item.etaOriginal)}</span>
                    ) : null}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="empty-state">
              <strong>Nenhum processo favoritado</strong>
              <p>Marque processos na aba Processos para acompanhá-los aqui no dashboard.</p>
            </div>
          )}
        </div>
      </article>
    </section>
  )
}
