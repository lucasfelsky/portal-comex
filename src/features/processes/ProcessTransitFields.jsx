// F17.2a (D-11): embarque e transito (BL/AWB, navio/viagem/voo, transbordo).
// F17.2d-1 (D-1, Q5): "Data de embarque" saiu daqui - virou o checkbox
// "Embarque confirmado" no passo "Datas e previsão" (`shipmentConfirmation.js`,
// deriva de `shippedAt`). Regra de import: nenhum modulo mockado por
// tests/ui/ProcessesPage.test.jsx - este arquivo nao precisa de nenhum.
export default function ProcessTransitFields({ draft, onDraftChange }) {
  const isMaritime =
    draft.category === 'FCL' || draft.category === 'LCL' || draft.category === 'CONSOLIDADO'
  const isAereo = draft.category === 'AEREO'

  return (
    <>
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
          <div className="detail-card detail-card--split">
            <label className="field">
              <span>Porto/aeroporto de transbordo</span>
              <input
                className="text-input"
                type="text"
                value={draft.transshipmentPort}
                onChange={(event) => onDraftChange('transshipmentPort', event.target.value)}
              />
            </label>
            <label className="field">
              <span>ETD do transbordo</span>
              <input
                className="text-input"
                type="date"
                value={draft.transshipmentEtd}
                onChange={(event) => onDraftChange('transshipmentEtd', event.target.value)}
              />
            </label>
          </div>
        ) : null}
      </div>
    </>
  )
}
