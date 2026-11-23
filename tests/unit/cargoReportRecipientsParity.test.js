// Paridade entre a normalização do CLIENTE (tela /admin/relatorio-carga) e a do BACKEND
// (trigger notifyCargoReportUploaded). Se alguém mudar uma das duas, este teste quebra.

import { describe, expect, it } from 'vitest'
import { normalizeCargoReportRecipientsConfig as backendNormalize } from '../../functions/src/process/cargoReportNotification.js'
import {
  CARGO_REPORT_RECIPIENTS_MAX_PER_LIST,
  buildCargoReportRecipientsPayload,
  isValidCargoReportRecipientEmail,
  normalizeCargoReportRecipientsConfig as clientNormalize,
  validateNewRecipientEmail,
} from '../../src/features/admin/cargoReportRecipients.js'

// Mesmo predicado de tests/unit/cargoReportNotification.test.js
const isCorporateEmail = (email) => String(email ?? '').trim().toLowerCase().endsWith('@sqquimica.com')

const many = Array.from({ length: 80 }, (_, index) => `user${index}@sqquimica.com`)
const duplicatesAfter50 = [
  ...Array.from({ length: 50 }, (_, index) => `user${index}@sqquimica.com`),
  'user0@sqquimica.com',
  'extra@sqquimica.com',
]

const CASES = [
  ['undefined', undefined],
  ['null', null],
  ['string', 'texto'],
  ['número', 7],
  ['objeto vazio', {}],
  ['campos não-array', { tecnico: 'a@sqquimica.com', faturamento: { 0: 'b' } }],
  [
    'maiúsculas, espaços e duplicados',
    {
      tecnico: ['  Tecnico@SQQuimica.com ', 'tecnico@sqquimica.com', 'outro@sqquimica.com'],
      faturamento: ['FISCAL@sqquimica.com'],
    },
  ],
  [
    'não-string e vazios misturados',
    { tecnico: [42, null, undefined, { email: 'x@sqquimica.com' }, '', '   ', 'ok@sqquimica.com'] },
  ],
  [
    'não-corporativos',
    { tecnico: ['externo@gmail.com', 'ok@sqquimica.com'], faturamento: ['fiscal@outraempresa.com.br'] },
  ],
  [
    'não-corporativos duplicados contam 1',
    { tecnico: ['Externo@gmail.com', 'externo@gmail.com'], faturamento: ['externo@gmail.com'] },
  ],
  ['duplicados com e sem caixa', { tecnico: ['A@sqquimica.com', 'a@sqquimica.com', ' a@SQQUIMICA.com '] }],
  ['80 itens (teto 50)', { tecnico: many, faturamento: many }],
  ['duplicado após a posição 50', { tecnico: duplicatesAfter50 }],
  ['somente o domínio', { tecnico: ['@sqquimica.com'] }],
  ['acento no local-part', { tecnico: ['joão@sqquimica.com'] }],
  ['espaço interno', { faturamento: ['a b@sqquimica.com'] }],
  ['apenas um campo', { faturamento: ['f@sqquimica.com'] }],
]

describe('paridade cliente x backend: normalizeCargoReportRecipientsConfig', () => {
  it.each(CASES)('%s (predicado padrão)', (_name, raw) => {
    expect(clientNormalize(raw)).toEqual(backendNormalize(raw))
  })

  it.each(CASES)('%s (predicado isCorporateEmail do teste do backend)', (_name, raw) => {
    expect(clientNormalize(raw, isCorporateEmail)).toEqual(backendNormalize(raw, isCorporateEmail))
  })

  it('predicado customizado é respeitado igualmente', () => {
    const onlyAcme = (email) => email.endsWith('@acme.com')
    const raw = { tecnico: ['a@acme.com', 'b@sqquimica.com'], faturamento: ['c@acme.com'] }
    expect(clientNormalize(raw, onlyAcme)).toEqual(backendNormalize(raw, onlyAcme))
  })

  it('o teto do cliente é o mesmo do backend (50)', () => {
    expect(CARGO_REPORT_RECIPIENTS_MAX_PER_LIST).toBe(50)
    expect(backendNormalize({ tecnico: many }).tecnico).toHaveLength(CARGO_REPORT_RECIPIENTS_MAX_PER_LIST)
  })
})

describe('isValidCargoReportRecipientEmail', () => {
  it('aceita e-mail corporativo em minúsculas', () => {
    expect(isValidCargoReportRecipientEmail('nome.sobrenome+x@sqquimica.com')).toBe(true)
  })

  it.each([
    ['maiúscula', 'Nome@sqquimica.com'],
    ['domínio externo', 'nome@gmail.com'],
    ['subdomínio', 'nome@x.sqquimica.com'],
    ['sem local-part', '@sqquimica.com'],
    ['acento', 'joão@sqquimica.com'],
    ['espaço', 'a b@sqquimica.com'],
    ['vírgula', 'a,b@sqquimica.com'],
    ['vazio', ''],
    ['não-string', 42],
    ['null', null],
  ])('rejeita %s', (_name, value) => {
    expect(isValidCargoReportRecipientEmail(value)).toBe(false)
  })
})

describe('validateNewRecipientEmail', () => {
  it('normaliza com trim e minúsculas', () => {
    expect(validateNewRecipientEmail('  Novo@SQQuimica.com ', [])).toEqual({
      email: 'novo@sqquimica.com',
      error: '',
    })
  })

  it('vazio', () => {
    expect(validateNewRecipientEmail('   ', []).error).toBe('Informe um e-mail.')
    expect(validateNewRecipientEmail(undefined, []).error).toBe('Informe um e-mail.')
  })

  it('formato/domínio', () => {
    expect(validateNewRecipientEmail('x@gmail.com', []).error).toBe('Use um e-mail corporativo @sqquimica.com.')
    expect(validateNewRecipientEmail('@sqquimica.com', []).error).toBe('Use um e-mail corporativo @sqquimica.com.')
    expect(validateNewRecipientEmail('joão@sqquimica.com', []).error).toBe(
      'Use um e-mail corporativo @sqquimica.com.'
    )
  })

  it('duplicado', () => {
    expect(validateNewRecipientEmail('A@sqquimica.com', ['a@sqquimica.com']).error).toBe(
      'Este e-mail já está nesta lista.'
    )
  })

  it('lista cheia', () => {
    const full = Array.from({ length: 50 }, (_, index) => `user${index}@sqquimica.com`)
    expect(validateNewRecipientEmail('novo@sqquimica.com', full).error).toBe(
      'Limite de 50 e-mails por lista atingido.'
    )
  })
})

describe('buildCargoReportRecipientsPayload', () => {
  it('devolve só os 2 campos, normalizados e sem duplicados', () => {
    expect(
      buildCargoReportRecipientsPayload({
        tecnico: [' A@sqquimica.com', 'a@sqquimica.com', 'b@sqquimica.com'],
        faturamento: [],
      })
    ).toEqual({ tecnico: ['a@sqquimica.com', 'b@sqquimica.com'], faturamento: [] })
  })

  it('campos ausentes viram listas vazias', () => {
    expect(buildCargoReportRecipientsPayload({})).toEqual({ tecnico: [], faturamento: [] })
  })

  it('lança em e-mail inválido', () => {
    expect(() => buildCargoReportRecipientsPayload({ tecnico: ['x@gmail.com'], faturamento: [] })).toThrow()
    expect(() => buildCargoReportRecipientsPayload({ tecnico: [], faturamento: ['joão@sqquimica.com'] })).toThrow()
  })

  it('lança acima de 50 itens', () => {
    const tooMany = Array.from({ length: 51 }, (_, index) => `user${index}@sqquimica.com`)
    expect(() => buildCargoReportRecipientsPayload({ tecnico: tooMany, faturamento: [] })).toThrow()
  })
})
