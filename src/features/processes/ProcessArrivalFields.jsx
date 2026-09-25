import SelectField from '../../components/SelectField'
import {
  FREE_TIME_CATEGORIES,
  CE_HOUSE_CATEGORIES,
  hasArrivalSignal,
  isApproxDate,
  isLegacyArrivalWithoutDate,
  isLegacyCargoPresenceWithoutDate,
} from './arrivalCustoms'
import { isDtaLoadingScheduledStatus, isDtaTransitCompletedStatus } from './processStatus'
import { isMaritimeCategory, isAirCategory } from './processCategories'
import { getFieldA11yProps, getFieldErrorId } from '../../utils/fieldErrors'

// F17.3a (D-11): card "Chegada" - atracacao (maritimo) ou chegada (aereo)
// com DATA, CE/terminal/free time e presenca de carga com data. Substitui os
// checkboxes "Atracou?"/"Chegou?" do antigo passo "Fluxo operacional"
// (D-10). Imports permitidos (D-11): `react` (implicito via JSX), SelectField,
// `./arrivalCustoms`, `./processStatus` (so' os 2 helpers de DTA), `./processCategories`.
// Classes existentes apenas - nenhum CSS novo.
export default function ProcessArrivalFields({ draft, onDraftChange, dtaStatusOptions, errors = {} }) {
  const isMaritime = isMaritimeCategory(draft.category)
  const isAir = isAirCategory(draft.category)

  if (!isMaritime && !isAir) return null

  const hasArrival = hasArrivalSignal(draft)
  const arrivalField = isMaritime ? 'berthedAt' : 'arrivedAt'
  const arrivalValue = isMaritime ? draft.berthedAt : draft.arrivedAt
  const isApprox = isApproxDate(draft, arrivalField)
  const isLegacyWithoutDate = isLegacyArrivalWithoutDate(draft)
  const isLegacyPresenceWithoutDate = isLegacyCargoPresenceWithoutDate(draft)
  const showFreeTime = FREE_TIME_CATEGORIES.includes(draft.category)
  const showCeHouse = CE_HOUSE_CATEGORIES.includes(draft.category)

  const isDtaLoadingScheduled = (status) => isDtaLoadingScheduledStatus(status)
  const isDtaTransitCompleted = (status) => isDtaTransitCompletedStatus(status)

  return (
    <div className="detail-card">
      <span className="detail-label">Chegada</span>

      <label className="field">
        <span>{isMaritime ? 'Atracação (data e hora)' : 'Chegada (data e hora)'}</span>
        <input
          className="text-input"
          type="datetime-local"
          value={arrivalValue ?? ''}
          onChange={(event) => onDraftChange(arrivalField, event.target.value)}
          {...getFieldA11yProps(`process-field-${arrivalField}`, errors[arrivalField])}
        />
        {errors[arrivalField] ? (
          <small className="field-error" id={getFieldErrorId(`process-field-${arrivalField}`)} aria-hidden="true">
            {errors[arrivalField]}
          </small>
        ) : null}
        {isApprox ? (
          <small className="field-hint">
            Data aproximada (migrada do ETA) — confirme a data real.
          </small>
        ) : null}
        {!isApprox && isLegacyWithoutDate ? (
          <small className="field-hint">
            {isMaritime
              ? 'Atracação marcada sem data (registro antigo) — informe a data e hora.'
              : 'Chegada marcada sem data (registro antigo) — informe a data e hora.'}
          </small>
        ) : null}
      </label>

      {isMaritime ? (
        <div className="detail-card detail-card--split">
          <label className="field">
            <span>CE Mercante</span>
            <input
              className="text-input"
              type="text"
              value={draft.ceMercante ?? ''}
              onChange={(event) => onDraftChange('ceMercante', event.target.value)}
            />
          </label>
          {showCeHouse ? (
            <label className="field">
              <span>CE house</span>
              <input
                className="text-input"
                type="text"
                value={draft.ceHouse ?? ''}
                onChange={(event) => onDraftChange('ceHouse', event.target.value)}
              />
            </label>
          ) : null}
          <label className="field">
            <span>Terminal / armazém</span>
            <input
              className="text-input"
              type="text"
              value={draft.terminalName ?? ''}
              onChange={(event) => onDraftChange('terminalName', event.target.value)}
            />
          </label>
        </div>
      ) : (
        <label className="field">
          <span>Terminal / armazém (opcional)</span>
          <input
            className="text-input"
            type="text"
            value={draft.terminalName ?? ''}
            onChange={(event) => onDraftChange('terminalName', event.target.value)}
          />
        </label>
      )}

      {showFreeTime ? (
        <div className="detail-card detail-card--split">
          <label className="field">
            <span>Free time (dias)</span>
            <input
              className="text-input"
              type="number"
              min="0"
              step="1"
              value={draft.freeTimeDays ?? ''}
              onChange={(event) => onDraftChange('freeTimeDays', event.target.value)}
              {...getFieldA11yProps('process-field-freeTimeDays', errors.freeTimeDays)}
            />
            {errors.freeTimeDays ? (
              <small className="field-error" id={getFieldErrorId('process-field-freeTimeDays')} aria-hidden="true">
                {errors.freeTimeDays}
              </small>
            ) : null}
          </label>
          <label className="field">
            <span>Diária de demurrage (USD, opcional)</span>
            <input
              className="text-input"
              type="number"
              min="0"
              step="0.01"
              value={draft.demurrageDailyRateUsd ?? ''}
              onChange={(event) => onDraftChange('demurrageDailyRateUsd', event.target.value)}
              {...getFieldA11yProps('process-field-demurrageDailyRateUsd', errors.demurrageDailyRateUsd)}
            />
            {errors.demurrageDailyRateUsd ? (
              <small
                className="field-error"
                id={getFieldErrorId('process-field-demurrageDailyRateUsd')}
                aria-hidden="true"
              >
                {errors.demurrageDailyRateUsd}
              </small>
            ) : null}
          </label>
        </div>
      ) : null}

      {isAir && hasArrival ? (
        <>
          <label className="field">
            <span>DTA</span>
            <SelectField
              className="text-input"
              value={draft.dtaStatus}
              onChange={(event) => onDraftChange('dtaStatus', event.target.value)}
            >
              <option value="">Selecione o status</option>
              {dtaStatusOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </SelectField>
          </label>
          {isDtaLoadingScheduled(draft.dtaStatus) ? (
            <div className="detail-card detail-card--split">
              <label className="field">
                <span>Previsão do carregamento da DTA</span>
                <input
                  className="text-input"
                  type="datetime-local"
                  value={draft.dtaLoadingScheduledAt}
                  onChange={(event) => onDraftChange('dtaLoadingScheduledAt', event.target.value)}
                  {...getFieldA11yProps('process-field-dtaLoadingScheduledAt', errors.dtaLoadingScheduledAt)}
                />
                {errors.dtaLoadingScheduledAt ? (
                  <small
                    className="field-error"
                    id={getFieldErrorId('process-field-dtaLoadingScheduledAt')}
                    aria-hidden="true"
                  >
                    {errors.dtaLoadingScheduledAt}
                  </small>
                ) : null}
              </label>
              <label className="field">
                <span>Previsão de chegada em Itajaí</span>
                <input
                  className="text-input"
                  type="datetime-local"
                  value={draft.dtaArrivalAtItajai}
                  onChange={(event) => onDraftChange('dtaArrivalAtItajai', event.target.value)}
                  {...getFieldA11yProps('process-field-dtaArrivalAtItajai', errors.dtaArrivalAtItajai)}
                />
                {errors.dtaArrivalAtItajai ? (
                  <small
                    className="field-error"
                    id={getFieldErrorId('process-field-dtaArrivalAtItajai')}
                    aria-hidden="true"
                  >
                    {errors.dtaArrivalAtItajai}
                  </small>
                ) : null}
              </label>
            </div>
          ) : null}
        </>
      ) : null}

      {hasArrival && (isMaritime || isDtaTransitCompleted(draft.dtaStatus)) ? (
        <label className="field">
          <span>Presença de carga (data e hora)</span>
          <input
            className="text-input"
            type="datetime-local"
            value={draft.cargoPresenceInformedAt ?? ''}
            onChange={(event) => onDraftChange('cargoPresenceInformedAt', event.target.value)}
            {...getFieldA11yProps('process-field-cargoPresenceInformedAt', errors.cargoPresenceInformedAt)}
          />
          {errors.cargoPresenceInformedAt ? (
            <small
              className="field-error"
              id={getFieldErrorId('process-field-cargoPresenceInformedAt')}
              aria-hidden="true"
            >
              {errors.cargoPresenceInformedAt}
            </small>
          ) : null}
          {showFreeTime ? (
            <small className="field-hint">
              O prazo do free time conta a partir desta data.
            </small>
          ) : null}
          {isLegacyPresenceWithoutDate ? (
            <small className="field-hint">
              Presença informada sem data (registro antigo) — informe a data e hora.
            </small>
          ) : null}
        </label>
      ) : null}
    </div>
  )
}
