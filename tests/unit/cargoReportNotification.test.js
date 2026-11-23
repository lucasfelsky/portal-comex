// Notificacao "Relatorio de Carga": logica PURA de texto e destinatarios
// (`functions/src/process/cargoReportNotification.js`, sem mocks).

import { describe, expect, it } from 'vitest'

import {
  CARGO_REPORT_NOTIFICATION_BODY,
  CARGO_REPORT_NOTIFICATION_TYPE,
  buildCargoReportNotificationTitle,
  normalizeCargoReportRecipientsConfig,
  planCargoReportRecipients,
} from '../../functions/src/process/cargoReportNotification.js'

const isCorporateEmail = (email) => String(email ?? '').trim().toLowerCase().endsWith('@sqquimica.com')

describe('texto da notificacao', () => {
  it('tipo e corpo EXATOS (pedido literal do Comex)', () => {
    expect(CARGO_REPORT_NOTIFICATION_TYPE).toBe('process_cargo_report_uploaded')
    expect(CARGO_REPORT_NOTIFICATION_BODY).toBe(
      'Relatório de Carga preenchido e disponível no Portal COMEX. Documentação necessária para emissão do COA está disponível na pasta do processo.'
    )
  })

  it('titulo carrega o rotulo do processo', () => {
    expect(buildCargoReportNotificationTitle('PO 12345')).toBe('Relatório de Carga disponível: PO 12345')
    expect(buildCargoReportNotificationTitle('Resina Atlas')).toBe(
      'Relatório de Carga disponível: Resina Atlas'
    )
  })
})

describe('normalizeCargoReportRecipientsConfig', () => {
  it('normaliza maiusculas/espacos e remove duplicados por lista', () => {
    const result = normalizeCargoReportRecipientsConfig(
      {
        tecnico: ['  Tecnico@SQQuimica.com ', 'tecnico@sqquimica.com', 'outro@sqquimica.com'],
        faturamento: ['FISCAL@sqquimica.com'],
      },
      isCorporateEmail
    )
    expect(result.tecnico).toEqual(['tecnico@sqquimica.com', 'outro@sqquimica.com'])
    expect(result.faturamento).toEqual(['fiscal@sqquimica.com'])
    expect(result.ignoredNonCorporate).toBe(0)
  })

  it('ignora itens nao-string e vazios', () => {
    const result = normalizeCargoReportRecipientsConfig(
      { tecnico: [42, null, undefined, { email: 'x@sqquimica.com' }, '', '   ', 'ok@sqquimica.com'] },
      isCorporateEmail
    )
    expect(result.tecnico).toEqual(['ok@sqquimica.com'])
    expect(result.ignoredNonCorporate).toBe(0)
  })

  it('nao-corporativo e descartado e contado em ignoredNonCorporate', () => {
    const result = normalizeCargoReportRecipientsConfig(
      {
        tecnico: ['externo@gmail.com', 'ok@sqquimica.com'],
        faturamento: ['fiscal@outraempresa.com.br'],
      },
      isCorporateEmail
    )
    expect(result.tecnico).toEqual(['ok@sqquimica.com'])
    expect(result.faturamento).toEqual([])
    expect(result.ignoredNonCorporate).toBe(2)
  })

  it('doc ausente (undefined/null) ou campos nao-array -> listas vazias', () => {
    for (const raw of [undefined, null, 'texto', 7, {}, { tecnico: 'a@sqquimica.com', faturamento: { 0: 'b' } }]) {
      expect(normalizeCargoReportRecipientsConfig(raw, isCorporateEmail)).toEqual({
        tecnico: [],
        faturamento: [],
        ignoredNonCorporate: 0,
      })
    }
  })

  it('teto de 50 e-mails por lista', () => {
    const many = Array.from({ length: 80 }, (_, index) => `user${index}@sqquimica.com`)
    const result = normalizeCargoReportRecipientsConfig({ tecnico: many, faturamento: many }, isCorporateEmail)
    expect(result.tecnico).toHaveLength(50)
    expect(result.faturamento).toHaveLength(50)
    expect(result.tecnico[0]).toBe('user0@sqquimica.com')
    expect(result.tecnico[49]).toBe('user49@sqquimica.com')
  })
})

describe('planCargoReportRecipients', () => {
  const admin1 = { id: 'admin-1', role: 'admin', status: 'Ativo', email: 'admin1@sqquimica.com' }
  const admin2 = { id: 'admin-2', role: 'admin', status: 'Ativo', email: 'admin2@sqquimica.com' }
  const logi1 = { id: 'logi-1', role: 'logistica', status: 'Ativo', email: 'logi@sqquimica.com' }
  const tec1 = { id: 'tec-1', role: 'user', status: 'Ativo', email: 'tecnico@sqquimica.com' }
  const fis1 = { id: 'fis-1', role: 'user', status: 'Bloqueado', email: 'fiscal@sqquimica.com' }

  const usersByEmail = new Map([
    [tec1.email, tec1],
    [fis1.email, fis1],
    [logi1.email, logi1],
  ])

  it('une admins + logistica e dedupe por id (usuario em 2 grupos = 1 entrada)', () => {
    const { userRecipients, directEmails } = planCargoReportRecipients({
      admins: [admin1, admin2],
      logistics: [logi1],
      configEmails: ['logi@sqquimica.com'],
      usersByEmail,
      actorUserId: '',
    })
    expect(userRecipients.map((user) => user.id)).toEqual(['admin-1', 'admin-2', 'logi-1'])
    expect(directEmails).toEqual([])
  })

  it('exclui o ator', () => {
    const { userRecipients } = planCargoReportRecipients({
      admins: [admin1, admin2],
      logistics: [logi1],
      configEmails: [],
      usersByEmail,
      actorUserId: 'admin-1',
    })
    expect(userRecipients.map((user) => user.id)).toEqual(['admin-2', 'logi-1'])
  })

  it('usuario ATIVO da config entra em userRecipients', () => {
    const { userRecipients, directEmails } = planCargoReportRecipients({
      admins: [admin2],
      logistics: [],
      configEmails: ['tecnico@sqquimica.com'],
      usersByEmail,
      actorUserId: 'admin-1',
    })
    expect(userRecipients.map((user) => user.id)).toEqual(['admin-2', 'tec-1'])
    expect(directEmails).toEqual([])
  })

  it('usuario da config encontrado mas INATIVO some das duas listas (D5)', () => {
    const { userRecipients, directEmails } = planCargoReportRecipients({
      admins: [],
      logistics: [],
      configEmails: ['fiscal@sqquimica.com'],
      usersByEmail,
      actorUserId: '',
    })
    expect(userRecipients).toEqual([])
    expect(directEmails).toEqual([])
  })

  it('e-mail da config SEM usuario vai para directEmails (ordenado, sem duplicar)', () => {
    const { userRecipients, directEmails } = planCargoReportRecipients({
      admins: [],
      logistics: [],
      configEmails: ['zeta@sqquimica.com', 'alfa@sqquimica.com', 'zeta@sqquimica.com'],
      usersByEmail,
      actorUserId: '',
    })
    expect(userRecipients).toEqual([])
    expect(directEmails).toEqual(['alfa@sqquimica.com', 'zeta@sqquimica.com'])
  })

  it('ordem de userRecipients e deterministica (por id)', () => {
    const { userRecipients } = planCargoReportRecipients({
      admins: [admin2, admin1],
      logistics: [logi1],
      configEmails: ['tecnico@sqquimica.com'],
      usersByEmail,
      actorUserId: '',
    })
    expect(userRecipients.map((user) => user.id)).toEqual(['admin-1', 'admin-2', 'logi-1', 'tec-1'])
  })
})
