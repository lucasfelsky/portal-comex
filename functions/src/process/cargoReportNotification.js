// Notificacao "Relatorio de Carga" (documento `cargoReport` anexado ao
// processo): logica PURA de destinatarios e texto.
//
// Este arquivo NAO importa `firebase-admin`/`firebase-functions` nem
// `../core/shared.js` (mesmo padrao de `documentIndex.js`: importavel por
// teste sem mocks). O trigger `notifyCargoReportUploaded`
// (`./documents.js`) faz o I/O e chama estas funcoes.

export const CARGO_REPORT_NOTIFICATION_TYPE = 'process_cargo_report_uploaded'

// S7: aviso NOVO quando a LOGISTICA fecha a conferencia (documento `cargoReport` anexado por ela).
// Mesmo trigger, mesmos destinatarios; o estagio sai do `uploadedByRole` do documento.
export const CARGO_REPORT_CONFERENCE_NOTIFICATION_TYPE = 'process_cargo_report_conference'

// Texto EXATO pedido pelo Comex (nao parafrasear). Como o corpo nao
// identifica o processo, o processo vai no titulo.
export const CARGO_REPORT_NOTIFICATION_BODY =
  'Relatório de Carga preenchido e disponível no Portal COMEX. Documentação necessária para emissão do COA está disponível na pasta do processo.'

// Corpo da notificacao in-app da conferencia (texto longo). O e-mail da conferencia usa o texto curto
// do banner (`CARGO_CONFERENCE_EMAIL_TEXT` em `./cargoReportEmail.js`, decisao do Comex).
export const CARGO_REPORT_CONFERENCE_NOTIFICATION_BODY =
  'Conferência da logística concluída no Relatório de Carga. Etiquetas, contagem e dados do recebimento estão disponíveis na pasta do processo no Portal COMEX.'

// Teto de e-mails por lista da config (protege contra doc adulterado/enorme).
const MAX_EMAILS_PER_LIST = 50

export const CARGO_REPORT_SUBJECT_PREFIX = 'Relatório de Carga'
export const CARGO_REPORT_CONFERENCE_SUBJECT_PREFIX = 'Conferência do Relatório de Carga'
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
function buildSubjectWithPrefix(prefix, process) {
  const category = sanitizeCargoReportText(process?.category)
  const processNumber = sanitizeCargoReportText(process?.processNumber)
  const name = sanitizeCargoReportText(process?.name)

  const parts =
    category === 'CONSOLIDADO' && name
      ? [name]
      : [processNumber ? `PO ${processNumber}` : '', name].filter(Boolean)

  return parts.length > 0 ? `${prefix}${CARGO_REPORT_SUBJECT_SEPARATOR}${parts.join(CARGO_REPORT_SUBJECT_SEPARATOR)}` : prefix
}

export function buildCargoReportSubject(process) {
  return buildSubjectWithPrefix(CARGO_REPORT_SUBJECT_PREFIX, process)
}

// Fatia D: sufixo do assunto/titulo da conferencia quando ha lote com unidades divergentes.
export const CARGO_REPORT_CONFERENCE_DIVERGENCE_SUFFIX = ' (com divergências)'

// S7: `Conferência do Relatório de Carga - PO <numero> - <nome>` (CONSOLIDADO: `... - <nome>`); mesmas
// regras do assunto do COMEX, inclusive "nao depende de role". Fatia D: `{ divergent: true }` acrescenta
// " (com divergências)" (so' com unidades divergentes; parcial sem divergencia nao muda o assunto).
export function buildCargoReportConferenceSubject(process, { divergent = false } = {}) {
  const subject = buildSubjectWithPrefix(CARGO_REPORT_CONFERENCE_SUBJECT_PREFIX, process)
  return divergent ? `${subject}${CARGO_REPORT_CONFERENCE_DIVERGENCE_SUFFIX}` : subject
}

// Estagio do aviso a partir do documento `cargoReport` criado: anexo da logistica = conferencia fechada;
// qualquer outro papel (admin, vazio, ausente) = fechamento do COMEX (aviso de hoje).
export function resolveCargoReportUploadStage(document) {
  return String(document?.uploadedByRole ?? '').trim() === 'logistica' ? 'conferencia' : 'comex'
}

// Parte do processo de um assunto ja montado (o doc de `notifications` so'
// carrega o titulo): `Relatório de Carga - X` -> `X`; so' o prefixo ou vazio
// -> ''; texto fora do padrao -> o proprio texto (sanitizado).
// Reconhece os 2 prefixos (o da conferencia vem ANTES: nenhum comeca com o outro, mas a ordem documenta).
// Fatia D: no assunto da conferencia o sufixo " (com divergências)" NAO faz parte do rotulo ("Processo:" e preheader);
// no assunto do COMEX nada e' removido.
export function extractCargoReportProcessLabel(subject) {
  const text = sanitizeCargoReportText(subject)
  const withoutSuffix = text.endsWith(CARGO_REPORT_CONFERENCE_DIVERGENCE_SUFFIX)
    ? text.slice(0, -CARGO_REPORT_CONFERENCE_DIVERGENCE_SUFFIX.length).trimEnd()
    : text
  for (const prefix of [CARGO_REPORT_CONFERENCE_SUBJECT_PREFIX, CARGO_REPORT_SUBJECT_PREFIX]) {
    const candidate = prefix === CARGO_REPORT_CONFERENCE_SUBJECT_PREFIX ? withoutSuffix : text
    if (candidate === prefix) return ''
    const prefixWithSeparator = `${prefix}${CARGO_REPORT_SUBJECT_SEPARATOR}`
    if (candidate.startsWith(prefixWithSeparator)) return candidate.slice(prefixWithSeparator.length).trim()
  }
  return text
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
