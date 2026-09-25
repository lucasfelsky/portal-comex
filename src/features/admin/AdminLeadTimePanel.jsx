import { useEffect, useMemo, useState } from 'react'
import useAuth from '../../hooks/useAuth'
import { useForecastSettings } from '../../hooks/useForecastSettings'
import Skeleton from '../../components/Skeleton'
import EmptyState from '../../components/EmptyState'
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

// Padrao replicado (nao e' util compartilhado): AdminBarStatusPanel.jsx.
function buildActionErrorMessage(prefix, error) {
  const details = error?.code ?? error?.message
  return details ? `${prefix} (${details})` : prefix
}

function formatDays(value, unit) {
  const formatted = value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
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
  const { settings, loading: settingsLoading } = useForecastSettings()
  const [dataset, setDataset] = useState({ processes: [], eventsByProcessId: {} })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [periodId, setPeriodId] = useState('180')
  const [savingCategory, setSavingCategory] = useState('')
  const [feedback, setFeedback] = useState('')

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
    return (
      <div className="admin-panel-stack" style={{ gap: 16 }}>
        <Skeleton variant="card" style={{ height: 60 }} />
        <Skeleton variant="card" style={{ height: 220 }} />
        <Skeleton variant="card" style={{ height: 160 }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-panel-stack">
        <div className="error-banner">{error}</div>
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
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
          }}
        >
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
