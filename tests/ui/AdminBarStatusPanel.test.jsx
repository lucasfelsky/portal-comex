// Tests do AdminBarStatusPanel.
// Cobre:
//   - Loading inicial: "Carregando status da barra"
//   - Error ao carregar: error-banner
//   - Render: badge de status atual (label + tone class) com meta carregada
//   - Select com 3 opcoes (PRATICAVEL, PRATICAVEL_RESTRICOES, IMPRATICAVEL)
//   - Trocar status no select reflete no draft
//   - Salvar: chama saveBarStatus com draft + profile
//   - Salvar com erro: error-banner
//   - Salvar sem mudar nada: saveBarStatus chamado com os valores atuais
//   - Submit desabilitado enquanto submitting (mostra "Salvando...")

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const mockUseAuth = vi.fn()
const mockGetBarStatus = vi.fn()
const mockSaveBarStatus = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))
vi.mock('../../src/lib/firebase', () => ({
  isFirebaseConfigured: false,
}))
vi.mock('../../src/services/barStatusRepository', () => ({
  BAR_STATUS_OPTIONS: [
    { value: 'PRATICAVEL', label: 'PRATICAVEL', tone: 'ok' },
    { value: 'PRATICAVEL_RESTRICOES', label: 'PRATICAVEL C/ RESTRICOES', tone: 'warn' },
    { value: 'IMPRATICAVEL', label: 'IMPRATICAVEL', tone: 'danger' },
  ],
  getBarStatus: (...args) => mockGetBarStatus(...args),
  saveBarStatus: (...args) => mockSaveBarStatus(...args),
}))

import AdminBarStatusPanel from '../../src/features/admin/AdminBarStatusPanel'

const PROFILE = { uid: 'admin-1', name: 'Admin', email: 'admin@sqquimica.com', role: 'admin' }

const BAR_STATUS = {
  id: 'current',
  status: 'PRATICAVEL',
  label: 'PRATICAVEL',
  tone: 'ok',
  notes: 'Sem apontamentos operacionais no momento.',
  updatedAt: '2026-06-30T10:00:00Z',
}

function renderPanel() {
  return render(<AdminBarStatusPanel />)
}

beforeEach(() => {
  mockUseAuth.mockReset()
  mockGetBarStatus.mockReset()
  mockSaveBarStatus.mockReset()
  mockUseAuth.mockReturnValue({ profile: PROFILE })
  mockGetBarStatus.mockResolvedValue(BAR_STATUS)
  mockSaveBarStatus.mockImplementation((draft) => Promise.resolve({ ...BAR_STATUS, ...draft }))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AdminBarStatusPanel', () => {
  it('loading inicial: mostra "Carregando status da barra"', () => {
    let resolveGet
    mockGetBarStatus.mockReturnValue(new Promise((r) => { resolveGet = r }))
    renderPanel()
    expect(screen.getByText(/Carregando status da barra/i)).toBeInTheDocument()
    resolveGet(BAR_STATUS)
  })

  it('error ao carregar aparece no error-banner', async () => {
    mockGetBarStatus.mockRejectedValueOnce(new Error('boom'))
    renderPanel()
    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar o status da barra/i)).toBeInTheDocument()
    })
  })

  it('render: badge de status atual com tone class', async () => {
    renderPanel()
    await waitFor(() => {
      const badge = document.querySelector('.status-tag--ok')
      expect(badge).toBeInTheDocument()
      expect(badge.textContent).toBe('PRATICAVEL')
    })
  })

  it('select tem 3 opcoes (PRATICAVEL, PRATICAVEL_RESTRICOES, IMPRATICAVEL)', async () => {
    renderPanel()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'PRATICAVEL' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'PRATICAVEL C/ RESTRICOES' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'IMPRATICAVEL' })).toBeInTheDocument()
    })
  })

  it('trocar status no select reflete no draft', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => {
      expect(screen.getByDisplayValue('PRATICAVEL')).toBeInTheDocument()
    })
    const select = screen.getByRole('combobox')
    await user.selectOptions(select, 'IMPRATICAVEL')
    expect(screen.getByDisplayValue('IMPRATICAVEL')).toBeInTheDocument()
  })

  it('salvar: chama saveBarStatus com draft + profile', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => {
      expect(screen.getByDisplayValue('PRATICAVEL')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Salvar status da barra/i }))
    await waitFor(() => {
      expect(mockSaveBarStatus).toHaveBeenCalledTimes(1)
    })
    const [draftArg, profileArg] = mockSaveBarStatus.mock.calls[0]
    expect(profileArg).toEqual(PROFILE)
    expect(draftArg.status).toBe('PRATICAVEL')
  })

  it('salvar com erro: error-banner', async () => {
    const user = userEvent.setup()
    mockSaveBarStatus.mockRejectedValueOnce(new Error('boom'))
    renderPanel()
    await waitFor(() => {
      expect(screen.getByDisplayValue('PRATICAVEL')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Salvar status da barra/i }))
    await waitFor(() => {
      expect(screen.getByText(/Não foi possível salvar o status da barra/i)).toBeInTheDocument()
    })
  })

  it('salvar com status alterado: passa novo valor', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => {
      expect(screen.getByDisplayValue('PRATICAVEL')).toBeInTheDocument()
    })
    await user.selectOptions(screen.getByRole('combobox'), 'PRATICAVEL_RESTRICOES')
    await user.click(screen.getByRole('button', { name: /Salvar status da barra/i }))
    await waitFor(() => {
      expect(mockSaveBarStatus).toHaveBeenCalled()
    })
    const lastCall = mockSaveBarStatus.mock.calls[mockSaveBarStatus.mock.calls.length - 1]
    expect(lastCall[0].status).toBe('PRATICAVEL_RESTRICOES')
  })

  it('submit desabilitado enquanto submitting (mostra "Salvando...")', async () => {
    const user = userEvent.setup()
    let resolveSave
    mockSaveBarStatus.mockReturnValueOnce(new Promise((r) => { resolveSave = r }))
    renderPanel()
    await waitFor(() => {
      expect(screen.getByDisplayValue('PRATICAVEL')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Salvar status da barra/i }))
    expect(screen.getByRole('button', { name: 'Salvando...' })).toBeDisabled()
    resolveSave(BAR_STATUS)
  })
})
