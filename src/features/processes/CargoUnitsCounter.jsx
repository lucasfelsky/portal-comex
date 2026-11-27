import { useState } from 'react'
import { CARGO_UNITS_ROW_MAX } from './cargoConferenceUnits'

// Conferência por item (Fatia B): contador de UNIDADES de um lote (mock v5). "Unidades contadas (todas as embalagens do
// lote)" é o TOTAL do lote digitado, comparado com o Nº de emb. do relatório (= esperado). Editável: "−", campo numérico
// (número em 20 px; `inputMode="numeric"`) e "+ Unidade"; borda âmbar quando divergente (contou e o total difere do
// esperado). Somente leitura: o número na caixa ("—" sem contagem) como o contador de pallets. Abaixo, "Esperadas: N (Nº de
// emb. do relatório)" (sem Nº de emb. inteiro, "—" e nada diverge, D-11) e " · diferença de X" quando divergente.
// Digitar grava na hora (não espera o campo perder o foco, para o Salvar já valer); com o campo em foco o texto é o que a
// pessoa digitou, fora dele o número ganha o separador de milhar.
//   value: int | null (nunca contado) | expected: int | null | onSet(int | null) | onStep(delta: -1 | 1)

const LABEL = 'Unidades contadas (todas as embalagens do lote)'

function formatUnits(value) {
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

function UnitsSummary({ value, expected, divergent }) {
  return (
    <p className="ccf-cnt__sum">
      Esperadas: <b>{expected === null ? '—' : formatUnits(expected)}</b> (Nº de emb. do relatório)
      {divergent ? ` · diferença de ${formatUnits(Math.abs(value - expected))}` : ''}
    </p>
  )
}

export default function CargoUnitsCounter({ value, expected, divergent, editable, itemLabel, title, onSet, onStep }) {
  const [draft, setDraft] = useState(null)
  const shown = draft ?? (value === null ? '' : formatUnits(value))
  const longClass = formatUnits(value ?? 0).length >= 5 ? ' ccf-cnum--long' : ''
  const numberClass = `${divergent ? ' ccf-cnum--div' : value > 0 ? ' ccf-cnum--on' : ''}${longClass}`

  if (!editable) {
    return (
      <div className="ccf-cnt">
        <span className="ccf-label">{LABEL}</span>
        <div className={`ccf-cnum${value > 0 ? ' ccf-cnum--on' : ''}${longClass}`}>
          <b>{value > 0 ? formatUnits(value) : '—'}</b>
          <small>unidades</small>
        </div>
        <UnitsSummary value={value} expected={expected} divergent={divergent} />
      </div>
    )
  }

  function handleChange(event) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 5)
    setDraft(digits)
    onSet(digits === '' ? null : Math.min(CARGO_UNITS_ROW_MAX, Number(digits)))
  }

  return (
    <div className="ccf-cnt">
      <span className="ccf-label">{LABEL}</span>
      <div className="ccf-cnt__row">
        <button
          type="button"
          className="ccf-cbtn"
          aria-label={`Tirar uma unidade da contagem do ${itemLabel}`}
          disabled={!value}
          onClick={() => {
            setDraft(null)
            onStep(-1)
          }}
        >
          −
        </button>
        <div className={`ccf-cnum${numberClass}`}>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={shown}
            placeholder="0"
            aria-label={`Unidades contadas do ${title}`}
            onFocus={() => setDraft(value === null ? '' : String(value))}
            onChange={handleChange}
            onBlur={() => setDraft(null)}
          />
          <small>unidades</small>
        </div>
        <button
          type="button"
          className="ccf-cbtn ccf-cbtn--plus"
          aria-label={`Adicionar uma unidade à contagem do ${itemLabel}`}
          disabled={value !== null && value >= CARGO_UNITS_ROW_MAX}
          onClick={() => {
            setDraft(null)
            onStep(1)
          }}
        >
          + Unidade
        </button>
      </div>
      <UnitsSummary value={value} expected={expected} divergent={divergent} />
    </div>
  )
}
