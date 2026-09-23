import { useEffect, useState } from 'react'
import { formatDateTime } from '../../utils/dateFormat'
import { listProcessEvents } from '../../services/processEventsRepository'

// F17.1b: painel autocarregado da aba "Histórico" (D-8). Carrega sozinho via
// `listProcessEvents(processId)` - padrao `isMounted` guard replicado (nao
// e util compartilhado, ver suite-standards). NAO importa de
// `processStatus.js` (o `tests/ui/ProcessesPage.test.jsx` mocka esse
// modulo inteiro - import novo quebraria com "No export defined on the
// mock"); labels ficam neste arquivo.
function buildActionErrorMessage(prefix, error) {
  const details = [error?.code, error?.message].filter(Boolean).join(' | ')
  return details ? `${prefix} (${details})` : prefix
}

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
  statusChanged: (event) => `Status: ${event.previousValue || '-'} → ${event.value || '-'}`,
}

function getEventLabel(event) {
  const builder = EVENT_LABELS[event.type]
  return builder ? builder(event) : `Marco: ${event.type}`
}

export default function ProcessHistoryPanel({ processId }) {
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

  return (
    <div className="detail-card">
      <div className="card-heading process-detail-card-heading">
        <div>
          <span className="detail-label">Histórico de marcos</span>
          <p>Linha do tempo de eventos operacionais deste processo.</p>
        </div>
        <button type="button" className="ghost-button" onClick={() => setReloadToken((token) => token + 1)}>
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
            <article key={event.id} className="process-message-card">
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
