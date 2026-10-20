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
import ErpFormFieldHint from './ErpFormFieldHint'
import PendingFieldHint from './PendingFieldHint'
import { useProcessFormContext, usePendingAttrs } from './processFormContext'

// `erpHints` (opcional, so' admin em edicao): avisos "ERP" do formulario
// (`buildErpFormHints`). Sem ele o DOM e' o de sempre.
export default function ProcessTransitFields({ draft, onDraftChange, errors = {}, erpHints = null }) {
  const erpActive = Boolean(erpHints)
  const pending = usePendingAttrs()
  // Refino F4d: no modal (desktop) o transbordo e' uma linha com switch (ProcessoForm.dc.html).
  const { desktop } = useProcessFormContext()
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
              <ErpFormFieldHint active={erpActive} hint={erpHints?.fields?.vessel} onDraftChange={onDraftChange}>
                <label className="field" {...pending('vesselName')}>
                  <span>Navio</span>
                  <input
                    className="text-input"
                    type="text"
                    value={draft.vesselName}
                    onChange={(event) => onDraftChange('vesselName', event.target.value)}
                  />
                  <PendingFieldHint field="vesselName" />
                </label>
              </ErpFormFieldHint>
              <label className="field" {...pending('voyage')}>
                <span>Viagem</span>
                <input
                  className="text-input text-input--mono"
                  type="text"
                  value={draft.voyage}
                  onChange={(event) => onDraftChange('voyage', event.target.value)}
                />
                <PendingFieldHint field="voyage" />
              </label>
              <label className="field">
                <span>IMO do navio</span>
                <input
                  className="text-input text-input--mono"
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
            <ErpFormFieldHint active={erpActive} hint={erpHints?.fields?.bl} onDraftChange={onDraftChange}>
              <label className="field" {...pending('houseBl')}>
                <span>House BL</span>
                <input
                  className="text-input text-input--mono"
                  type="text"
                  value={getHouseBlInputValue(draft)}
                  onChange={(event) => onDraftChange('houseBl', event.target.value)}
                />
                <PendingFieldHint field="houseBl" />
              </label>
            </ErpFormFieldHint>
          ) : null}

          {isAereo ? (
            <>
              <label className="field" {...pending('flightNumber')}>
                <span>Voo</span>
                <input
                  className="text-input text-input--mono"
                  type="text"
                  value={draft.flightNumber}
                  onChange={(event) => onDraftChange('flightNumber', event.target.value)}
                />
                <PendingFieldHint field="flightNumber" />
              </label>
              <ErpFormFieldHint active={erpActive} hint={erpHints?.fields?.bl} onDraftChange={onDraftChange}>
                <label className="field" {...pending('mawb')}>
                  <span>Master Air Waybill (MAWB)</span>
                  <input
                    className="text-input text-input--mono"
                    type="text"
                    value={draft.mawb}
                    onChange={(event) => onDraftChange('mawb', event.target.value)}
                  />
                  <PendingFieldHint field="mawb" />
                </label>
              </ErpFormFieldHint>
              <label className="field">
                <span>House Air Waybill (HAWB)</span>
                <input
                  className="text-input text-input--mono"
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
        {desktop ? (
          <div className="process-form-switch-row">
            <div className="process-form-switch-row__text">
              <span className="process-form-switch-row__title">Transbordo</span>
              <span className="process-form-switch-row__hint">Ative se a carga troca de navio no caminho.</span>
            </div>
            <label className="process-form-switch">
              <input
                type="checkbox"
                role="switch"
                className="process-form-switch__input"
                aria-label="Transbordo"
                checked={Boolean(draft.transshipment)}
                onChange={(event) => onDraftChange('transshipment', event.target.checked)}
              />
              <span className="process-form-switch__track" aria-hidden="true">
                <span className="process-form-switch__knob" />
              </span>
            </label>
          </div>
        ) : (
          <>
            <h4 className="form-group__title">Transbordo</h4>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={Boolean(draft.transshipment)}
                onChange={(event) => onDraftChange('transshipment', event.target.checked)}
              />
              <span>Esta carga tem transbordo?</span>
            </label>
          </>
        )}
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
