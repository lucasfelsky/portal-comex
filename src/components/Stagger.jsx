// Stagger: wrapper que aplica fade-in com delay incremental nos children
// (Sprint 21). Cada filho recebe um style { animationDelay }.
//
// API:
//   <Stagger>
//     <Card />
//     <Card />
//   </Stagger>
//
// O CSS cuida do resto (opacity 0 -> 1 + translateY).
//
// Cada filho recebe duas custom properties: --stagger-delay (ms acumulados; e o
// que o mobile usa) e --stagger-index (posicao 0-based; o desktop calcula
// min(indice, 7) * 40 ms, entao so os 8 primeiros escalonam — Movimento.dc.html).

import { Children, cloneElement, isValidElement } from 'react'

const DEFAULT_STEP_MS = 60
const DEFAULT_BASE_MS = 0

export default function Stagger({
  children,
  stepMs = DEFAULT_STEP_MS,
  baseMs = DEFAULT_BASE_MS,
  className = '',
}) {
  const arr = Children.toArray(children)
  return (
    <div className={`stagger${className ? ` ${className}` : ''}`}>
      {arr.map((child, index) => {
        if (!isValidElement(child)) return child
        const delay = baseMs + index * stepMs
        return cloneElement(child, {
          key: child.key ?? `stagger-${index}`,
          style: {
            ...(child.props.style ?? {}),
            '--stagger-delay': `${delay}ms`,
            '--stagger-index': index,
          },
          className: `${child.props.className ?? ''} stagger__item`.trim(),
        })
      })}
    </div>
  )
}
