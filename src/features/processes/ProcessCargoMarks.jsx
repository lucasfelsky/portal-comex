// Marcas de carga do remake mobile: chama (inflamavel), losango (perigosa) e
// caixa + numero (volume). Substituem os selos de texto equivalentes nos cards
// compactos; cada marca e' uma imagem com nome acessivel (aria-label + title).
// A logica vem de `getCargoMarks` (mesmas regras dos selos de texto). `onHero`
// pinta as marcas para fundo navy. So' aparece no mobile: `.m-marks` e'
// `display: none` fora da camada S.
import Icon from '../../components/Icon'
import { getCargoMarks } from './operationalOptions'

export default function ProcessCargoMarks({ process, onHero = false }) {
  const { flammable, dangerous, volume } = getCargoMarks(process)
  if (!flammable && !dangerous && !volume) return null

  return (
    <span className={`m-marks${onHero ? ' m-marks--hero' : ''}`}>
      {flammable ? (
        <span className="m-mark m-mark--fire" role="img" aria-label="Carga inflamável" title="Carga inflamável">
          <Icon name="flame" size={14} strokeWidth={2} />
        </span>
      ) : null}
      {dangerous ? (
        <span className="m-mark m-mark--haz" role="img" aria-label="Carga perigosa" title="Carga perigosa">
          <Icon name="hazard" size={14} strokeWidth={2} />
        </span>
      ) : null}
      {volume ? (
        <span className="m-mark" role="img" aria-label={volume.label} title={volume.label}>
          <Icon name="box" size={14} strokeWidth={2} />
          <b>{volume.count}</b>
        </span>
      ) : null}
    </span>
  )
}
