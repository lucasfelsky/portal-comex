import { useEffect, useState } from 'react'
import SelectField from '../../components/SelectField'
import Skeleton from '../../components/Skeleton'
import {
  BAR_STATUS_OPTIONS,
  getBarStatus,
  getBarSuggestion,
  saveBarStatus,
} from '../../services/barStatusRepository'
import useAuth from '../../hooks/useAuth'
import { formatRelativeTime } from '../../utils/dateFormat'
import { buildActionErrorMessage } from '../../utils/errorMessages'

// Sem leitura bem-sucedida da Praticagem ZP21 por mais de 8 h = robô parado/bloqueado
// (o cron roda 4x/hora; atraso normal do GitHub não chega perto disso).
const BAR_SYNC_STALE_AFTER_MS = 8 * 60 * 60 * 1000

function toTime(value) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

// 'failing' = última tentativa falhou; 'stale' = leitura velha/inexistente; 'ok' = nada a alertar.
function getBarSyncHealth(suggestion, now = Date.now()) {
  if (!suggestion) return 'ok'

  const lastSuccess = toTime(suggestion.lastSuccessAt)
  const lastAttempt = toTime(suggestion.lastAttemptAt)

  if (suggestion.lastError && (lastSuccess === null || (lastAttempt !== null && lastAttempt > lastSuccess))) {
    return 'failing'
  }
  if (lastSuccess === null || now - lastSuccess > BAR_SYNC_STALE_AFTER_MS) {
    return 'stale'
  }
  return 'ok'
}

export default function AdminBarStatusPanel() {
  const { profile } = useAuth()
  const [barStatusDraft, setBarStatusDraft] = useState({
    status: BAR_STATUS_OPTIONS[0].value,
    notes: '',
  })
  const [barStatusMeta, setBarStatusMeta] = useState(null)
  const [barSuggestion, setBarSuggestion] = useState(null)
  const [isLoadingBarStatus, setIsLoadingBarStatus] = useState(true)
  const [isSavingBarStatus, setIsSavingBarStatus] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadBarStatus() {
      setIsLoadingBarStatus(true)

      try {
        const loadedBarStatus = await getBarStatus()

        if (!isMounted) return

        setBarStatusMeta(loadedBarStatus)
        setBarStatusDraft({
          status: loadedBarStatus.status,
          notes: loadedBarStatus.notes,
        })
      } catch (loadError) {
        if (isMounted) {
          setError(buildActionErrorMessage('Não foi possível carregar o status da barra.', loadError))
        }
      } finally {
        if (isMounted) {
          setIsLoadingBarStatus(false)
        }
      }
    }

    async function loadBarSuggestion() {
      // Melhor-esforço: falha ao ler a sugestão NUNCA derruba o painel
      // (o status atual é o que importa). Só loga e segue sem banner.
      try {
        const loadedSuggestion = await getBarSuggestion()
        if (isMounted) {
          setBarSuggestion(loadedSuggestion)
        }
      } catch {
        if (isMounted) {
          setBarSuggestion(null)
        }
      }
    }

    loadBarStatus()
    loadBarSuggestion()

    return () => {
      isMounted = false
    }
  }, [])

  async function handleSaveBarStatus() {
    setIsSavingBarStatus(true)
    setError('')

    try {
      const savedBarStatus = await saveBarStatus(barStatusDraft, profile)
      setBarStatusMeta(savedBarStatus)
      setBarStatusDraft({
        status: savedBarStatus.status,
        notes: savedBarStatus.notes,
      })
    } catch (saveError) {
      setError(buildActionErrorMessage('Não foi possível salvar o status da barra.', saveError))
    } finally {
      setIsSavingBarStatus(false)
    }
  }

  async function handleApplySuggestion() {
    if (!barSuggestion?.status) return

    setIsSavingBarStatus(true)
    setError('')

    try {
      // Aplica só o status sugerido; preserva as notas atuais. A decisão
      // (clicar Aplicar) é humana e fica registrada na trilha de auditoria
      // do saveBarStatus.
      const savedBarStatus = await saveBarStatus(
        { status: barSuggestion.status, notes: barStatusDraft.notes },
        profile
      )
      setBarStatusMeta(savedBarStatus)
      setBarStatusDraft({
        status: savedBarStatus.status,
        notes: savedBarStatus.notes,
      })
    } catch (applyError) {
      setError(buildActionErrorMessage('Não foi possível aplicar a sugestão da barra.', applyError))
    } finally {
      setIsSavingBarStatus(false)
    }
  }

  const suggestionMatchesCurrent =
    barSuggestion?.status && barStatusMeta && barSuggestion.status === barStatusMeta.status
  const barSyncHealth = getBarSyncHealth(barSuggestion)

  return (
    <>
      {error ? <div className="error-banner">{error}</div> : null}

      <article className="list-card">
        <div className="card-heading">
          <div>
            <h3>Barra Itajaí/Navegantes</h3>
            <p>Indica a condição operacional do canal de acesso ao porto.</p>
          </div>
          {barStatusMeta ? (
            <span className={`status-tag status-tag--${barStatusMeta.tone}`}>{barStatusMeta.label}</span>
          ) : null}
        </div>

        {isLoadingBarStatus ? (
          <div className="detail-stack" style={{ gap: 10 }}>
            <Skeleton variant="card" style={{ height: 80 }} />
            <Skeleton variant="card" style={{ height: 50 }} />
          </div>
        ) : (
          <div className="detail-stack">
            <label className="field">
              <span>Status atual</span>
              <SelectField
                className="text-input"
                value={barStatusDraft.status}
                onChange={(event) =>
                  setBarStatusDraft((currentDraft) => ({
                    ...currentDraft,
                    status: event.target.value,
                  }))
                }
              >
                {BAR_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </label>

            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                onClick={handleSaveBarStatus}
                disabled={isSavingBarStatus}
              >
                {isSavingBarStatus ? 'Salvando...' : 'Salvar status da barra'}
              </button>
            </div>

            {barSyncHealth === 'failing' ? (
              <div className="error-banner" role="alert">
                Falha na última leitura da Praticagem ZP21 ({formatRelativeTime(barSuggestion.lastAttemptAt)}):{' '}
                {barSuggestion.lastError.replace(/[.\s]+$/, '')}. O status abaixo pode estar desatualizado.
              </div>
            ) : null}

            {barSyncHealth === 'stale' ? (
              <div className="error-banner" role="alert">
                {barSuggestion.lastSuccessAt
                  ? `A última leitura bem-sucedida da Praticagem ZP21 foi ${formatRelativeTime(barSuggestion.lastSuccessAt)}. O robô pode estar atrasado ou parado — confira o site da praticagem e ajuste manualmente se preciso.`
                  : 'Ainda não houve leitura bem-sucedida da Praticagem ZP21.'}
              </div>
            ) : null}

            {barSuggestion?.status ? (
              <div className={`suggestion-banner suggestion-banner--${barSuggestion.tone}`}>
                <div className="suggestion-banner__text">
                  <strong>{barSuggestion.sourceName}</strong>:{' '}
                  <span className={`status-tag status-tag--${barSuggestion.tone}`}>
                    {barSuggestion.label}
                  </span>
                  {barSuggestion.lastSuccessAt ?? barSuggestion.fetchedAt ? (
                    <span className="suggestion-banner__time">
                      {' '}
                      ({formatRelativeTime(barSuggestion.lastSuccessAt ?? barSuggestion.fetchedAt)})
                    </span>
                  ) : null}
                  {barSuggestion.siteDescription ? (
                    <div className="suggestion-banner__time">
                      Texto do site: {barSuggestion.siteDescription}
                      {barSuggestion.restriction ? ` — restrição: ${barSuggestion.restriction}` : ''}
                    </div>
                  ) : null}
                </div>
                {suggestionMatchesCurrent ? (
                  <span className="suggestion-banner__match">
                    Coincide com o status atual.
                    {barSuggestion.lastAppliedAt
                      ? ` Aplicado automaticamente ${formatRelativeTime(barSuggestion.lastAppliedAt)}.`
                      : ''}
                  </span>
                ) : (
                  <>
                    <span className="suggestion-banner__match">
                      Status manual difere do site. Volta a seguir a praticagem na próxima mudança do site.
                    </span>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={handleApplySuggestion}
                      disabled={isSavingBarStatus}
                    >
                      Aplicar
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        )}
      </article>
    </>
  )
}
