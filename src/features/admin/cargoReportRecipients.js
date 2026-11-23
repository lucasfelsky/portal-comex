// Lógica pura da tela /admin/relatorio-carga (destinatários do aviso "Relatório de Carga").
//
// `normalizeCargoReportRecipientsConfig` é um ESPELHO FIEL da função de mesmo nome em
// `functions/src/process/cargoReportNotification.js` (o bundle do Vite não pode importar
// código de `functions/`). O teste `tests/unit/cargoReportRecipientsParity.test.js` compara
// os dois: se o backend mudar, o teste quebra e este arquivo precisa acompanhar.

export const CARGO_REPORT_RECIPIENTS_MAX_PER_LIST = 50

export const CARGO_REPORT_RECIPIENT_LISTS = [
  {
    key: 'tecnico',
    label: 'Técnico',
    description: 'Recebem o aviso quando o Relatório de Carga é anexado.',
  },
  {
    key: 'faturamento',
    label: 'Faturamento/fiscal',
    description: 'Recebem o aviso para emissão do COA e trâmites fiscais.',
  },
]

// Mesmo padrão POR ITEM da regra de `config/cargoReportRecipients` em firestore.rules.
export const CARGO_REPORT_RECIPIENT_EMAIL_PATTERN = /^[a-z0-9._%+-]+@sqquimica\.com$/

function defaultIsCorporateEmail(email) {
  return String(email ?? '').trim().toLowerCase().endsWith('@sqquimica.com')
}

// `raw` = dados de `config/cargoReportRecipients` (`{ tecnico, faturamento }`),
// ou `undefined` quando o doc não existe. Campos ausentes/não-array -> `[]`;
// itens não-string ignorados; `trim().toLowerCase()`; dedupe; só e-mail
// corporativo (os demais só são contados em `ignoredNonCorporate`); teto de
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
    return result.slice(0, CARGO_REPORT_RECIPIENTS_MAX_PER_LIST)
  }

  const source = raw && typeof raw === 'object' ? raw : {}
  const tecnico = normalizeList(source.tecnico)
  const faturamento = normalizeList(source.faturamento)

  return { tecnico, faturamento, ignoredNonCorporate }
}

export function isValidCargoReportRecipientEmail(email) {
  return typeof email === 'string' && CARGO_REPORT_RECIPIENT_EMAIL_PATTERN.test(email)
}

// Valida o e-mail digitado para ADICIONAR a `currentList` (lista já normalizada).
// Retorna `{ email, error }`: `email` é o valor normalizado (trim + minúsculas); `error` é '' quando válido.
export function validateNewRecipientEmail(input, currentList = []) {
  const email = String(input ?? '').trim().toLowerCase()

  if (!email) return { email, error: 'Informe um e-mail.' }
  if (!isValidCargoReportRecipientEmail(email)) {
    return { email, error: 'Use um e-mail corporativo @sqquimica.com.' }
  }
  if (currentList.includes(email)) return { email, error: 'Este e-mail já está nesta lista.' }
  if (currentList.length >= CARGO_REPORT_RECIPIENTS_MAX_PER_LIST) {
    return {
      email,
      error: `Limite de ${CARGO_REPORT_RECIPIENTS_MAX_PER_LIST} e-mails por lista atingido.`,
    }
  }

  return { email, error: '' }
}

// Monta o payload gravado em `config/cargoReportRecipients` (só os 2 campos, sem `updatedAt`).
// Defesa antes da regra: lança `Error` se algum item for inválido ou a lista passar do teto.
export function buildCargoReportRecipientsPayload({ tecnico, faturamento } = {}) {
  const payload = {}

  for (const { key, label } of CARGO_REPORT_RECIPIENT_LISTS) {
    const source = key === 'tecnico' ? tecnico : faturamento
    const normalized = Array.isArray(source)
      ? source
          .filter((item) => typeof item === 'string')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
      : []
    const unique = [...new Set(normalized)]

    if (unique.length > CARGO_REPORT_RECIPIENTS_MAX_PER_LIST) {
      throw new Error(`A lista ${label} passa do limite de ${CARGO_REPORT_RECIPIENTS_MAX_PER_LIST} e-mails.`)
    }
    const invalid = unique.find((email) => !isValidCargoReportRecipientEmail(email))
    if (invalid) {
      throw new Error(`E-mail inválido na lista ${label}: ${invalid}`)
    }
    payload[key] = unique
  }

  return { tecnico: payload.tecnico, faturamento: payload.faturamento }
}
