import { useEffect, useMemo, useState } from 'react'
import useAuth from '../../hooks/useAuth'
import useMediaQuery from '../../hooks/useMediaQuery'
import { useForecastSettings } from '../../hooks/useForecastSettings'
import Skeleton from '../../components/Skeleton'
import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import SelectField from '../../components/SelectField'
import { loadLeadTimeDataset } from '../../services/processEventsRepository'
import { saveForecastSettings } from '../../services/forecastSettingsRepository'
import {
  LEAD_TIME_SEGMENTS,
  MIN_SAMPLE_FOR_SUGGESTION,
  PERIOD_OPTIONS,
  buildBusinessDaysSuggestions,
  buildLeadTimeReport,
  getTodayKeySaoPaulo,
} from './leadTimeStats'
import { buildActionErrorMessage } from '../../utils/errorMessages'

// Refino F6b (AdminLeadTime.dc.html): >= 1041px a tela escolhe uma arvore propria; tablet e mobile ficam
// na arvore anterior, sem mudanca.
const DESKTOP_QUERY = '(min-width: 1041px)'

// Trecho "chegada -> recebimento" do mock (dias uteis, arrivalToReceiptBusiness); os outros 5 vao para "Outros trechos" (D11).
const MAIN_SEGMENT_ID = 'arrivalToReceiptBusiness'

// A mediana real "diverge" da previsao atual a partir de 2 dias (destaque em --warning, como no mock).
const DIVERGENCE_DAYS = 2

function formatDays(value, unit, withUnit = true) {
  const formatted = value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  if (!withUnit) return formatted
  return unit === 'uteis' ? `${formatted} d úteis` : `${formatted} d`
}

function LeadTimeTable({ group, maxMedianBySegment }) {
  return (
    <div className="admin-table-wrapper">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Porto</th>
            {LEAD_TIME_SEGMENTS.map((segment) => (
              <th key={segment.id}>{segment.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group.rows.map((row) => (
            <tr key={row.portLabel}>
              <td data-label="Porto">
                <strong>{row.portLabel}</strong>
              </td>
              {LEAD_TIME_SEGMENTS.map((segment) => {
                const stat = row.segments[segment.id]
                const maxMedian = maxMedianBySegment[segment.id] || 0
                return (
                  <td key={segment.id} data-label={segment.label} className="lead-time-cell">
                    {stat && stat.sufficient ? (
                      <>
                        <span className="lead-time-cell__stat">
                          Mediana {formatDays(stat.median, segment.unit)} · P80{' '}
                          {formatDays(stat.p80, segment.unit)}
                        </span>
                        <span className="lead-time-cell__n">n = {stat.n}</span>
                        <span
                          className="lead-time-bar"
                          role="img"
                          aria-label={`Mediana ${formatDays(stat.median, segment.unit)}, P80 ${formatDays(
                            stat.p80,
                            segment.unit
                          )}, n = ${stat.n}`}
                        >
                          <span
                            className="lead-time-bar__fill"
                            style={{ width: `${maxMedian > 0 ? (stat.median / maxMedian) * 100 : 0}%` }}
                          />
                          <span
                            className="lead-time-bar__p80"
                            style={{ left: `${maxMedian > 0 ? Math.min((stat.p80 / maxMedian) * 100, 100) : 0}%` }}
                          />
                        </span>
                      </>
                    ) : (
                      <span className="lead-time-cell__n">n = {stat?.n ?? 0} · insuficiente</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AdminLeadTimePanel() {
  const { profile } = useAuth()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const { settings, loading: settingsLoading } = useForecastSettings()
  const [dataset, setDataset] = useState({ processes: [], eventsByProcessId: {} })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [periodId, setPeriodId] = useState('180')
  const [savingCategory, setSavingCategory] = useState('')
  const [feedback, setFeedback] = useState('')
  const [othersOpen, setOthersOpen] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function load() {
      setIsLoading(true)
      setError('')

      try {
        const loaded = await loadLeadTimeDataset()
        if (isMounted) {
          setDataset(loaded)
        }
      } catch (loadError) {
        if (isMounted) {
          setError(buildActionErrorMessage('Não foi possível carregar o histórico de marcos.', loadError))
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      isMounted = false
    }
  }, [])

  const periodDays = useMemo(
    () => PERIOD_OPTIONS.find((option) => option.id === periodId)?.days ?? null,
    [periodId]
  )

  const report = useMemo(
    () =>
      buildLeadTimeReport({
        processes: dataset.processes,
        eventsByProcessId: dataset.eventsByProcessId,
        destinations: settings?.destinations,
        periodDays,
        todayKey: getTodayKeySaoPaulo(),
      }),
    [dataset, settings?.destinations, periodDays]
  )

  const suggestions = useMemo(
    () => buildBusinessDaysSuggestions(report, settings?.categoryBusinessDays),
    [report, settings?.categoryBusinessDays]
  )

  const hasSufficientData = report.groups.some((group) =>
    group.rows.some((row) => Object.values(row.segments).some((stat) => stat.sufficient))
  )

  async function handleApplySuggestion(category, suggestedValue) {
    setSavingCategory(category)
    setError('')
    setFeedback('')

    try {
      const currentValue = settings?.categoryBusinessDays?.[category]
      const saved = await saveForecastSettings(
        {
          ...settings,
          categoryBusinessDays: { ...settings.categoryBusinessDays, [category]: suggestedValue },
        },
        profile
      )
      setFeedback(
        `Dias úteis de ${category} atualizados de ${currentValue} para ${suggestedValue}.`
      )
      return saved
    } catch (saveError) {
      setError(buildActionErrorMessage('Não foi possível aplicar a sugestão.', saveError))
      return null
    } finally {
      setSavingCategory('')
    }
  }

  if (isLoading || settingsLoading) {
    if (isDesktop) {
      return (
        <div className="admin-panel admin-panel--lead-time al-root">
          <Skeleton variant="card" style={{ height: 64 }} />
          <Skeleton variant="card" style={{ height: 260 }} />
          <Skeleton variant="card" style={{ height: 200 }} />
        </div>
      )
    }

    return (
      <div className="admin-panel-stack" style={{ gap: 16 }}>
        <Skeleton variant="card" style={{ height: 60 }} />
        <Skeleton variant="card" style={{ height: 220 }} />
        <Skeleton variant="card" style={{ height: 160 }} />
      </div>
    )
  }

  if (error) {
    const retryLoad = () => {
      setIsLoading(true)
      loadLeadTimeDataset()
        .then((loaded) => {
          setDataset(loaded)
          setError('')
        })
        .catch((retryError) =>
          setError(buildActionErrorMessage('Não foi possível carregar o histórico de marcos.', retryError))
        )
        .finally(() => setIsLoading(false))
    }

    if (isDesktop) {
      return (
        <div className="admin-panel admin-panel--lead-time al-root">
          <div className="error-banner">{error}</div>
          <button type="button" className="secondary-button al-retry" onClick={retryLoad}>
            Tentar novamente
          </button>
        </div>
      )
    }

    return (
      <div className="admin-panel-stack">
        <div className="error-banner">{error}</div>
        <button type="button" className="ghost-button ghost-button--secondary" onClick={retryLoad}>
          Tentar novamente
        </button>
      </div>
    )
  }

  const maxMedianBySegment = {}
  for (const segment of LEAD_TIME_SEGMENTS) {
    let max = 0
    for (const group of report.groups) {
      for (const row of group.rows) {
        const stat = row.segments[segment.id]
        if (stat?.sufficient && stat.median > max) max = stat.median
      }
    }
    maxMedianBySegment[segment.id] = max
  }

  const excludedTotal = report.excluded.negative + report.excluded.outlier + report.excluded.invalid

  // Refino F6b (AdminLeadTime.dc.html): >= 1041px a tela vira "Previsao x real" — uma tabela por modal
  // (Porto / Atual / Mediana real / P80 / n + barras duplas + "Aplicar N dias") e os outros 5 trechos numa
  // secao recolhivel "Outros trechos" (D11). Tablet/mobile seguem na arvore abaixo, intacta. Dados,
  // sugestoes e o save sao os mesmos (vivem la em cima).
  if (isDesktop) {
    const suggestionByCategory = Object.fromEntries(suggestions.map((suggestion) => [suggestion.category, suggestion]))
    const otherSegments = LEAD_TIME_SEGMENTS.filter((segment) => segment.id !== MAIN_SEGMENT_ID)
    const groupCategories = new Set(report.groups.map((group) => group.category))
    const categoriesWithoutSamples = suggestions.filter((suggestion) => !groupCategories.has(suggestion.category))

    // Escala das barras duplas (Atual x mediana): a mesma para todas as tabelas exibidas, minimo 1 dia.
    let barMax = 1
    for (const group of report.groups) {
      barMax = Math.max(barMax, suggestionByCategory[group.category]?.current ?? 0)
      for (const row of group.rows) {
        const stat = row.segments[MAIN_SEGMENT_ID]
        if (stat?.sufficient) barMax = Math.max(barMax, stat.median)
      }
    }

    return (
      <div className="admin-panel admin-panel--lead-time al-root">
        {feedback ? <div className="success-banner">{feedback}</div> : null}

        <div className="al-head">
          <div className="al-head__text">
            <h3 className="al-title">Previsão × real</h3>
            <p className="al-subtitle">Dias úteis da atracação/chegada até o recebimento, por modal e porto.</p>
          </div>
          <label className="field al-period">
            <span>Período</span>
            <SelectField value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </label>
        </div>

        {report.sampleCount === 0 || !hasSufficientData ? (
          <EmptyState
            illustration="filter"
            title="Dados insuficientes"
            message="O histórico de marcos só é registrado desde set/2026, sem dados retroativos. São necessários pelo menos 3 processos por modal e porto com os dois marcos do trecho."
          />
        ) : null}

        {report.groups.map((group) => {
          const suggestion = suggestionByCategory[group.category]
          const allRow = group.rows.find((row) => row.isAll)
          const allStat = allRow?.segments[MAIN_SEGMENT_ID]

          return (
            <section
              key={group.category}
              className="ad-card al-card"
              aria-label={`Previsão × real (dias úteis da atracação/chegada até o recebimento) — ${group.category}`}
            >
              <div className="al-card__head">
                <h4 className="al-pill">{group.category}</h4>
                <span className="al-card__note">
                  {suggestion ? `Previsão atual: ${suggestion.current} dias úteis` : null}
                  {allStat ? ` · ${allStat.n} ${allStat.n === 1 ? 'amostra' : 'amostras'} no trecho` : null}
                </span>
              </div>
              <div className="al-table-wrap">
                <table className="al-table">
                  <thead>
                    <tr>
                      <th>Porto</th>
                      <th className="al-table__num">Atual</th>
                      <th className="al-table__num al-table__num--wide">Mediana real</th>
                      <th className="al-table__num">P80</th>
                      <th className="al-table__num al-table__num--narrow">n</th>
                      <th>Atual × mediana</th>
                      <th className="al-table__action">
                        <span className="al-visually-hidden">Ação</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => {
                      const stat = row.segments[MAIN_SEGMENT_ID]
                      const current = suggestion?.current ?? 0
                      const hasStat = Boolean(stat?.sufficient)
                      const diverges = hasStat && Math.abs(stat.median - current) >= DIVERGENCE_DAYS
                      return (
                        <tr key={row.portLabel} className={row.isAll ? 'al-row--all' : undefined}>
                          <td className="al-port">{row.portLabel}</td>
                          <td className="al-num">{current}</td>
                          <td className={`al-num al-num--median${diverges ? ' al-num--diverge' : ''}`}>
                            {hasStat ? formatDays(stat.median, 'uteis', false) : '—'}
                          </td>
                          <td className="al-num al-num--soft">
                            {hasStat ? formatDays(stat.p80, 'uteis', false) : '—'}
                          </td>
                          <td className="al-num al-num--n">{stat?.n ?? 0}</td>
                          <td>
                            {hasStat ? (
                              <span
                                className="al-bars"
                                role="img"
                                aria-label={`Atual ${current} d úteis, mediana real ${formatDays(stat.median, 'uteis')}`}
                              >
                                <span className="al-bar al-bar--current" style={{ width: `${(current / barMax) * 100}%` }} />
                                <span
                                  className={`al-bar al-bar--median${diverges ? ' al-bar--diverge' : ''}`}
                                  style={{ width: `${(stat.median / barMax) * 100}%` }}
                                />
                              </span>
                            ) : (
                              <span className="al-insufficient">n = {stat?.n ?? 0} · insuficiente</span>
                            )}
                          </td>
                          <td className="al-table__action">
                            {row.isAll && suggestion?.suggested !== null && suggestion?.suggested !== undefined ? (
                              <button
                                type="button"
                                className="secondary-button al-apply"
                                disabled={savingCategory === group.category}
                                onClick={() => handleApplySuggestion(group.category, suggestion.suggested)}
                              >
                                {savingCategory === group.category ? 'Aplicando...' : `Aplicar ${suggestion.suggested} dias`}
                              </button>
                            ) : row.isAll && suggestion && suggestion.n < MIN_SAMPLE_FOR_SUGGESTION ? (
                              <span className="al-insufficient">sem sugestão (n &lt; {MIN_SAMPLE_FOR_SUGGESTION})</span>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })}

        {categoriesWithoutSamples.length > 0 ? (
          <section className="ad-card al-card al-card--empty" aria-label="Modais sem amostras no período">
            <h4 className="al-card__title">Sem amostras no período</h4>
            <ul className="al-empty-list">
              {categoriesWithoutSamples.map((suggestion) => (
                <li key={suggestion.category} className="al-empty-list__item">
                  <span className="al-pill">{suggestion.category}</span>
                  <span className="al-empty-list__text">previsão atual {suggestion.current} d úteis</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="al-legend" aria-label="Legenda das barras">
          <span className="al-legend__item">
            <span className="al-legend__swatch al-legend__swatch--current" aria-hidden="true" />
            Previsão atual
          </span>
          <span className="al-legend__item">
            <span className="al-legend__swatch al-legend__swatch--median" aria-hidden="true" />
            Mediana real
          </span>
          <span className="al-legend__item">
            <span className="al-legend__swatch al-legend__swatch--diverge" aria-hidden="true" />
            Diverge {DIVERGENCE_DAYS}+ dias
          </span>
        </div>

        <section className="ad-card al-others">
          <button
            type="button"
            className="al-others__toggle"
            aria-expanded={othersOpen}
            aria-controls="al-others-body"
            onClick={() => setOthersOpen((current) => !current)}
          >
            <span className="al-others__titles">
              <span className="al-others__title">Outros trechos</span>
              <span className="al-others__hint">
                {otherSegments.length} trechos em dias corridos, por modal e porto (mediana, P80 e n).
              </span>
            </span>
            <Icon name="chevron-down" size={18} strokeWidth={2.2} className="al-others__chevron" />
          </button>

          {othersOpen ? (
            <div className="al-others__body" id="al-others-body">
              {otherSegments.map((segment) => {
                let segmentMax = 1
                for (const group of report.groups) {
                  for (const row of group.rows) {
                    const stat = row.segments[segment.id]
                    if (stat?.sufficient) segmentMax = Math.max(segmentMax, stat.p80)
                  }
                }

                return (
                  <section key={segment.id} className="al-segment" aria-label={segment.label}>
                    <div className="al-segment__head">
                      <h4 className="al-segment__title">{segment.label}</h4>
                      <span className="al-segment__unit">
                        {segment.unit === 'uteis' ? 'dias úteis' : 'dias corridos'}
                      </span>
                    </div>
                    <div className="al-table-wrap">
                      <table className="al-table al-table--segment">
                        <thead>
                          <tr>
                            <th>Modal</th>
                            <th>Porto</th>
                            <th className="al-table__num al-table__num--wide">Mediana real</th>
                            <th className="al-table__num">P80</th>
                            <th className="al-table__num al-table__num--narrow">n</th>
                            <th>Mediana × P80</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.groups.flatMap((group) =>
                            group.rows.map((row) => {
                              const stat = row.segments[segment.id]
                              const hasStat = Boolean(stat?.sufficient)
                              return (
                                <tr key={`${group.category}-${row.portLabel}`} className={row.isAll ? 'al-row--all' : undefined}>
                                  <td>
                                    <span className="al-pill al-pill--small">{group.category}</span>
                                  </td>
                                  <td className="al-port">{row.portLabel}</td>
                                  <td className="al-num al-num--median">
                                    {hasStat ? formatDays(stat.median, segment.unit, false) : '—'}
                                  </td>
                                  <td className="al-num al-num--soft">
                                    {hasStat ? formatDays(stat.p80, segment.unit, false) : '—'}
                                  </td>
                                  <td className="al-num al-num--n">{stat?.n ?? 0}</td>
                                  <td>
                                    {hasStat ? (
                                      <span
                                        className="al-bars"
                                        role="img"
                                        aria-label={`Mediana ${formatDays(stat.median, segment.unit)}, P80 ${formatDays(stat.p80, segment.unit)}, n = ${stat.n}`}
                                      >
                                        <span
                                          className="al-bar al-bar--median"
                                          style={{ width: `${(stat.median / segmentMax) * 100}%` }}
                                        />
                                        <span
                                          className="al-bar al-bar--current"
                                          style={{ width: `${(stat.p80 / segmentMax) * 100}%` }}
                                        />
                                      </span>
                                    ) : (
                                      <span className="al-insufficient">n = {stat?.n ?? 0} · insuficiente</span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )
              })}
            </div>
          ) : null}
        </section>

        <p className="al-note">
          Tempo real medido pelos marcos registrados no histórico dos processos. Processos arquivados ficam
          fora. A sugestão nunca é aplicada automaticamente; a previsão também usa rolling customs e a janela
          de coleta, e este ajuste muda só os dias úteis por categoria.
        </p>
        <p className="al-note">
          {report.sampleCount} amostras · {excludedTotal} descartadas (datas invertidas, acima de 180 dias ou
          inválidas).
        </p>
      </div>
    )
  }

  return (
    <div className="admin-panel-stack">
      {feedback ? <div className="success-banner">{feedback}</div> : null}

      <div className="admin-toolbar admin-toolbar--right">
        <label className="field">
          <span>Período</span>
          <SelectField value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </label>
      </div>

      <p className="field-hint">
        Tempo real medido pelos marcos registrados no histórico dos processos. Processos arquivados
        ficam fora.
      </p>

      {report.sampleCount === 0 || !hasSufficientData ? (
        <EmptyState
          illustration="filter"
          title="Dados insuficientes"
          message="O histórico de marcos só é registrado desde set/2026, sem dados retroativos. São necessários pelo menos 3 processos por modal e porto com os dois marcos do trecho."
        />
      ) : (
        <div className="admin-feature-stack">
          {report.groups.map((group) => (
            <article className="list-card" key={group.category}>
              <div className="card-heading">
                <div>
                  <h3>{group.category}</h3>
                </div>
              </div>
              <LeadTimeTable group={group} maxMedianBySegment={maxMedianBySegment} />
            </article>
          ))}
        </div>
      )}

      <article className="list-card">
        <div className="card-heading">
          <div>
            <h3>Previsão × real (dias úteis após a chegada)</h3>
            <p>
              A sugestão nunca é aplicada automaticamente. A previsão também usa rolling customs e a
              janela de coleta; este ajuste muda só os dias úteis por categoria.
            </p>
          </div>
        </div>
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Modal</th>
                <th>Atual</th>
                <th>Mediana real</th>
                <th>P80</th>
                <th>n</th>
                <th aria-label="Ação" />
              </tr>
            </thead>
            <tbody>
              {suggestions.map((suggestion) => (
                <tr key={suggestion.category}>
                  <td data-label="Modal">
                    <strong>{suggestion.category}</strong>
                  </td>
                  <td data-label="Atual">{suggestion.current} d úteis</td>
                  <td data-label="Mediana real">
                    {suggestion.median !== null
                      ? formatDays(suggestion.median, 'uteis')
                      : '—'}
                  </td>
                  <td data-label="P80">
                    {suggestion.p80 !== null ? formatDays(suggestion.p80, 'uteis') : '—'}
                  </td>
                  <td data-label="n">{suggestion.n}</td>
                  <td className="admin-table__actions-cell lead-time-suggestion">
                    {suggestion.suggested !== null ? (
                      <button
                        type="button"
                        className="primary-button"
                        disabled={savingCategory === suggestion.category}
                        onClick={() => handleApplySuggestion(suggestion.category, suggestion.suggested)}
                      >
                        {savingCategory === suggestion.category
                          ? 'Aplicando...'
                          : `Aplicar ${suggestion.suggested} dias`}
                      </button>
                    ) : (
                      <span className="lead-time-cell__n">sem sugestão (n &lt; {MIN_SAMPLE_FOR_SUGGESTION})</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <p className="field-hint">
        {report.sampleCount} amostras · {excludedTotal} descartadas (datas invertidas, acima de 180 dias
        ou inválidas).
      </p>
    </div>
  )
}
