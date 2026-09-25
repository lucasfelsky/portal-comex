// UX-3a (D9): util unico de mensagem de erro PT-BR. Nao entra na contagem
// `tests.totalFiles` do audit-vault-counts.cjs (soma so tests/firebase +
// tests/functions + tests/ui).
//
// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildActionErrorMessage, getFriendlyErrorDetail } from '../../src/utils/errorMessages'

const TECHNICAL_CODE_PATTERN = /permission-denied|unavailable|storage\//

describe('getFriendlyErrorDetail - mapa de codigos', () => {
  it('permission-denied', () => {
    expect(getFriendlyErrorDetail({ code: 'permission-denied' })).toBe(
      'Você não tem permissão para esta ação.'
    )
  })

  it('firestore/permission-denied (prefixo removido)', () => {
    expect(getFriendlyErrorDetail({ code: 'firestore/permission-denied' })).toBe(
      'Você não tem permissão para esta ação.'
    )
  })

  it('functions/permission-denied sem mensagem PT-BR usa o mapa', () => {
    expect(getFriendlyErrorDetail({ code: 'functions/permission-denied' })).toBe(
      'Você não tem permissão para esta ação.'
    )
  })

  it('unauthenticated', () => {
    expect(getFriendlyErrorDetail({ code: 'unauthenticated' })).toBe(
      'Sua sessão expirou. Entre novamente.'
    )
  })

  it('unavailable', () => {
    expect(getFriendlyErrorDetail({ code: 'unavailable' })).toBe(
      'Sem conexão com o servidor. Verifique a internet e tente novamente.'
    )
  })

  it('auth/network-request-failed', () => {
    expect(getFriendlyErrorDetail({ code: 'auth/network-request-failed' })).toBe(
      'Sem conexão com o servidor. Verifique a internet e tente novamente.'
    )
  })

  it('deadline-exceeded', () => {
    expect(getFriendlyErrorDetail({ code: 'deadline-exceeded' })).toBe(
      'O servidor demorou para responder. Tente novamente.'
    )
  })

  it('not-found', () => {
    expect(getFriendlyErrorDetail({ code: 'not-found' })).toBe(
      'O registro não foi encontrado. Atualize a página.'
    )
  })

  it('already-exists', () => {
    expect(getFriendlyErrorDetail({ code: 'already-exists' })).toBe('Este registro já existe.')
  })

  it('resource-exhausted', () => {
    expect(getFriendlyErrorDetail({ code: 'resource-exhausted' })).toBe(
      'Limite de uso atingido. Aguarde alguns minutos e tente novamente.'
    )
  })

  it('storage/unauthorized', () => {
    expect(getFriendlyErrorDetail({ code: 'storage/unauthorized' })).toBe(
      'Você não tem permissão para enviar este arquivo.'
    )
  })

  it('storage/canceled', () => {
    expect(getFriendlyErrorDetail({ code: 'storage/canceled' })).toBe(
      'O envio do arquivo foi cancelado.'
    )
  })

  it('storage/quota-exceeded', () => {
    expect(getFriendlyErrorDetail({ code: 'storage/quota-exceeded' })).toBe(
      'O espaço de armazenamento está cheio. Avise o administrador.'
    )
  })

  it('storage/retry-limit-exceeded', () => {
    expect(getFriendlyErrorDetail({ code: 'storage/retry-limit-exceeded' })).toBe(
      'O envio do arquivo demorou demais. Tente novamente.'
    )
  })

  it('storage/object-not-found', () => {
    expect(getFriendlyErrorDetail({ code: 'storage/object-not-found' })).toBe(
      'O arquivo não foi encontrado.'
    )
  })

  it('storage/* desconhecido cai no generico de arquivo', () => {
    expect(getFriendlyErrorDetail({ code: 'storage/unknown-thing' })).toBe(
      'Não foi possível enviar o arquivo. Tente novamente.'
    )
  })

  it('nenhuma saida do mapa contem o codigo tecnico cru', () => {
    for (const code of [
      'permission-denied',
      'unavailable',
      'storage/unauthorized',
      'storage/canceled',
      'storage/quota-exceeded',
    ]) {
      const detail = getFriendlyErrorDetail({ code })
      expect(detail).not.toMatch(TECHNICAL_CODE_PATTERN)
    }
  })
})

describe('getFriendlyErrorDetail - excecao callable (functions/*)', () => {
  it('usa a mensagem PT-BR da HttpsError quando o sufixo bate e a mensagem e significativa', () => {
    const error = {
      code: 'functions/failed-precondition',
      message: 'Não é permitido excluir o próprio usuário logado.',
    }
    expect(getFriendlyErrorDetail(error)).toBe(
      'Não é permitido excluir o próprio usuário logado.'
    )
  })

  it('ignora a mensagem quando ela e apenas o sufixo repetido (case-insensitive)', () => {
    const error = { code: 'functions/not-found', message: 'Not-Found' }
    expect(getFriendlyErrorDetail(error)).toBe('O registro não foi encontrado. Atualize a página.')
  })

  it('ignora a mensagem quando ela esta vazia', () => {
    const error = { code: 'functions/unauthenticated', message: '   ' }
    expect(getFriendlyErrorDetail(error)).toBe('Sua sessão expirou. Entre novamente.')
  })

  it('sufixo fora da lista de excecao cai no mapa (prefixo removido)', () => {
    const error = { code: 'functions/internal', message: 'internal' }
    expect(getFriendlyErrorDetail(error)).toBe(GENERIC_FALLBACK())
  })
})

function GENERIC_FALLBACK() {
  return 'Tente novamente em instantes. Se o problema continuar, abra um chamado no Suporte.'
}

describe('getFriendlyErrorDetail - Error do app (sem code)', () => {
  it('usa a mensagem quando e um Error simples com mensagem PT-BR', () => {
    const error = new Error('A planilha enviada está vazia.')
    expect(getFriendlyErrorDetail(error)).toBe('A planilha enviada está vazia.')
  })

  it('TypeError cai no generico (nao usa error.message)', () => {
    const error = new TypeError('Cannot read properties of undefined')
    expect(getFriendlyErrorDetail(error)).toBe(GENERIC_FALLBACK())
  })
})

describe('getFriendlyErrorDetail - outros formatos', () => {
  it('string crua vira a propria string', () => {
    expect(getFriendlyErrorDetail('Falha ao processar.')).toBe('Falha ao processar.')
  })

  it('null cai no generico', () => {
    expect(getFriendlyErrorDetail(null)).toBe(GENERIC_FALLBACK())
  })

  it('objeto sem code/message cai no generico', () => {
    expect(getFriendlyErrorDetail({})).toBe(GENERIC_FALLBACK())
  })

  it('code desconhecido (ex.: internal) cai no generico', () => {
    expect(getFriendlyErrorDetail({ code: 'internal' })).toBe(GENERIC_FALLBACK())
  })
})

describe('buildActionErrorMessage', () => {
  let consoleErrorSpy

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('combina prefixo + detalhe amigavel', () => {
    const error = { code: 'permission-denied' }
    expect(buildActionErrorMessage('Não foi possível salvar o usuário.', error)).toBe(
      'Não foi possível salvar o usuário. Você não tem permissão para esta ação.'
    )
  })

  it('loga o erro tecnico no console exatamente uma vez', () => {
    const error = { code: 'permission-denied' }
    buildActionErrorMessage('Não foi possível salvar o usuário.', error)
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith('Não foi possível salvar o usuário.', error)
  })
})
