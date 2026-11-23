// Deep link para o detalhe de um processo (Dashboard, paleta Ctrl K, notificacoes).
// Registra em `state.returnTo` a tela de origem, para o "Voltar" do detalhe
// retornar a ela em vez de cair na fila de Chegadas. Sem `returnTo` (abriu pela
// propria fila de /processos) o "Voltar" continua indo para a fila.

const PROCESSES_PATH = '/processos'

const RETURN_LABELS = {
  '/': 'Dashboard',
  '/news': 'Notícias',
  '/notifications': 'Notificações',
  '/menu': 'Menu',
}

// `\` e tratado como `/` pelo navegador (`/\host` equivale a `//host`), entao e rejeitado.
// `%5C` NAO e decodificado antes de resolver a URL: vira segmento literal do path
// interno, portanto `/%5Chost` e aceito.
export function isSafeReturnTo(value) {
  return (
    typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
  )
}

// `location` = objeto do react-router (`useLocation()`): so' vira returnTo fora de /processos.
export function getReturnToFromLocation(locationLike) {
  const pathname = String(locationLike?.pathname ?? '')
  if (!pathname || pathname === PROCESSES_PATH) return ''
  const returnTo = `${pathname}${locationLike?.search ?? ''}`
  return isSafeReturnTo(returnTo) ? returnTo : ''
}

export function buildProcessLinkState(processId, detailTab, returnTo = '') {
  const state = { selectedProcessId: processId, detailTab }
  if (isSafeReturnTo(returnTo) && returnTo !== PROCESSES_PATH) state.returnTo = returnTo
  return state
}

export function readReturnTo(state) {
  return isSafeReturnTo(state?.returnTo) ? state.returnTo : ''
}

// Abas reais do detalhe do processo (`ProcessDetailView.jsx`).
export const PROCESS_DETAIL_TABS = ['general', 'process', 'items', 'messages', 'history', 'documents']

const MAX_LINK_PROCESS_ID_LENGTH = 200

// Deep link por URL: `/processos?processo=<id>&aba=<tab>` (e-mail do Relatorio
// de Carga). `search` com ou sem `?`. Nunca lanca: entrada invalida -> `null`.
// `aba` ausente/invalida -> 'general'.
export function readProcessLinkFromSearch(search) {
  if (typeof search !== 'string') return null

  let params
  try {
    params = new URLSearchParams(search)
  } catch {
    return null
  }

  const selectedProcessId = (params.get('processo') ?? '').trim()
  if (!selectedProcessId || selectedProcessId.length > MAX_LINK_PROCESS_ID_LENGTH) return null

  const tab = params.get('aba') ?? ''
  const detailTab = PROCESS_DETAIL_TABS.includes(tab) ? tab : 'general'

  return { selectedProcessId, detailTab }
}

export function getReturnLabel(returnTo) {
  const pathname = String(returnTo ?? '').split('?')[0]
  return RETURN_LABELS[pathname] ?? ''
}
