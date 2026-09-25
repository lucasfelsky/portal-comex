import ContainersEditor from './ContainersEditor'
import { getImoClassLabel, isLegacyProcessDangerousGoods } from './operationalOptions'
import { getFieldA11yProps, getFieldErrorId } from '../../utils/fieldErrors'

// F17.2a (D-11): carga por modal (containers/pesos) + carga perigosa.
// F17.2d-1 (D-4/D-5/D-7, Q2/Q4): cubagem opcional em FCL/CONSOLIDADO; carga
// perigosa passou a ser classificada POR ITEM (`ProcessItemDangerousGoodsFields`,
// no passo Itens) - aqui so' resta o aviso de legado de nivel-processo (com
// "Descartar classificação do processo"). Regra de import (D-11): so'
// `./containers` (via ContainersEditor), `./operationalOptions` - categoria
// comparada por string literal (sem importar `processCategories.js`).
export default function ProcessCargoFields({ draft, onDraftChange, disabled = false, errors = {} }) {
  const isFclOrConsolidado = draft.category === 'FCL' || draft.category === 'CONSOLIDADO'
  const isLcl = draft.category === 'LCL'
  const isAereo = draft.category === 'AEREO'

  return (
    <>
      {isFclOrConsolidado ? (
        <ContainersEditor
          value={draft.containers}
          onChange={(value) => onDraftChange('containers', value)}
          disabled={disabled}
          collectionWindows={draft.collectionWindows}
          errors={errors}
        />
      ) : null}

      {isFclOrConsolidado ? (
        <label className="field">
          <span>Cubagem (m³)</span>
          <input
            className="text-input"
            type="number"
            min="0"
            step="0.01"
            value={draft.volumeM3}
            onChange={(event) => onDraftChange('volumeM3', event.target.value)}
            {...getFieldA11yProps('process-field-volumeM3', errors.volumeM3)}
          />
          {errors.volumeM3 ? (
            <small className="field-error" id={getFieldErrorId('process-field-volumeM3')} aria-hidden="true">
              {errors.volumeM3}
            </small>
          ) : null}
        </label>
      ) : null}

      {isLcl ? (
        <div className="detail-card detail-card--split">
          <label className="field">
            <span>Peso bruto (kg)</span>
            <input
              className="text-input"
              type="number"
              min="0"
              step="0.01"
              value={draft.grossWeightKg}
              onChange={(event) => onDraftChange('grossWeightKg', event.target.value)}
              {...getFieldA11yProps('process-field-grossWeightKg', errors.grossWeightKg)}
            />
            {errors.grossWeightKg ? (
              <small
                className="field-error"
                id={getFieldErrorId('process-field-grossWeightKg')}
                aria-hidden="true"
              >
                {errors.grossWeightKg}
              </small>
            ) : null}
          </label>
          <label className="field">
            <span>Cubagem (m³)</span>
            <input
              className="text-input"
              type="number"
              min="0"
              step="0.01"
              value={draft.volumeM3}
              onChange={(event) => onDraftChange('volumeM3', event.target.value)}
              {...getFieldA11yProps('process-field-volumeM3', errors.volumeM3)}
            />
            {errors.volumeM3 ? (
              <small className="field-error" id={getFieldErrorId('process-field-volumeM3')} aria-hidden="true">
                {errors.volumeM3}
              </small>
            ) : null}
          </label>
        </div>
      ) : null}

      {isAereo ? (
        <div className="detail-card detail-card--split">
          <label className="field">
            <span>Peso bruto (kg)</span>
            <input
              className="text-input"
              type="number"
              min="0"
              step="0.01"
              value={draft.grossWeightKg}
              onChange={(event) => onDraftChange('grossWeightKg', event.target.value)}
              {...getFieldA11yProps('process-field-grossWeightKg', errors.grossWeightKg)}
            />
            {errors.grossWeightKg ? (
              <small
                className="field-error"
                id={getFieldErrorId('process-field-grossWeightKg')}
                aria-hidden="true"
              >
                {errors.grossWeightKg}
              </small>
            ) : null}
          </label>
          <label className="field">
            <span>Peso taxado (kg)</span>
            <input
              className="text-input"
              type="number"
              min="0"
              step="0.01"
              value={draft.chargeableWeightKg}
              onChange={(event) => onDraftChange('chargeableWeightKg', event.target.value)}
              {...getFieldA11yProps('process-field-chargeableWeightKg', errors.chargeableWeightKg)}
            />
            {errors.chargeableWeightKg ? (
              <small
                className="field-error"
                id={getFieldErrorId('process-field-chargeableWeightKg')}
                aria-hidden="true"
              >
                {errors.chargeableWeightKg}
              </small>
            ) : null}
          </label>
          <label className="field">
            <span>Volumes</span>
            <input
              className="text-input"
              type="number"
              min="0"
              step="1"
              value={draft.packagesQuantity}
              onChange={(event) => onDraftChange('packagesQuantity', event.target.value)}
              {...getFieldA11yProps('process-field-packagesQuantity', errors.packagesQuantity)}
            />
            {errors.packagesQuantity ? (
              <small
                className="field-error"
                id={getFieldErrorId('process-field-packagesQuantity')}
                aria-hidden="true"
              >
                {errors.packagesQuantity}
              </small>
            ) : null}
          </label>
        </div>
      ) : null}

      {isLegacyProcessDangerousGoods(draft) ? (
        <div className="detail-card">
          <span className="detail-label">Carga perigosa (cadastro antigo)</span>
          <p>
            {[
              draft.unNumber ? `ONU ${draft.unNumber}` : null,
              draft.imoClass ? `Classe ${getImoClassLabel(draft.imoClass)}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Sem número ONU/classe registrados.'}
          </p>
          <small className="field-hint">
            Classifique a carga perigosa em cada item no passo Itens.
          </small>
          <div className="action-row">
            <button
              type="button"
              className="ghost-button"
              onClick={() => onDraftChange('dangerousGoods', false)}
            >
              Descartar classificação do processo
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
