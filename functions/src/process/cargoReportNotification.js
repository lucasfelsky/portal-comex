// Notificacao "Relatorio de Carga" (documento `cargoReport` anexado ao
// processo): logica PURA de destinatarios e texto.
//
// Este arquivo NAO importa `firebase-admin`/`firebase-functions` nem
// `../core/shared.js` (mesmo padrao de `documentIndex.js`: importavel por
// teste sem mocks). O trigger `notifyCargoReportUploaded`
// (`./documents.js`) faz o I/O e chama estas funcoes.

export const CARGO_REPORT_NOTIFICATION_TYPE = 'process_cargo_report_uploaded'

// Texto EXATO pedido pelo Comex (nao parafrasear). Como o corpo nao
// identifica o processo, o processo vai no titulo.
export const CARGO_REPORT_NOTIFICATION_BODY =
  'Relatório de Carga preenchido e disponível no Portal COMEX. Documentação necessária para emissão do COA está disponível na pasta do processo.'

// Teto de e-mails por lista da config (protege contra doc adulterado/enorme).
const MAX_EMAILS_PER_LIST = 50

export function buildCargoReportNotificationTitle(processLabel) {
  return `Relatório de Carga disponível: ${processLabel}`
}

function defaultIsCorporateEmail(email) {
  return String(email ?? '').trim().toLowerCase().endsWith('@sqquimica.com')
}

function isActiveUser(user) {
  return String(user?.status ?? '').trim().toLowerCase() === 'ativo'
}

// `raw` = dados de `config/cargoReportRecipients` (`{ tecnico, faturamento }`),
// ou `undefined` quando o doc nao existe. Campos ausentes/nao-array -> `[]`;
// itens nao-string ignorados; `trim().toLowerCase()`; dedupe; so' e-mail
// corporativo (os demais so' sao contados em `ignoredNonCorporate`); teto de
// 50 por lista.
export function normalizeCargoReportRecipientsConfig(raw, isCorporateEmail = defaultIsCorporateEmail) {
  let ignoredNonCorporate = 0

  const normalizeList = (value) => {
    if (!Array.isArray(value)) return []

    const seen = new Set()
    const result = []
    for (const item of value) {
      if (typeof item !== 'string') continue
      const email = item.trim().toLowerCase()
      if (!email || seen.has(email)) continue
      seen.add(email)

      if (!isCorporateEmail(email)) {
        ignoredNonCorporate += 1
        continue
      }
      result.push(email)
    }
    return result.slice(0, MAX_EMAILS_PER_LIST)
  }

  const source = raw && typeof raw === 'object' ? raw : {}
  const tecnico = normalizeList(source.tecnico)
  const faturamento = normalizeList(source.faturamento)

  return { tecnico, faturamento, ignoredNonCorporate }
}

// Une admins + logistica + usuarios ATIVOS da config (dedupe por `id`,
// sem o ator). `configEmails` = uniao deduplicada de tecnico + faturamento;
// `usersByEmail` = `Map<emailMinusculo, userDoc>`. E-mail da config com
// usuario encontrado mas NAO ativo some das duas listas; so' e-mail SEM
// usuario vai para `directEmails`. Ordem deterministica (id / e-mail).
export function planCargoReportRecipients({
  admins = [],
  logistics = [],
  configEmails = [],
  usersByEmail = new Map(),
  actorUserId = '',
} = {}) {
  const actorId = String(actorUserId ?? '')
  const byId = new Map()

  const addUser = (user) => {
    const id = String(user?.id ?? '')
    if (!id || id === actorId || byId.has(id)) return
    byId.set(id, user)
  }

  for (const user of Array.isArray(admins) ? admins : []) addUser(user)
  for (const user of Array.isArray(logistics) ? logistics : []) addUser(user)

  const directEmails = new Set()
  for (const rawEmail of Array.isArray(configEmails) ? configEmails : []) {
    const email = String(rawEmail ?? '').trim().toLowerCase()
    if (!email) continue

    const user = usersByEmail.get(email)
    if (user) {
      if (isActiveUser(user)) addUser(user)
      continue
    }
    directEmails.add(email)
  }

  const userRecipients = [...byId.values()].sort((left, right) =>
    String(left.id).localeCompare(String(right.id))
  )

  return { userRecipients, directEmails: [...directEmails].sort() }
}
