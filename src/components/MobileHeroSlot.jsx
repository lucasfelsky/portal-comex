import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMobileLayout } from '../hooks/useMobileLayout'

// Slot do hero mobile: as telas levam para dentro do hero navy do AppLayout
// (`#mobile-hero-extra`, em `.mobile-page-header`) o que precisa morar ali
// (chip da Barra do Rio, contagem de processos, acoes). So' renderiza com o
// layout mobile (<= 720px): no desktop e no tablet nao sai nada. O destino e'
// resolvido depois do mount porque o hero pertence ao AppLayout.
export default function MobileHeroSlot({ children }) {
  const isMobileLayout = useMobileLayout()
  const [target, setTarget] = useState(null)

  useEffect(() => {
    setTarget(isMobileLayout ? document.getElementById('mobile-hero-extra') : null)
  }, [isMobileLayout])

  if (!isMobileLayout || !target) return null
  return createPortal(children, target)
}
