import { useEffect, useState } from 'react'
import { formatDateTime } from '../../utils/dateFormat'
import { listProcessEvents } from '../../services/processEventsRepository'
import { buildActionErrorMessage } from '../../utils/errorMessages'
import { formatShortStamp } from './shortStamp'

// F17.1b: painel autocarregado da aba "Histórico" (D-8). Carrega sozinho via
// `listProcessEvents(processId)` - padrao `isMounted` guard replicado (nao
// e util compartilhado, ver suite-standards). NAO importa de
// `processStatus.js` (o `tests/ui/ProcessesPage.test.jsx` mocka esse
// modulo inteiro - import novo quebraria com "No export defined on the
// mock"); labels ficam neste arquivo.

const EVENT_LABELS = {
  shipped: () => 'Embarque realizado',
  berthed: () => 'Atracação confirmada',
  arrived: () => 'Chegada confirmada',
  cargoPresence: () => 'Presença de carga informada',
  duimpRegistered: () => 'DUIMP registrada',
  parameterized: (event) => `DUIMP parametrizada - canal ${event.value || '-'}`,
  cleared: () => 'Desembaraço concluído',
  licenseDeferred: (event) => `Anuência deferida (${event.value || '-'})`,
  collectionScheduled: (event) =>
    event.value ? `Coleta agendada para ${formatDateTime(event.value)}` : 'Coleta agendada',
  received: () => 'Carga recebida',
  divergence: (event) =>
    event.value ? `Divergência no recebimento (${event.value})` : 'Divergência no recebimento',
  emptyReturned: (event) => `Vazio devolvido (${event.value || '-'})`,
  statusChanged: (event) => `Status: ${event.previousValue || '-'} → ${event.value || '-'}`,
  // F18b-1 (B3): marcos de upload de documento do processo.
  blUploaded: () => 'BL/AWB enviado',
  fispqUploaded: (event) => (event.value ? `FISPQ enviada (${event.value})` : 'FISPQ enviada'),
  containerWashUploaded: (event) =>
    event.value ? `Relatório de lavação enviado (${event.value})` : 'Relatório de lavação enviado',
}

function getEventLabel(event) {
  const builder = EVENT_LABELS[event.type]
  return builder ? builder(event) : `Marco: ${event.type}`
}

// Refino F4c: `variant="desktop"` (Processo.dc.html) = linha do tempo vertical com a
// data a esquerda; sem a prop o render e' o de sempre (cartoes).
export default function ProcessHistoryPanel({ processId, variant }) {
  const [events, setEvents] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let isMounted = true

    async function loadEvents() {
      setIsLoading(true)
      setError('')

      try {
        const list = await listProcessEvents(processId)
        if (!isMounted) return
        setEvents(list)
      } catch (loadError) {
        if (isMounted) {
          setError(buildActionErrorMessage('Não foi possível carregar o histórico', loadError))
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadEvents()

    return () => {
      isMounted = false
    }
  }, [processId, reloadToken])

  if (variant === 'desktop') {
    return (
      <section className="pdv-section pdv-history">
        <div className="pdv-items__head">
          <div className="pdv-items__titles">
            <h3 className="pdv-section__title pdv-items__title">Histórico de marcos</h3>
            <p className="pdv-items__sub">Linha do tempo de eventos operacionais deste processo.</p>
          </div>
          <button type="button" className="secondary-button pdv-btn" onClick={() => setReloadToken((token) => token + 1)}>
            Atualizar
          </button>
        </div>

        {isLoading ? (
          <div className="empty-state" role="status">
            <strong>Carregando histórico</strong>
            <p>Buscando os marcos registrados deste processo.</p>
          </div>
        ) : error ? (
          <div className="empty-state" role="alert">
            <strong>Não foi possível carregar o histórico</strong>
            <p>{error}</p>
          </div>
        ) : events.length > 0 ? (
          <ol className="pdv-hist">
            {events.map((event, index) => (
              <li key={event.id} className="pdv-hist__item">
                <span className="pdv-hist__when" title={formatDateTime(event.occurredAt)}>
                  {formatShortStamp(event.occurredAt)}
                </span>
                <span className="pdv-hist__rail" aria-hidden="true">
                  <span className={`pdv-hist__dot${index === 0 ? ' pdv-hist__dot--latest' : ''}`} />
                  <span className="pdv-hist__line" />
                </span>
                <span className="pdv-hist__body">
                  <span className="pdv-hist__title">{getEventLabel(event)}</span>
                  <span className="pdv-hist__by">{event.actorName || 'Sistema'}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-state" role="status">
            <strong>Nenhum marco registrado</strong>
            <p>O histórico registra marcos a partir da ativação desta funcionalidade.</p>
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="detail-card">
      <div className="card-heading process-detail-card-heading process-detail-card-heading--end">
        <div>
          <span className="detail-label">Histórico de marcos</span>
          <p>Linha do tempo de eventos operacionais deste processo.</p>
        </div>
        <button type="button" className="ghost-button ghost-button--secondary" onClick={() => setReloadToken((token) => token + 1)}>
          Atualizar
        </button>
      </div>

      {isLoading ? (
        <div className="empty-state" role="status">
          <strong>Carregando histórico</strong>
          <p>Buscando os marcos registrados deste processo.</p>
        </div>
      ) : error ? (
        <div className="empty-state" role="alert">
          <strong>Não foi possível carregar o histórico</strong>
          <p>{error}</p>
        </div>
      ) : events.length > 0 ? (
        <div className="process-messages-list">
          {events.map((event) => (
            <article key={event.id} className="process-message-card process-message-card--event">
              <div className="process-message-card__meta">
                <div className="process-message-card__meta-content">
                  <strong>{getEventLabel(event)}</strong>
                  <span>{formatDateTime(event.occurredAt)}</span>
                </div>
              </div>
              <p>{event.actorName || 'Sistema'}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state" role="status">
          <strong>Nenhum marco registrado</strong>
          <p>O histórico registra marcos a partir da ativação desta funcionalidade.</p>
        </div>
      )}
    </div>
  )
}
