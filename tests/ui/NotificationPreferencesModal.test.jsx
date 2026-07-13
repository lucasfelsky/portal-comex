// F9 (backlog 2026-07-12): modal de preferências de notificação.
//   - default LIGADO quando stored é null
//   - false explícito desliga só aquela célula
//   - salvar persiste o draft via saveNotificationPreferences
//   - ligar push com permissão ausente chama fcm.enable() (gesto do usuário)
//   - push desabilitado quando fcm.supported = false
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockSavePreferences = vi.fn()
vi.mock('../../src/services/usersRepository', () => ({
  saveNotificationPreferences: (...args) => mockSavePreferences(...args),
}))

import { ToastProvider } from '../../src/components/Toast'
import NotificationPreferencesModal, {
  buildEffectivePreferences,
} from '../../src/components/NotificationPreferencesModal'

function renderModal({ profile, fcm } = {}) {
  const onClose = vi.fn()
  const utils = render(
    <ToastProvider>
      <NotificationPreferencesModal
        open
        onClose={onClose}
        profile={profile ?? { uid: 'u-1', notificationPreferences: null }}
        fcm={fcm ?? { supported: true, status: 'idle', enable: vi.fn(), disable: vi.fn() }}
      />
    </ToastProvider>
  )
  return { onClose, ...utils }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSavePreferences.mockResolvedValue(true)
})

describe('buildEffectivePreferences', () => {
  it('null -> tudo ligado (default)', () => {
    const prefs = buildEffectivePreferences(null)
    expect(prefs.processos.inApp).toBe(true)
    expect(prefs.noticias.email).toBe(true)
    expect(prefs.suporte.push).toBe(true)
  })

  it('false explicito desliga so a celula', () => {
    const prefs = buildEffectivePreferences({ noticias: { email: false } })
    expect(prefs.noticias.email).toBe(false)
    expect(prefs.noticias.inApp).toBe(true)
    expect(prefs.processos.email).toBe(true)
  })
})

describe('NotificationPreferencesModal', () => {
  it('renderiza o grid 3 tipos x 3 canais, tudo marcado por default', () => {
    renderModal()

    expect(screen.getByText('Preferências de notificação')).toBeInTheDocument()
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(9)
    expect(checkboxes.every((box) => box.checked)).toBe(true)
  })

  it('desmarcar uma celula e salvar persiste o draft', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await user.click(screen.getByRole('checkbox', { name: 'Notícias: E-mail' }))
    await user.click(screen.getByRole('button', { name: 'Salvar preferências' }))

    await waitFor(() => expect(mockSavePreferences).toHaveBeenCalledTimes(1))
    const [uid, prefs] = mockSavePreferences.mock.calls[0]
    expect(uid).toBe('u-1')
    expect(prefs.noticias.email).toBe(false)
    expect(prefs.noticias.inApp).toBe(true)
    expect(onClose).toHaveBeenCalled()
  })

  it('salvar com push ligado e permissao ausente chama fcm.enable()', async () => {
    const user = userEvent.setup()
    const enable = vi.fn().mockResolvedValue('tok-1')
    renderModal({ fcm: { supported: true, status: 'idle', enable, disable: vi.fn() } })

    await user.click(screen.getByRole('button', { name: 'Salvar preferências' }))

    await waitFor(() => expect(enable).toHaveBeenCalledTimes(1))
    expect(mockSavePreferences).toHaveBeenCalled()
  })

  it('desligar TODOS os push e salvar chama fcm.disable()', async () => {
    const user = userEvent.setup()
    const disable = vi.fn().mockResolvedValue(true)
    renderModal({ fcm: { supported: true, status: 'granted', enable: vi.fn(), disable } })

    await user.click(screen.getByRole('checkbox', { name: 'Processos: Navegador' }))
    await user.click(screen.getByRole('checkbox', { name: 'Notícias: Navegador' }))
    await user.click(screen.getByRole('checkbox', { name: 'Suporte: Navegador' }))
    await user.click(screen.getByRole('button', { name: 'Salvar preferências' }))

    await waitFor(() => expect(disable).toHaveBeenCalledTimes(1))
  })

  it('fcm nao suportado: coluna Navegador desabilitada + aviso', () => {
    renderModal({ fcm: { supported: false, status: 'unsupported', enable: vi.fn(), disable: vi.fn() } })

    expect(screen.getByRole('checkbox', { name: 'Processos: Navegador' })).toBeDisabled()
    expect(
      screen.getByText(/não estão disponíveis neste dispositivo/i)
    ).toBeInTheDocument()
  })
})
