import { useCallback, useState } from 'react'

// Sidebar recolhivel do desktop (>= 1041px): a escolha do usuario persiste em
// localStorage. Valor '1' = recolhida; expandida = chave ausente. O storage
// pode estar bloqueado (modo privado, politica do navegador): nesse caso o
// estado vale ate recarregar e nada lanca.

export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'comex-sidebar-colapsada'

export function readSidebarCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
  } catch (error) {
    return false
  }
}

export function writeSidebarCollapsed(collapsed) {
  try {
    if (collapsed) {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, '1')
    } else {
      window.localStorage.removeItem(SIDEBAR_COLLAPSED_STORAGE_KEY)
    }
  } catch (error) {
    // Storage indisponivel: o estado em memoria continua valendo.
  }
}

export default function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed)

  // A escrita fica FORA do updater para nao duplicar efeito colateral no
  // StrictMode (updaters rodam duas vezes em dev).
  const toggle = useCallback(() => {
    const next = !collapsed
    setCollapsed(next)
    writeSidebarCollapsed(next)
  }, [collapsed])

  return { collapsed, toggle }
}
