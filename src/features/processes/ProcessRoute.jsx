// Trajeto de 5 etapas do remake mobile (as de `PROCESS_STAGES`, a atual por
// `getProcessStage`): o navio percorre ate a etapa atual. O avanco e' a var
// `--m-route-p` (registrada com @property em styles.css), animada por
// transition quando `m-route--go` entra no rAF duplo apos o mount; com movimento
// reduzido ja nasce na posicao final. Compartilhado pelo favorito do Inicio
// (fundo claro) e pelo hero navy do detalhe (`variant="hero"`). So' aparece no
// mobile: as duas arvores que o usam so renderizam ele em <= 720px.
import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { isAirCategory } from './processCategories'
import { getProcessStage, PROCESS_STAGES } from './processStage'

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)')?.matches)
}

export default function ProcessRoute({ item, variant = 'card' }) {
  const { currentStage, isComplete } = getProcessStage(item)
  const activeStage = isComplete ? PROCESS_STAGES.length : currentStage
  const target = Math.min(activeStage, PROCESS_STAGES.length - 1) / (PROCESS_STAGES.length - 1)
  const [go, setGo] = useState(prefersReducedMotion)

  useEffect(() => {
    if (go) return undefined
    let inner = 0
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setGo(true))
    })
    return () => {
      window.cancelAnimationFrame(outer)
      window.cancelAnimationFrame(inner)
    }
  }, [go])

  return (
    <div
      className={`m-route${variant === 'hero' ? ' m-route--hero' : ''}${go ? ' m-route--go' : ''}`}
      style={{ '--m-route-to': target }}
    >
      <div className="m-route__track" aria-hidden="true">
        <i className="m-route__fill" />
      </div>
      <span className="m-route__ship" aria-hidden="true">
        <Icon name={isAirCategory(item.category) ? 'plane' : 'ship'} size={26} />
      </span>
      <ol className="m-route__steps" aria-label="Etapas do processo">
        {PROCESS_STAGES.map((label, index) => {
          const state = index < activeStage ? 'done' : index === activeStage ? 'now' : 'todo'
          return (
            <li
              key={label}
              className={`m-route__step m-route__step--${state}`}
              aria-current={state === 'now' ? 'step' : undefined}
            >
              <i aria-hidden="true" />
              <span>{label}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
