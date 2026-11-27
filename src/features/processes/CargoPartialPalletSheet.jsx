import { useId, useRef, useState } from 'react'
import Modal from '../../components/Modal'
import { CARGO_UNITS_ROW_MAX } from './cargoConferenceUnits'

// Conferência por item (Fatia B): folha "Pallet parcial" (mock v5, `sheetHtml`). Um pallet parcial tem unidades de mais de
// um lote (ou só parte de um lote: "pallet incompleto"); conta 1 pallet na carga e aparece nos dois lotes.
// Campos: "Este lote" (fixo), "Unidades deste lote no pallet", "Dividido com" (primeira opção "Nenhum (pallet incompleto)",
// as demais são os outros lotes da carga) e, só com outro lote, "Unidades do outro lote no pallet". Até 2 partes.
// Implementação (único ponto que o mock não fixa): o `Modal` do Portal, que já é o padrão de folha do celular: portal em
// `document.body` (nunca `position: fixed` dentro do `.page-fade`), `role="dialog"` com `aria-modal`, foco preso, o foco
// inicial no primeiro campo e devolvido ao botão que abriu, Esc e toque no fundo fecham, fundo da página travado; em até
// 720 px vira folha colada na base (cantos arredondados em cima), acima disso é uma caixa centrada. Sem cabeçalho nem
// alça (`bare`): o título é o do mock. O voltar do aparelho navega (a tela fecha a folha quando o item muda).
//   lotLabel: "<nome SQ> · <lote ou sem lote>" deste lote | options: [{ rowId, label }] os outros lotes
//   onAdd(parts): [{ rowId, units }] (1 ou 2 partes) | onClose()

export const CARGO_PARTIAL_MESSAGES = {
  mine: 'Informe as unidades deste lote no pallet.',
  other: 'Informe as unidades do outro lote no pallet.',
}

function readUnits(text) {
  const digits = String(text ?? '').replace(/\D/g, '')
  return digits === '' ? 0 : Math.min(CARGO_UNITS_ROW_MAX, Number(digits))
}

export default function CargoPartialPalletSheet({ rowId, lotLabel, options, onAdd, onClose }) {
  const baseId = useId()
  const firstField = useRef(null)
  const [unitsMine, setUnitsMine] = useState('')
  const [otherRowId, setOtherRowId] = useState('')
  const [unitsOther, setUnitsOther] = useState('')
  const [error, setError] = useState('')

  function submit() {
    const mine = readUnits(unitsMine)
    if (!(mine >= 1)) {
      setError(CARGO_PARTIAL_MESSAGES.mine)
      return
    }
    const other = readUnits(unitsOther)
    if (otherRowId && !(other >= 1)) {
      setError(CARGO_PARTIAL_MESSAGES.other)
      return
    }
    const parts = [{ rowId, units: mine }]
    if (otherRowId) parts.push({ rowId: otherRowId, units: other })
    onAdd(parts)
  }

  const digitsOnly = (setter) => (event) => {
    setter(event.target.value.replace(/\D/g, '').slice(0, 5))
    setError('')
  }

  return (
    <Modal open onClose={onClose} bare className="ccf-psheet" ariaLabel="Pallet parcial" initialFocusRef={firstField}>
      <h3 className="ccf-psheet__title">Pallet parcial</h3>
      <p className="ccf-sub">
        Use quando um pallet tem unidades de mais de um lote ou item. Ele conta como <b>1 pallet</b> na carga e aparece nos
        dois lotes. Pallets inteiros continuam no contador.
      </p>
      <div className="ccf-field">
        <span className="ccf-label">Este lote</span>
        <div className="ccf-fixed">
          <span>{lotLabel}</span>
        </div>
      </div>
      <div className="ccf-field">
        <label className="ccf-label" htmlFor={`${baseId}-a`}>
          Unidades deste lote no pallet
        </label>
        <input
          ref={firstField}
          id={`${baseId}-a`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Ex.: 30"
          value={unitsMine}
          onChange={digitsOnly(setUnitsMine)}
        />
      </div>
      <div className="ccf-field">
        <label className="ccf-label" htmlFor={`${baseId}-o`}>
          Dividido com
        </label>
        <select
          id={`${baseId}-o`}
          value={otherRowId}
          onChange={(event) => {
            setOtherRowId(event.target.value)
            setError('')
          }}
        >
          <option value="">Nenhum (pallet incompleto)</option>
          {options.map((option) => (
            <option key={option.rowId} value={option.rowId}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {otherRowId ? (
        <div className="ccf-field">
          <label className="ccf-label" htmlFor={`${baseId}-b`}>
            Unidades do outro lote no pallet
          </label>
          <input
            id={`${baseId}-b`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ex.: 20"
            value={unitsOther}
            onChange={digitsOnly(setUnitsOther)}
          />
        </div>
      ) : null}
      <span className="ccf-psheet__err" role="alert">
        {error}
      </span>
      <div className="ccf-sheet__actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="primary-button" onClick={submit}>
          Adicionar pallet parcial
        </button>
      </div>
    </Modal>
  )
}
