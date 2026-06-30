import { useEffect, useState } from 'react'
import { BAR_STATUS_OPTIONS, getBarStatus, saveBarStatus } from '../../services/barStatusRepository'
import useAuth from '../../hooks/useAuth'
import { isFirebaseConfigured } from '../../lib/firebase'

function buildActionErrorMessage(prefix, error) {
  const details = error?.code ?? error?.message
  return details ? `${prefix} (${details})` : prefix
}

export default function AdminBarStatusPanel() {
  const { profile } = useAuth()
  const [barStatusDraft, setBarStatusDraft] = useState({
    status: BAR_STATUS_OPTIONS[0].value,
    notes: '',
  })
  const [barStatusMeta, setBarStatusMeta] = useState(null)
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

    loadBarStatus()

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

  return (
    <div className="admin-panel-stack">
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
          <div className="empty-state">
            <strong>Carregando status da barra</strong>
            <p>Buscando a última condição operacional registrada.</p>
          </div>
        ) : (
          <div className="detail-stack">
            <label className="field">
              <span>Status atual</span>
              <select
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
              </select>
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
          </div>
        )}
      </article>
    </div>
  )
}
