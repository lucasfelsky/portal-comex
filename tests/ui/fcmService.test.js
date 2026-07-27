// Testes de src/services/fcmService.js.
//
// Antes desta suite, fcmService.js nao tinha nenhum teste proprio — os
// testes de useFcm mockam o modulo inteiro (vi.mock('.../fcmService')),
// entao o bug real (getToken chamado com uma ServiceWorkerRegistration
// ainda nao ativa) nunca passava por nenhum teste.
//
// Bug de producao achado em 2026-07-24 (com o diagnostico do PR #134):
// `getFcmToken()` chamava `navigator.serviceWorker.register(...)` e usava
// o registration retornado DIRETO, mas `register()` resolve assim que o
// registro COMECA (worker em "installing"), nao quando fica ativo. Na
// primeira visita (sem SW controlando a pagina), `pushManager.subscribe()`
// (chamado dentro de `getToken`) exige um worker ATIVO e falhava com
// `AbortError: ... Subscription failed - no active Service Worker`. Antes
// do fix do PR #134 esse erro tecnico virava "permissao nao concedida" na
// UI, mascarando a causa por semanas.
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetToken = vi.fn()
const mockIsSupported = vi.fn(async () => true)
const mockGetMessaging = vi.fn(() => ({ __messaging: true }))

vi.mock('firebase/messaging', () => ({
  isSupported: (...args) => mockIsSupported(...args),
  getMessaging: (...args) => mockGetMessaging(...args),
  getToken: (...args) => mockGetToken(...args),
  onMessage: vi.fn(() => () => {}),
  deleteToken: vi.fn(async () => true),
}))

vi.mock('../../src/lib/firebase', () => ({
  app: { __app: true },
}))

// Registration "crua" (o que register() resolve — pode nao estar ativa
// ainda) vs a registration "pronta" (o que serviceWorker.ready resolve —
// so' existe quando ha' um worker ativo). Sao objetos DIFERENTES de
// propósito: o teste prova que getToken() recebe a PRONTA, nao a crua.
const RAW_REGISTRATION = { scope: '/', __raw: true }
const READY_REGISTRATION = { scope: '/', __ready: true }

describe('fcmService', () => {
  let fcmService

  beforeEach(async () => {
    vi.resetModules()
    mockGetToken.mockReset()
    mockIsSupported.mockReset().mockResolvedValue(true)
    mockGetMessaging.mockReset().mockReturnValue({ __messaging: true })

    vi.stubEnv('VITE_FCM_VAPID_KEY', 'test-vapid-key')

    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: vi.fn(async () => RAW_REGISTRATION),
        ready: Promise.resolve(READY_REGISTRATION),
      },
    })

    fcmService = await import('../../src/services/fcmService.js')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('getFcmToken espera o service worker ficar ATIVO antes de chamar getToken (regressão)', async () => {
    mockGetToken.mockResolvedValue('fcm-token-abc')

    const token = await fcmService.getFcmToken()

    expect(token).toBe('fcm-token-abc')
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/firebase-messaging-sw.js')
    expect(mockGetToken).toHaveBeenCalledTimes(1)

    const [, options] = mockGetToken.mock.calls[0]
    // O ponto central do bug: getToken() tem que receber a registration
    // PRONTA (serviceWorker.ready), nao a crua de register(). Se este
    // assert falhar comparando com RAW_REGISTRATION, o bug voltou.
    expect(options.serviceWorkerRegistration).toBe(READY_REGISTRATION)
    expect(options.serviceWorkerRegistration).not.toBe(RAW_REGISTRATION)
    expect(options.vapidKey).toBe('test-vapid-key')
  })

  it('propaga null e loga quando getToken rejeita (ex.: AbortError de subscribe sem SW ativo)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetToken.mockRejectedValue(
      new DOMException(
        "Failed to execute 'subscribe' on 'PushManager': Subscription failed - no active Service Worker",
        'AbortError'
      )
    )

    const token = await fcmService.getFcmToken()

    expect(token).toBeNull()
    expect(consoleError).toHaveBeenCalledWith(
      'Falha ao obter token FCM.',
      expect.any(DOMException)
    )
  })

  it('getFcmToken retorna null sem tentar nada quando FCM nao e suportado', async () => {
    mockIsSupported.mockResolvedValue(false)

    const token = await fcmService.getFcmToken()

    expect(token).toBeNull()
    expect(navigator.serviceWorker.register).not.toHaveBeenCalled()
    expect(mockGetToken).not.toHaveBeenCalled()
  })
})
