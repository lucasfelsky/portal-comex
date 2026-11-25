import { CARGO_PALLETS_ROW_MAX, cargoRowPallets } from './cargoConferenceIssues'

// S10-I do Relatório de Carga: contador de pallets de UM item (substitui o botão "Contagem"). `large` = celular
// (botões de 56 px, número grande); `compact` = célula CONTAGEM do computador (alvos de 44 px por pseudo-elemento).
// `onStep(delta)`: -1 ou +1 (o chamador soma sobre o estado mais recente, então toques seguidos não se perdem).
// Somente leitura (`editable` falso): só o número ("—" sem contagem; "OK" no relatório antigo, sem número).

const LEGACY_TITLE = 'Contagem OK (registro antigo)'

function describeCount(count, legacyOk, itemLabel) {
  if (count === null && legacyOk) return `${LEGACY_TITLE} no ${itemLabel}`
  const value = count ?? 0
  return `${value} ${value === 1 ? 'pallet contado' : 'pallets contados'} no ${itemLabel}`
}

export default function CargoPalletCounter({ count, legacyOk = false, editable, variant = 'large', itemLabel, onStep }) {
  const value = count ?? 0
  const isLarge = variant === 'large'
  const prefix = isLarge ? 'ccf-pal' : 'crf-pal'
  const isLegacy = count === null && legacyOk

  if (!editable) {
    return (
      <span className={`${prefix} ${prefix}--ro`} title={isLegacy ? LEGACY_TITLE : undefined}>
        {isLegacy ? 'OK' : (count ?? '—')}
      </span>
    )
  }
  // Editando, o contador nunca contado mostra 0 (o selo "Sem contagem" do item diz que ninguém contou).
  const text = isLegacy ? 'OK' : String(value)

  const minus = (
    <button
      type="button"
      className={`${prefix}__btn`}
      aria-label={`Tirar um pallet da contagem do ${itemLabel}`}
      disabled={value <= 0}
      onClick={() => onStep(-1)}
    >
      −
    </button>
  )
  const plus = (
    <button
      type="button"
      className={`${prefix}__btn ${prefix}__btn--plus`}
      aria-label={`Adicionar um pallet à contagem do ${itemLabel}`}
      disabled={value >= CARGO_PALLETS_ROW_MAX}
      onClick={() => onStep(1)}
    >
      {isLarge ? '+ Pallet' : '+'}
    </button>
  )
  const number = (
    <span className={`${prefix}__num${value > 0 || legacyOk ? ` ${prefix}__num--on` : ''}`} role="status" aria-live="polite">
      <b aria-hidden="true">{text}</b>
      {isLarge ? <small aria-hidden="true">{isLegacy ? 'registro antigo' : 'pallets'}</small> : null}
      <span className={`${prefix}__sr`}>{describeCount(count, legacyOk, itemLabel)}</span>
    </span>
  )

  if (!isLarge) {
    return (
      <span className="crf-pal" role="group" aria-label={`Pallets do ${itemLabel}`}>
        {minus}
        {number}
        {plus}
      </span>
    )
  }
  return (
    <div className="ccf-pal">
      <span className="ccf-label">Pallets contados</span>
      <div className="ccf-pal__row">
        {minus}
        {number}
        {plus}
      </div>
    </div>
  )
}

// Contador de uma linha lendo os mapas da conferência (`palletsByRowId`, e o legado `countOkByRowId`).
// `onStep(rowId, delta)`; variante compacta (computador).
export function CargoRowPalletCounter({ rowId, pallets, legacy, number, editable, onStep }) {
  const { count, legacyOk } = cargoRowPallets({ palletsByRowId: pallets, countOkByRowId: legacy }, rowId)
  return (
    <CargoPalletCounter
      count={count}
      legacyOk={legacyOk}
      editable={editable}
      variant="compact"
      itemLabel={`item ${number}`}
      onStep={(delta) => onStep(rowId, delta)}
    />
  )
}
