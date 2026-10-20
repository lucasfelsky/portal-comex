import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import SelectField from '../../components/SelectField'
import Skeleton from '../../components/Skeleton'
import {
  BAR_STATUS_OPTIONS,
  getBarStatus,
  getBarSuggestion,
  saveBarStatus,
} from '../../services/barStatusRepository'
import useAuth from '../../hooks/useAuth'
import useMediaQuery from '../../hooks/useMediaQuery'
import { formatRelativeTime } from '../../utils/dateFormat'
import { buildActionErrorMessage } from '../../utils/errorMessages'

// Sem leitura bem-sucedida da Praticagem ZP21 por mais de 8 h = robô parado/bloqueado
// (o cron roda 4x/hora; atraso normal do GitHub não chega perto disso).
const BAR_SYNC_STALE_AFTER_MS = 8 * 60 * 60 * 1000

// Refino F6a (AdminBarra.dc.html): >= 1041px o status vira 3 cartoes de radio e o robo ganha um cartao
// proprio (tablet/mobile ficam na arvore anterior: select + banners).
const DESKTOP_QUERY = '(min-width: 1041px)'

// Rotulo e dica de cada opcao no desktop (o repositorio guarda o rotulo em CAIXA ALTA sem acento, que
// o Dashboard e a arvore anterior continuam usando).
const BAR_DISPLAY = {
  PRATICAVEL: { label: 'Praticável', hint: 'Canal liberado, sem restrições.' },
  PRATICAVEL_RESTRICOES: { label: 'Praticável c/ restrições', hint: 'Navios com limite de calado ou janela.' },
  IMPRATICAVEL: { label: 'Impraticável', hint: 'Canal fechado para manobras.' },
}

function getBarDisplay(value, fallbackLabel) {
  return BAR_DISPLAY[value] ?? { label: fallbackLabel ?? value, hint: '' }
}

// "às 08:42" (hoje) ou "em 19/10 às 08:42", pela data LOCAL; manual, nunca toISOString (BRT).
function formatAppliedAt(value, now = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (number) => String(number).padStart(2, '0')
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  return sameDay ? `às ${time}` : `em ${pad(date.getDate())}/${pad(date.getMonth() + 1)} às ${time}`
}

function AlertCircleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  )
}

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
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
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
  // Data de aplicacao invalida -> '' (formatRelativeTime): sem frase, nunca "Aplicado automaticamente .".
  const legacyAppliedAgo = barSuggestion?.lastAppliedAt ? formatRelativeTime(barSuggestion.lastAppliedAt) : ''

  // Refino F6a (AdminBarra.dc.html): >= 1041px o status vira 3 cartoes de radio (no lugar do select) e o
  // robo da Praticagem ZP21 ganha um cartao proprio. Tablet/mobile seguem na arvore abaixo, intacta
  // (select + banners). Estado e handlers sao os mesmos (vivem aqui em cima), entao a troca ao vivo de
  // breakpoint mantem a opcao escolhida e ainda nao salva.
  if (isDesktop) {
    const currentTone = barStatusMeta?.tone ?? null
    const currentDisplay = barStatusMeta ? getBarDisplay(barStatusMeta.status, barStatusMeta.label) : null
    const lastReadAt = barSuggestion ? barSuggestion.lastSuccessAt ?? barSuggestion.fetchedAt : null
    const healthPill =
      barSyncHealth === 'failing'
        ? { tone: 'danger', label: 'Com falha' }
        : barSyncHealth === 'stale'
          ? { tone: 'warn', label: 'Atrasado' }
          : { tone: 'ok', label: 'Em dia' }
    const suggestionDisplay = barSuggestion?.status ? getBarDisplay(barSuggestion.status, barSuggestion.label) : null
    // Data de aplicacao invalida -> '' (formatAppliedAt): sem frase, nunca "Aplicado automaticamente .".
    const appliedAtText = barSuggestion?.lastAppliedAt ? formatAppliedAt(barSuggestion.lastAppliedAt) : ''

    return (
      <div className="admin-panel admin-panel--bar ab-root">
        {error ? <div className="error-banner">{error}</div> : null}

        <div className={`ab-grid${barSuggestion ? '' : ' ab-grid--single'}`}>
          <section className="ad-card ab-status-card">
            <div className="ab-head">
              <div className="ab-head__text">
                <h3 className="ab-title">Barra Itajaí/Navegantes</h3>
                <p className="ab-subtitle">Indica a condição operacional do canal de acesso ao porto.</p>
              </div>
              {currentDisplay ? (
                <span className={`ab-state ab-state--${currentTone}`}>
                  <span className="ab-state__dot" aria-hidden="true" />
                  {currentDisplay.label}
                </span>
              ) : null}
            </div>

            {isLoadingBarStatus ? (
              <div className="ab-skeleton">
                <Skeleton variant="card" style={{ height: 66 }} />
                <Skeleton variant="card" style={{ height: 66 }} />
                <Skeleton variant="card" style={{ height: 66 }} />
              </div>
            ) : (
              <>
                <fieldset className="ab-options">
                  <legend>Status atual</legend>
                  {BAR_STATUS_OPTIONS.map((option) => {
                    const display = getBarDisplay(option.value, option.label)
                    const isChecked = barStatusDraft.status === option.value
                    const hintId = `bar-status-hint-${option.value}`
                    return (
                      <label
                        key={option.value}
                        className={`ab-option ab-option--${option.tone}${isChecked ? ' ab-option--checked' : ''}`}
                      >
                        <input
                          type="radio"
                          name="bar-status"
                          value={option.value}
                          checked={isChecked}
                          aria-label={display.label}
                          aria-describedby={hintId}
                          onChange={() =>
                            setBarStatusDraft((currentDraft) => ({ ...currentDraft, status: option.value }))
                          }
                        />
                        <span className="ab-option__radio" aria-hidden="true">
                          <span className="ab-option__radio-dot" />
                        </span>
                        <span className="ab-option__text">
                          <span className="ab-option__label">{display.label}</span>
                          <span className="ab-option__hint" id={hintId}>
                            {display.hint}
                          </span>
                        </span>
                        <span className="ab-option__tone" aria-hidden="true" />
                      </label>
                    )
                  })}
                </fieldset>

                <button
                  type="button"
                  className="primary-button ab-save"
                  onClick={handleSaveBarStatus}
                  disabled={isSavingBarStatus}
                >
                  {isSavingBarStatus ? 'Salvando...' : 'Salvar status da barra'}
                </button>
              </>
            )}
          </section>

          {barSuggestion ? (
            <div className="ab-side">
              <section className="ad-card ab-robot">
                <div className="ab-robot__head">
                  <span className="ab-robot__icon" aria-hidden="true">
                    <Icon name="robot" size={18} strokeWidth={1.9} />
                  </span>
                  <div className="ab-robot__text">
                    <strong className="ab-robot__name">Robô da {barSuggestion.sourceName}</strong>
                    <span className="ab-robot__source">
                      Lê o campo <span className="ad-mono">cond_barra</span> do site
                      {lastReadAt ? ` · ${formatRelativeTime(lastReadAt)}` : ''}
                    </span>
                  </div>
                  <span className={`ad-pill ad-pill--${healthPill.tone}`}>{healthPill.label}</span>
                </div>

                {barSuggestion.siteDescription ? (
                  <div className="ab-robot__read">
                    <span className="ab-robot__read-label">Texto do site:</span> “{barSuggestion.siteDescription}”
                    {barSuggestion.restriction ? (
                      <>
                        {' '}
                        — <span className="ab-robot__read-label">restrição:</span> {barSuggestion.restriction}
                      </>
                    ) : null}
                  </div>
                ) : null}

                {barSyncHealth === 'failing' ? (
                  <div className="ab-notice ab-notice--danger" role="alert">
                    <AlertCircleIcon />
                    <span className="ab-notice__text">
                      {`Falha na última leitura da ${barSuggestion.sourceName} (${formatRelativeTime(barSuggestion.lastAttemptAt)}): ${barSuggestion.lastError.replace(/[.\s]+$/, '')}. O status atual pode estar desatualizado.`}
                    </span>
                  </div>
                ) : null}

                {barSyncHealth === 'stale' ? (
                  <div className="ab-notice ab-notice--danger" role="alert">
                    <AlertCircleIcon />
                    <span className="ab-notice__text">
                      {barSuggestion.lastSuccessAt
                        ? `Robô sem leitura há mais de 8 h. A última leitura bem-sucedida foi ${formatRelativeTime(barSuggestion.lastSuccessAt)}. Confira o site da praticagem e ajuste manualmente se preciso.`
                        : `Ainda não houve leitura bem-sucedida da ${barSuggestion.sourceName}. Confira o site da praticagem.`}
                    </span>
                  </div>
                ) : null}

                {suggestionDisplay ? (
                  suggestionMatchesCurrent ? (
                    <div className="ab-notice ab-notice--ok" role="status">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m5 12 5 5 9-10" />
                      </svg>
                      <span className="ab-notice__text">
                        Coincide com o status atual.
                        {appliedAtText ? ` Aplicado automaticamente ${appliedAtText}.` : ''}
                      </span>
                    </div>
                  ) : (
                    <div className="ab-notice ab-notice--warn" role="alert">
                      <span className="ab-notice__text">
                        Status manual difere do site: o robô leu “{suggestionDisplay.label}”. Volta a seguir a
                        praticagem na próxima mudança do site.
                      </span>
                      <button
                        type="button"
                        className="ab-notice__apply"
                        onClick={handleApplySuggestion}
                        disabled={isSavingBarStatus}
                      >
                        Aplicar
                      </button>
                    </div>
                  )
                ) : null}
              </section>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

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
                    {legacyAppliedAgo ? ` Aplicado automaticamente ${legacyAppliedAgo}.` : ''}
                  </span>
                ) : (
                  <>
                    <span className="suggestion-banner__match">
                      Status manual difere do site. Volta a seguir a praticagem na próxima mudança do site.
                    </span>
                    <button
                      type="button"
                      className="ghost-button ghost-button--secondary"
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
