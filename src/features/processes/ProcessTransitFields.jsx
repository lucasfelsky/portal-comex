// F17.2a (D-11): embarque e transito (shippedAt, BL/AWB, navio/viagem/voo,
// transbordo). Regra de import (D-11): nenhum modulo mockado por
// tests/ui/ProcessesPage.test.jsx - este arquivo nao precisa de nenhum.

// D-3: aviso inline (nao bloqueia) se shippedAt > hoje local. Mesmo padrao
// de `getLocalDateKey` (deriveProcessStatus.js:88-93) - PROIBIDO
// `toISOString()` aqui (bug de fuso, ver suite-standards).
function getLocalDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isFutureLocalDate(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return false
  return trimmed > getLocalDateKey(new Date())
}

export default function ProcessTransitFields({ draft, onDraftChange }) {
  const isMaritime =
    draft.category === 'FCL' || draft.category === 'LCL' || draft.category === 'CONSOLIDADO'
  const isAereo = draft.category === 'AEREO'

  return (
    <>
      <label className="field">
        <span>Data de embarque</span>
        <input
          className="text-input"
          type="date"
          value={draft.shippedAt}
          onChange={(event) => onDraftChange('shippedAt', event.target.value)}
        />
        {isFutureLocalDate(draft.shippedAt) ? (
          <small className="field-hint">
            <span className="inline-badge inline-badge--warn">Data de embarque é no futuro.</span>
          </small>
        ) : null}
      </label>

      {isMaritime ? (
        <div className="detail-card detail-card--split">
          <label className="field">
            <span>Navio</span>
            <input
              className="text-input"
              type="text"
              value={draft.vesselName}
              onChange={(event) => onDraftChange('vesselName', event.target.value)}
            />
          </label>
          <label className="field">
            <span>Viagem</span>
            <input
              className="text-input"
              type="text"
              value={draft.voyage}
              onChange={(event) => onDraftChange('voyage', event.target.value)}
            />
          </label>
        </div>
      ) : null}

      {draft.category === 'FCL' ? (
        <label className="field">
          <span>Master BL (MBL)</span>
          <input
            className="text-input"
            type="text"
            value={draft.masterBl}
            onChange={(event) => onDraftChange('masterBl', event.target.value)}
          />
        </label>
      ) : null}

      {draft.category === 'LCL' || draft.category === 'CONSOLIDADO' ? (
        <label className="field">
          <span>House BL (HBL)</span>
          <input
            className="text-input"
            type="text"
            value={draft.houseBl}
            onChange={(event) => onDraftChange('houseBl', event.target.value)}
          />
        </label>
      ) : null}

      {isAereo ? (
        <>
          <label className="field">
            <span>Voo</span>
            <input
              className="text-input"
              type="text"
              value={draft.flightNumber}
              onChange={(event) => onDraftChange('flightNumber', event.target.value)}
            />
          </label>
          <label className="field">
            <span>Master Air Waybill (MAWB)</span>
            <input
              className="text-input"
              type="text"
              value={draft.mawb}
              onChange={(event) => onDraftChange('mawb', event.target.value)}
            />
          </label>
          <label className="field">
            <span>House Air Waybill (HAWB)</span>
            <input
              className="text-input"
              type="text"
              value={draft.hawb}
              onChange={(event) => onDraftChange('hawb', event.target.value)}
            />
          </label>
        </>
      ) : null}

      <div className="detail-card">
        <span className="detail-label">Transbordo</span>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={Boolean(draft.transshipment)}
            onChange={(event) => onDraftChange('transshipment', event.target.checked)}
          />
          <span>Esta carga tem transbordo?</span>
        </label>
        {draft.transshipment ? (
          <label className="field">
            <span>Porto/aeroporto de transbordo</span>
            <input
              className="text-input"
              type="text"
              value={draft.transshipmentPort}
              onChange={(event) => onDraftChange('transshipmentPort', event.target.value)}
            />
          </label>
        ) : null}
      </div>
    </>
  )
}
