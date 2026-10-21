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

function isSafeReturnTo(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
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

export function getReturnLabel(returnTo) {
  const pathname = String(returnTo ?? '').split('?')[0]
  return RETURN_LABELS[pathname] ?? ''
}
