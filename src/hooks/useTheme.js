import { useCallback, useEffect, useState } from 'react'

// C17 (toggle): preferencia de tema com 3 estados.
// - 'auto'  -> segue o sistema (prefers-color-scheme), reagindo a mudancas;
// - 'light' | 'dark' -> forcam o tema (pedido do Lucas: o celular dele nao
//   expunha dark no SO, entao so' o prefers-color-scheme nao bastava).
// A preferencia persiste em localStorage ('pc-theme'); o tema EFETIVO e'
// estampado em <html data-theme="..."> — unico gatilho que o CSS conhece.
// O index.html tem um script inline com a MESMA resolucao pra evitar FOUC;
// este hook assume dali em diante (troca em runtime + listener do sistema).

const STORAGE_KEY = 'pc-theme'
const CYCLE_ORDER = ['auto', 'dark', 'light']

// theme-color do chrome do navegador mobile acompanha o tema efetivo.
const THEME_COLOR = { light: '#00ae91', dark: '#0e1413' }

export function getStoredThemePreference() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'auto'
  } catch (error) {
    return 'auto'
  }
}

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveEffectiveTheme(preference) {
  return preference === 'auto' ? getSystemTheme() : preference
}

function applyTheme(effective) {
  document.documentElement.dataset.theme = effective
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[effective] ?? THEME_COLOR.light)
}

export function useTheme() {
  const [preference, setPreferenceState] = useState(getStoredThemePreference)

  useEffect(() => {
    applyTheme(resolveEffectiveTheme(preference))

    // So' em 'auto' o tema efetivo depende do sistema — segue mudancas ao vivo.
    if (preference !== 'auto') return undefined

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => applyTheme(resolveEffectiveTheme('auto'))
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [preference])

  const setPreference = useCallback((value) => {
    const next = value === 'light' || value === 'dark' ? value : 'auto'
    try {
      if (next === 'auto') {
        window.localStorage.removeItem(STORAGE_KEY)
      } else {
        window.localStorage.setItem(STORAGE_KEY, next)
      }
    } catch (error) {
      // Sem localStorage (ex.: modo privado antigo): o tema ainda muda na
      // sessao corrente; so' nao persiste.
    }
    setPreferenceState(next)
  }, [])

  // Ciclo do botao: auto -> escuro -> claro -> auto.
  const cyclePreference = useCallback(() => {
    setPreference(CYCLE_ORDER[(CYCLE_ORDER.indexOf(preference) + 1) % CYCLE_ORDER.length])
  }, [preference, setPreference])

  return { preference, setPreference, cyclePreference }
}
