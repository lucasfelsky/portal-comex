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

export const CARGO_REPORT_SUBJECT_PREFIX = 'Relatório de Carga'
const CARGO_REPORT_SUBJECT_SEPARATOR = ' - '

// Remove quebras de linha (header injection no assunto do e-mail), colapsa
// espacos e aplica trim.
export function sanitizeCargoReportText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

// Assunto do e-mail E titulo da notificacao in-app (sao o MESMO texto, sem o
// prefixo "[Portal COMEX]"):
//   FCL/LCL/AEREO (nao consolidado): `Relatório de Carga - PO <numero> - <nome>`
//   CONSOLIDADO:                     `Relatório de Carga - <nome>`
// Partes ausentes sao omitidas sem hifen sobrando; sem nada: `Relatório de Carga`.
//
// REGRA (assunto fixo pedido pelo Comex): o mesmo assunto vale para TODOS os
// destinatarios, inclusive e-mail direto da lista. Por isso NAO depende de
// role: o `name` de processos FCL/LCL/AEREO aparece tambem para perfis que
// nao sao admin/logistica neste aviso (ao contrario de `buildRecipientProcessLabel`).
export function buildCargoReportSubject(process) {
  const category = sanitizeCargoReportText(process?.category)
  const processNumber = sanitizeCargoReportText(process?.processNumber)
  const name = sanitizeCargoReportText(process?.name)

  const parts =
    category === 'CONSOLIDADO' && name
      ? [name]
      : [processNumber ? `PO ${processNumber}` : '', name].filter(Boolean)

  return parts.length > 0
    ? `${CARGO_REPORT_SUBJECT_PREFIX}${CARGO_REPORT_SUBJECT_SEPARATOR}${parts.join(CARGO_REPORT_SUBJECT_SEPARATOR)}`
    : CARGO_REPORT_SUBJECT_PREFIX
}

// Parte do processo de um assunto ja montado (o doc de `notifications` so'
// carrega o titulo): `Relatório de Carga - X` -> `X`; so' o prefixo ou vazio
// -> ''; texto fora do padrao -> o proprio texto (sanitizado).
export function extractCargoReportProcessLabel(subject) {
  const text = sanitizeCargoReportText(subject)
  const prefixWithSeparator = `${CARGO_REPORT_SUBJECT_PREFIX}${CARGO_REPORT_SUBJECT_SEPARATOR}`
  if (text === CARGO_REPORT_SUBJECT_PREFIX) return ''
  return text.startsWith(prefixWithSeparator) ? text.slice(prefixWithSeparator.length).trim() : text
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

// Une admins + logistica + usuarios ATIVOS da config (dedupe por `id`).
// O AUTOR do upload tambem recebe quando elegivel (pedido do Comex, 2026-11),
// diferente do padrao dos demais avisos de processo, que excluem o ator;
// elegibilidade segue sendo admin/logistica ativos ou usuario ativo das
// listas. `configEmails` = uniao deduplicada de tecnico + faturamento;
// `usersByEmail` = `Map<emailMinusculo, userDoc>`. E-mail da config com
// usuario encontrado mas NAO ativo some das duas listas; so' e-mail SEM
// usuario vai para `directEmails`. Ordem deterministica (id / e-mail).
export function planCargoReportRecipients({
  admins = [],
  logistics = [],
  configEmails = [],
  usersByEmail = new Map(),
} = {}) {
  const byId = new Map()

  const addUser = (user) => {
    const id = String(user?.id ?? '')
    if (!id || byId.has(id)) return
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
