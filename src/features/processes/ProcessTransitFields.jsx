// F17.2a (D-11): embarque e transito (BL/AWB, navio/viagem/voo, transbordo).
// F17.2d-1 (D-1, Q5): "Data de embarque" saiu daqui - virou o checkbox
// "Embarque confirmado" no passo "Embarque" (`shipmentConfirmation.js`,
// deriva de `shippedAt`). Regra de import: nenhum modulo mockado por
// tests/ui/ProcessesPage.test.jsx - este arquivo so' ganha `../../utils/fieldErrors`
// (UX-3b) e `./houseBl.js` (D-F3-1, puro e sem import), ambos nao mockados.
// UX-6b-1: grupos "Navio e documentos" (recebe o Agente de carga, movido de
// ProcessForm.jsx) e "Transbordo", em `.form-group`/`.form-grid`.
// D-F3-1: nos maritimos o BL e' um campo so' ("House BL"); AEREO tem MAWB/HAWB.
import { getFieldA11yProps, getFieldErrorId } from '../../utils/fieldErrors'
import { getHouseBlInputValue } from './houseBl.js'

export default function ProcessTransitFields({ draft, onDraftChange, errors = {} }) {
  const isMaritime =
    draft.category === 'FCL' || draft.category === 'LCL' || draft.category === 'CONSOLIDADO'
  const isAereo = draft.category === 'AEREO'

  return (
    <>
      <div className="form-group">
        <h4 className="form-group__title">Navio e documentos</h4>
        <div className="form-grid">
          {isMaritime ? (
            <>
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
              <label className="field">
                <span>IMO do navio</span>
                <input
                  className="text-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={draft.vesselImo ?? ''}
                  onChange={(event) => onDraftChange('vesselImo', event.target.value)}
                  {...getFieldA11yProps('process-field-vesselImo', errors.vesselImo, [
                    'process-field-vesselImo-hint',
                  ])}
                />
                <small className="field-hint" id="process-field-vesselImo-hint">
                  7 dígitos. Deixa o rastreamento exato — sem ele, o botão busca pelo nome.
                </small>
                {errors.vesselImo ? (
                  <small
                    className="field-error"
                    id={getFieldErrorId('process-field-vesselImo')}
                    aria-hidden="true"
                  >
                    {errors.vesselImo}
                  </small>
                ) : null}
              </label>
            </>
          ) : null}

          {isMaritime ? (
            <label className="field">
              <span>House BL</span>
              <input
                className="text-input"
                type="text"
                value={getHouseBlInputValue(draft)}
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

          <label className="field">
            <span>Agente de carga</span>
            <input
              className="text-input"
              type="text"
              value={draft.forwarderName}
              onChange={(event) => onDraftChange('forwarderName', event.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="form-group">
        <h4 className="form-group__title">Transbordo</h4>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={Boolean(draft.transshipment)}
            onChange={(event) => onDraftChange('transshipment', event.target.checked)}
          />
          <span>Esta carga tem transbordo?</span>
        </label>
        {draft.transshipment ? (
          <div className="form-grid">
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
                {...getFieldA11yProps('process-field-transshipmentEtd', errors.transshipmentEtd)}
              />
              {errors.transshipmentEtd ? (
                <small
                  className="field-error"
                  id={getFieldErrorId('process-field-transshipmentEtd')}
                  aria-hidden="true"
                >
                  {errors.transshipmentEtd}
                </small>
              ) : null}
            </label>
          </div>
        ) : null}
      </div>
    </>
  )
}
