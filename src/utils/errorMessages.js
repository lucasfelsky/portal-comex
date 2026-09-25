import { repairTextEncoding } from './textEncoding'

// UX-3a: util unico de mensagem de erro PT-BR, sem codigo tecnico exposto ao
// usuario. Substitui as 8 copias locais de `buildActionErrorMessage`
// espalhadas pelo app (AdminAnnouncementsPanel, AdminBarStatusPanel,
// AdminLeadTimePanel, AdminSupportPanel, AdminUsersPanel,
// ProcessHistoryPanel, NewsPage, ProcessesPage) + os pontos que mostravam
// `error.code`/`error.message` crus (AdminForecastPage, SupportButton,
// ImportProcessesModal).

const CODE_MESSAGES = {
  'permission-denied': 'Você não tem permissão para esta ação.',
  unauthenticated: 'Sua sessão expirou. Entre novamente.',
  unavailable: 'Sem conexão com o servidor. Verifique a internet e tente novamente.',
  'auth/network-request-failed':
    'Sem conexão com o servidor. Verifique a internet e tente novamente.',
  'deadline-exceeded': 'O servidor demorou para responder. Tente novamente.',
  'not-found': 'O registro não foi encontrado. Atualize a página.',
  'already-exists': 'Este registro já existe.',
  'resource-exhausted': 'Limite de uso atingido. Aguarde alguns minutos e tente novamente.',
  'storage/unauthorized': 'Você não tem permissão para enviar este arquivo.',
  'storage/canceled': 'O envio do arquivo foi cancelado.',
  'storage/quota-exceeded': 'O espaço de armazenamento está cheio. Avise o administrador.',
  'storage/retry-limit-exceeded': 'O envio do arquivo demorou demais. Tente novamente.',
  'storage/object-not-found': 'O arquivo não foi encontrado.',
}

const STORAGE_GENERIC_MESSAGE = 'Não foi possível enviar o arquivo. Tente novamente.'
const GENERIC_FALLBACK_MESSAGE =
  'Tente novamente em instantes. Se o problema continuar, abra um chamado no Suporte.'

const CALLABLE_MESSAGE_SUFFIXES = [
  'invalid-argument',
  'failed-precondition',
  'not-found',
  'permission-denied',
  'already-exists',
  'unauthenticated',
]

function stripKnownPrefix(code) {
  if (code.startsWith('firestore/')) return code.slice('firestore/'.length)
  if (code.startsWith('functions/')) return code.slice('functions/'.length)
  return code
}

function getCallableMessage(error) {
  const code = error?.code
  if (typeof code !== 'string' || !code.startsWith('functions/')) return null

  const suffix = code.slice('functions/'.length)
  if (!CALLABLE_MESSAGE_SUFFIXES.includes(suffix)) return null

  const message = error?.message
  if (typeof message !== 'string') return null
  const trimmed = message.trim()
  if (!trimmed) return null
  if (trimmed.toLowerCase() === suffix.toLowerCase()) return null

  return trimmed
}

function getMappedCodeMessage(error) {
  const code = error?.code
  if (typeof code !== 'string' || !code) return null

  const normalized = stripKnownPrefix(code)
  if (CODE_MESSAGES[normalized]) return CODE_MESSAGES[normalized]
  if (normalized.startsWith('storage/')) return STORAGE_GENERIC_MESSAGE

  return null
}

function getAppErrorMessage(error) {
  if (!(error instanceof Error)) return null
  if (error.name !== 'Error') return null
  if (typeof error.message !== 'string') return null
  const trimmed = error.message.trim()
  return trimmed ? trimmed : null
}

function computeFriendlyErrorDetail(error) {
  const callableMessage = getCallableMessage(error)
  if (callableMessage) return callableMessage

  const mappedMessage = getMappedCodeMessage(error)
  if (mappedMessage) return mappedMessage

  const appErrorMessage = getAppErrorMessage(error)
  if (appErrorMessage) return appErrorMessage

  if (typeof error === 'string' && error.trim()) return error

  return GENERIC_FALLBACK_MESSAGE
}

export function getFriendlyErrorDetail(error) {
  return repairTextEncoding(computeFriendlyErrorDetail(error))
}

export function buildActionErrorMessage(prefix, error) {
  console.error(prefix, error)
  return `${prefix} ${getFriendlyErrorDetail(error)}`
}
