import { useId, useMemo, useRef, useState } from 'react'
import Modal from '../../components/Modal'
import { CARGO_REPORT_LIMITS, CARGO_REPORT_MAX_ROWS, formatCargoNumber, parseCargoNumber } from './cargoReportFormModel'
import { CARGO_SPLIT_SUM_TOLERANCE_KG, readCargoRowQuantity, suggestCargoSplit } from './cargoReportRowOps'

// S9-B do Relatório de Carga: "Dividir em lotes". A linha vira 2 a 10 linhas no mesmo lugar (mesma descrição,
// mesmo PO), cada uma com o seu lote e a sua quantidade. "Dividir" só habilita quando a soma fecha com a
// quantidade da linha (tolerância de 0,0005 kg).

const LOT_COUNT_OPTIONS = [2, 3, 4, 5, 6, 8, 10]
const DEFAULT_LOT_COUNT = 3

const kg = (value) => formatCargoNumber(value, { maxDecimals: 3 }) || '0'

function buildLots(total, count) {
  return suggestCargoSplit(total, count).map((lot) => ({ supplierLot: '', quantity: kg(lot.quantityKg) }))
}

function quantityValue(text) {
  const value = parseCargoNumber(text)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

// `rowCount`: linhas do relatório agora; só ficam disponíveis as quantidades de lotes que cabem no teto de 200.
export default function CargoReportSplitDialog({ row, rowCount, mobile = false, onApply, onCancel }) {
  const total = readCargoRowQuantity(row) ?? 0
  const counts = useMemo(
    () => LOT_COUNT_OPTIONS.filter((count) => rowCount - 1 + count <= CARGO_REPORT_MAX_ROWS),
    [rowCount]
  )
  const initialCount = counts.includes(DEFAULT_LOT_COUNT) ? DEFAULT_LOT_COUNT : (counts[0] ?? 2)
  const [count, setCount] = useState(initialCount)
  const [lots, setLots] = useState(() => buildLots(total, initialCount))
  const firstLotRef = useRef(null)
  const selectId = useId()

  const quantities = lots.map((lot) => quantityValue(lot.quantity))
  const allValid = quantities.every((value) => value !== null && value > 0)
  const sum = quantities.reduce((acc, value) => acc + (value ?? 0), 0)
  const diff = Math.abs(total - sum)
  const isOk = allValid && diff < CARGO_SPLIT_SUM_TOLERANCE_KG
  const description = [row.sqDescription || row.dbcorpCode, row.po].filter(Boolean).join(' · ')

  function changeCount(next) {
    setCount(next)
    setLots(buildLots(total, next))
  }

  function patchLot(index, patch) {
    setLots((current) => current.map((lot, position) => (position === index ? { ...lot, ...patch } : lot)))
  }

  return (
    <Modal open onClose={onCancel} title="Dividir em lotes" className={`crf-split${mobile ? ' crf-split--mobile' : ''}`} initialFocusRef={firstLotRef}>
      <div className="crf-dlg">
        <p className="crf-split__sub">
          {description ? `${description} · ` : ''}total <b>{kg(total)} kg</b>. As linhas novas ficam no lugar desta,
          com a mesma descrição e o mesmo PO.
        </p>

        <div className="crf-field">
          <label htmlFor={selectId}>Quantos lotes?</label>
          <select id={selectId} value={count} onChange={(event) => changeCount(Number(event.target.value))}>
            {counts.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="crf-split__lots">
          <div className="crf-split-row crf-split-row--head" aria-hidden="true">
            <span />
            <span>Lote do fornecedor</span>
            <span>Quantidade (kg)</span>
          </div>
          {lots.map((lot, index) => (
            <div key={index} className="crf-split-row">
              <span className="crf-split-row__n">{index + 1}</span>
              <input
                type="text"
                ref={index === 0 ? firstLotRef : undefined}
                value={lot.supplierLot}
                maxLength={CARGO_REPORT_LIMITS.text}
                placeholder="Opcional agora"
                aria-label={`Lote ${index + 1}`}
                onChange={(event) => patchLot(index, { supplierLot: event.target.value })}
              />
              <input
                type="text"
                value={lot.quantity}
                inputMode="decimal"
                aria-label={`Quantidade do lote ${index + 1}`}
                onChange={(event) => patchLot(index, { quantity: event.target.value })}
              />
            </div>
          ))}
        </div>

        <div className={`crf-note ${isOk ? 'crf-note--ok' : 'crf-note--warn'}`} role="status" aria-live="polite">
          Soma dos lotes: <b>{kg(sum)} kg</b> de <b>{kg(total)} kg</b>
          {isOk ? '. Fecha certinho.' : diff < CARGO_SPLIT_SUM_TOLERANCE_KG ? '. Informe a quantidade de cada lote.' : `. Falta ou sobra ${kg(diff)} kg.`}
        </div>

        <div className="crf-dlg__actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!isOk}
            onClick={() =>
              onApply(lots.map((lot, index) => ({ supplierLot: lot.supplierLot, quantityKg: quantities[index] })))
            }
          >
            Dividir
          </button>
        </div>
      </div>
    </Modal>
  )
}
