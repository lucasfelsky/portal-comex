import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import { useForecastSettings } from '../hooks/useForecastSettings'
import {
  CATEGORY_OPTIONS,
  DEFAULT_FORECAST_SETTINGS,
  getDefaultForecastSettings,
  resetForecastSettings,
  saveForecastSettings,
} from '../services/forecastSettingsRepository'
import { isFirebaseConfigured } from '../lib/firebase'

const HOUR_BOUNDS = { min: 0, max: 23 }
const BUSINESS_DAY_BOUNDS = { min: 0, max: 30 }

function buildEmptyDestination() {
  return { match: '', label: '', cutoffHour: 12, cutoffMinute: 0 }
}

function normalizeDraft(settings) {
  const baseline = settings && settings.id ? settings : getDefaultForecastSettings()
  return {
    destinations: Array.isArray(baseline.destinations)
      ? baseline.destinations.map((destination) => ({
          match: destination.match ?? '',
          label: destination.label ?? '',
          cutoffHour: Number.isFinite(Number(destination.cutoffHour))
            ? Number(destination.cutoffHour)
            : 12,
          cutoffMinute: Number.isFinite(Number(destination.cutoffMinute))
            ? Number(destination.cutoffMinute)
            : 0,
        }))
      : [],
    categoryBusinessDays: { ...baseline.categoryBusinessDays },
    rollingCustoms: {
      enabled: Boolean(baseline.rollingCustoms?.enabled),
      businessDaysAfterBerth: Number.isFinite(Number(baseline.rollingCustoms?.businessDaysAfterBerth))
        ? Number(baseline.rollingCustoms.businessDaysAfterBerth)
        : 3,
      appliesTo: Array.isArray(baseline.rollingCustoms?.appliesTo)
        ? baseline.rollingCustoms.appliesTo.slice()
        : [],
      duimpStatuses: Array.isArray(baseline.rollingCustoms?.duimpStatuses)
        ? baseline.rollingCustoms.duimpStatuses.slice()
        : [],
    },
  }
}

function validateDraft(draft) {
  const errors = []

  draft.destinations.forEach((destination, index) => {
    if (!destination.match.trim()) {
      errors.push(`Destino ${index + 1}: informe o trecho a ser detectado.`)
    }
    if (!destination.label.trim()) {
      errors.push(`Destino ${index + 1}: informe o rótulo exibido.`)
    }
    if (
      !Number.isFinite(Number(destination.cutoffHour)) ||
      Number(destination.cutoffHour) < HOUR_BOUNDS.min ||
      Number(destination.cutoffHour) > HOUR_BOUNDS.max
    ) {
      errors.push(`Destino ${index + 1}: cutoff deve estar entre 0 e 23.`)
    }
    if (
      !Number.isFinite(Number(destination.cutoffMinute)) ||
      Number(destination.cutoffMinute) < 0 ||
      Number(destination.cutoffMinute) > 59
    ) {
      errors.push(`Destino ${index + 1}: minuto deve estar entre 0 e 59.`)
    }
  })

  CATEGORY_OPTIONS.forEach((category) => {
    const value = Number(draft.categoryBusinessDays[category])
    if (!Number.isFinite(value) || value < BUSINESS_DAY_BOUNDS.min || value > BUSINESS_DAY_BOUNDS.max) {
      errors.push(`Dias úteis de ${category} deve estar entre 0 e 30.`)
    }
  })

  const rollingDays = Number(draft.rollingCustoms.businessDaysAfterBerth)
  if (
    draft.rollingCustoms.enabled &&
    (!Number.isFinite(rollingDays) || rollingDays < 0 || rollingDays > BUSINESS_DAY_BOUNDS.max)
  ) {
    errors.push('Dias úteis do rolling customs deve estar entre 0 e 30.')
  }

  if (draft.rollingCustoms.enabled && draft.rollingCustoms.appliesTo.length === 0) {
    errors.push('Selecione ao menos uma categoria para o rolling customs.')
  }

  return errors
}

function formatTimestamp(value) {
  if (!value) return 'Sem alterações registradas ainda'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function summarizeUpdatedBy(settings) {
  if (!settings?.updatedBy) return ''
  const name = settings.updatedBy.name ?? settings.updatedBy.email ?? 'Sistema'
  return name ? ` · ${name}` : ''
}

export default function AdminForecastPage() {
  const { profile } = useAuth()
  const { settings, loading } = useForecastSettings()
  const [draft, setDraft] = useState(() => normalizeDraft(settings))
  const [newDuimpStatus, setNewDuimpStatus] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading) return
    setDraft(normalizeDraft(settings))
  }, [settings, loading])

  const validationErrors = useMemo(() => validateDraft(draft), [draft])
  const hasErrors = validationErrors.length > 0

  function updateDestination(index, patch) {
    setDraft((current) => ({
      ...current,
      destinations: current.destinations.map((destination, destinationIndex) =>
        destinationIndex === index ? { ...destination, ...patch } : destination
      ),
    }))
  }

  function addDestination() {
    setDraft((current) => ({
      ...current,
      destinations: [...current.destinations, buildEmptyDestination()],
    }))
  }

  function removeDestination(index) {
    setDraft((current) => ({
      ...current,
      destinations: current.destinations.filter((_, destinationIndex) => destinationIndex !== index),
    }))
  }

  function updateBusinessDay(category, value) {
    setDraft((current) => ({
      ...current,
      categoryBusinessDays: { ...current.categoryBusinessDays, [category]: value },
    }))
  }

  function toggleAppliesTo(category) {
    setDraft((current) => {
      const has = current.rollingCustoms.appliesTo.includes(category)
      return {
        ...current,
        rollingCustoms: {
          ...current.rollingCustoms,
          appliesTo: has
            ? current.rollingCustoms.appliesTo.filter((item) => item !== category)
            : [...current.rollingCustoms.appliesTo, category],
        },
      }
    })
  }

  function addDuimpStatus() {
    const value = newDuimpStatus.trim()
    if (!value) return
    setDraft((current) => {
      if (current.rollingCustoms.duimpStatuses.includes(value.toLowerCase())) return current
      return {
        ...current,
        rollingCustoms: {
          ...current.rollingCustoms,
          duimpStatuses: [...current.rollingCustoms.duimpStatuses, value.toLowerCase()],
        },
      }
    })
    setNewDuimpStatus('')
  }

  function removeDuimpStatus(status) {
    setDraft((current) => ({
      ...current,
      rollingCustoms: {
        ...current.rollingCustoms,
        duimpStatuses: current.rollingCustoms.duimpStatuses.filter((item) => item !== status),
      },
    }))
  }

  function updateRollingEnabled(enabled) {
    setDraft((current) => ({
      ...current,
      rollingCustoms: { ...current.rollingCustoms, enabled },
    }))
  }

  function updateRollingDays(value) {
    setDraft((current) => ({
      ...current,
      rollingCustoms: { ...current.rollingCustoms, businessDaysAfterBerth: value },
    }))
  }

  async function handleSave() {
    if (hasErrors) {
      setError('Corrija os campos destacados antes de salvar.')
      return
    }

    setIsSaving(true)
    setError('')
    setFeedback('')

    try {
      const saved = await saveForecastSettings(draft, profile)
      setDraft(normalizeDraft(saved))
      setFeedback('Regras de previsão atualizadas. A mudança já vale para todos os usuários.')
    } catch (saveError) {
      setError(`Não foi possível salvar as regras (${saveError?.code ?? saveError?.message ?? saveError}).`)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleReset() {
    if (!window.confirm('Restaurar as regras padrão? Esta ação será registrada na auditoria.')) {
      return
    }
    setIsResetting(true)
    setError('')
    setFeedback('')

    try {
      const saved = await resetForecastSettings(profile)
      setDraft(normalizeDraft(saved))
      setFeedback('Regras restauradas para o padrão do sistema.')
    } catch (resetError) {
      setError(
        `Não foi possível restaurar as regras (${resetError?.code ?? resetError?.message ?? resetError}).`
      )
    } finally {
      setIsResetting(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-panel-stack">
        <div className="empty-state">
          <strong>Carregando regras</strong>
          <p>Buscando a configuração atual persistida em `forecastSettings/current`.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-panel-stack">
      <div className="admin-toolbar admin-toolbar--right">
        <span className="inline-badge">{isFirebaseConfigured ? 'Firestore ativo' : 'Fallback local'}</span>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {feedback ? <div className="success-banner">{feedback}</div> : null}
      {hasErrors ? (
        <div className="error-banner">
          <strong>Verifique os campos:</strong>
          <ul>
            {validationErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="admin-feature-stack">
        <article className="list-card">
          <div className="card-heading">
            <div>
              <h3>Destinos e cutoff</h3>
              <p>Match é comparado (sem acento, case-insensitive) com o destino do processo.</p>
            </div>
            <button type="button" className="primary-button" onClick={addDestination}>
              Adicionar destino
            </button>
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Rótulo</th>
                  <th>Cutoff (h)</th>
                  <th>Min</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {draft.destinations.map((destination, index) => (
                  <tr key={`destination-${index}`}>
                    <td>
                      <input
                        className="text-input"
                        type="text"
                        value={destination.match}
                        placeholder="ex.: navegantes"
                        onChange={(event) => updateDestination(index, { match: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="text-input"
                        type="text"
                        value={destination.label}
                        placeholder="ex.: Navegantes"
                        onChange={(event) => updateDestination(index, { label: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="text-input"
                        type="number"
                        min={HOUR_BOUNDS.min}
                        max={HOUR_BOUNDS.max}
                        value={destination.cutoffHour}
                        onChange={(event) => updateDestination(index, { cutoffHour: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="text-input"
                        type="number"
                        min={0}
                        max={59}
                        value={destination.cutoffMinute}
                        onChange={(event) => updateDestination(index, { cutoffMinute: event.target.value })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => removeDestination(index)}
                        disabled={draft.destinations.length <= 1}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field-hint">Horário de Brasília (UTC−03).</p>
        </article>

        <article className="list-card">
          <div className="card-heading">
            <div>
              <h3>Dias úteis por categoria</h3>
              <p>Aplicados após a ETA quando não há coleta agendada nem rolling customs.</p>
            </div>
          </div>
          <div className="admin-grid admin-grid--quarters">
            {CATEGORY_OPTIONS.map((category) => (
              <label key={category} className="field">
                <span>{category}</span>
                <input
                  className="text-input"
                  type="number"
                  min={BUSINESS_DAY_BOUNDS.min}
                  max={BUSINESS_DAY_BOUNDS.max}
                  value={draft.categoryBusinessDays[category] ?? 0}
                  onChange={(event) => updateBusinessDay(category, event.target.value)}
                />
              </label>
            ))}
          </div>
        </article>

        <article className="list-card">
          <div className="card-heading">
            <div>
              <h3>Rolling customs forecast</h3>
              <p>Adianta a previsão em N dias úteis quando o navio atraca e a DUIMP está pendente.</p>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={draft.rollingCustoms.enabled}
                onChange={(event) => updateRollingEnabled(event.target.checked)}
              />
              <span>{draft.rollingCustoms.enabled ? 'Ativo' : 'Desativado'}</span>
            </label>
          </div>

          <div className="admin-grid admin-grid--thirds">
            <label className="field">
              <span>Dias úteis após atracar</span>
              <input
                className="text-input"
                type="number"
                min={0}
                max={BUSINESS_DAY_BOUNDS.max}
                value={draft.rollingCustoms.businessDaysAfterBerth}
                onChange={(event) => updateRollingDays(event.target.value)}
                disabled={!draft.rollingCustoms.enabled}
              />
            </label>
            <div className="field">
              <span>Aplicar a</span>
              <div className="chip-list">
                {CATEGORY_OPTIONS.map((category) => {
                  const isActive = draft.rollingCustoms.appliesTo.includes(category)
                  return (
                    <button
                      key={category}
                      type="button"
                      className={`scope-chip scope-chip--button${isActive ? ' scope-chip--active' : ''}`}
                      onClick={() => toggleAppliesTo(category)}
                      disabled={!draft.rollingCustoms.enabled}
                      aria-pressed={isActive}
                    >
                      {category}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="field">
              <span>DUIMP status (match normalizado)</span>
              <div className="chip-list">
                {draft.rollingCustoms.duimpStatuses.map((status) => (
                  <span key={status} className="scope-chip">
                    {status}
                    <button
                      type="button"
                      className="chip-remove"
                      onClick={() => removeDuimpStatus(status)}
                      aria-label={`Remover ${status}`}
                      disabled={!draft.rollingCustoms.enabled}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <div className="chip-add">
                  <input
                    className="text-input"
                    type="text"
                    placeholder="ex.: aguardando registro"
                    value={newDuimpStatus}
                    onChange={(event) => setNewDuimpStatus(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        addDuimpStatus()
                      }
                    }}
                    disabled={!draft.rollingCustoms.enabled}
                  />
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={addDuimpStatus}
                    disabled={!draft.rollingCustoms.enabled || !newDuimpStatus.trim()}
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div className="admin-feature-footer">
        <div className="admin-feature-footer__meta">
          <span className="detail-label">Última atualização</span>
          <p>
            {formatTimestamp(settings?.updatedAt)}
            {summarizeUpdatedBy(settings)}
          </p>
        </div>
        <div className="action-row">
          <Link to="/admin" className="ghost-button">
            Voltar
          </Link>
          <button
            type="button"
            className="ghost-button"
            onClick={handleReset}
            disabled={isResetting || isSaving}
          >
            {isResetting ? 'Restaurando...' : 'Restaurar padrões'}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleSave}
            disabled={hasErrors || isSaving || isResetting}
          >
            {isSaving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>

      <p className="field-hint">
        Quando o documento `forecastSettings/current` ainda não existe no Firestore, o sistema usa o seed
        padrão embutido em <code>DEFAULT_FORECAST_SETTINGS</code> (Navegantes 14h, Itapoá 12h, FCL/CONSOLIDADO
        5, LCL 7, AEREO 10, rolling 3 dias).
      </p>
    </div>
  )
}
