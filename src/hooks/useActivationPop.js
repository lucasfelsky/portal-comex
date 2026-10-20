import { useEffect, useRef, useState } from 'react'

// Estrela de favorito (Movimento.dc.html, "Hover, press, favorito"): ao ATIVAR
// o icone entra com scale(0 -> 1) em 300 ms com mola. So a transicao
// desativado -> ativado anima: o primeiro render ja ativo (lista que monta
// com favoritos) e a desativacao nao animam. Devolve `true` enquanto o estado
// ativo "acabou de nascer"; o consumidor liga a classe `favorite-star--pop`
// (a animacao so dispara quando a classe entra, entao nao precisa de timer).
export default function useActivationPop(active) {
  const [popped, setPopped] = useState(false)
  const previousRef = useRef(active)

  useEffect(() => {
    if (active && !previousRef.current) setPopped(true)
    if (!active) setPopped(false)
    previousRef.current = active
  }, [active])

  return active && popped
}
