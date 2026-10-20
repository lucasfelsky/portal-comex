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
//   - Banner da leitura da Praticagem ZP21 (origem, texto do site, aplicado automaticamente)
//   - Alerta de falha da última leitura / leitura velha (8 h)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const mockUseAuth = vi.fn()
const mockGetBarStatus = vi.fn()
const mockGetBarSuggestion = vi.fn()
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
  getBarSuggestion: (...args) => mockGetBarSuggestion(...args),
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
  mockGetBarSuggestion.mockReset()
  mockSaveBarStatus.mockReset()
  mockUseAuth.mockReturnValue({ profile: PROFILE })
  mockGetBarStatus.mockResolvedValue(BAR_STATUS)
  mockGetBarSuggestion.mockResolvedValue(null)
  mockSaveBarStatus.mockImplementation((draft) => Promise.resolve({ ...BAR_STATUS, ...draft }))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AdminBarStatusPanel', () => {
  it('loading inicial: mostra skeleton', () => {
    let resolveGet
    mockGetBarStatus.mockReturnValue(new Promise((r) => { resolveGet = r }))
    const { container } = renderPanel()
    expect(container.querySelector('.skeleton')).toBeTruthy()
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

  describe('banner de sugestão (F13)', () => {
    const SUGGESTION_DIFF = {
      status: 'IMPRATICAVEL',
      label: 'IMPRATICAVEL',
      tone: 'danger',
      sourceName: 'Praticagem ZP21',
      sourceUrl: 'https://praticoszp21.com.br/',
      fetchedAt: new Date().toISOString(),
      siteDescription: '',
      restriction: '',
      lastAttemptAt: new Date().toISOString(),
      lastSuccessAt: new Date().toISOString(),
      lastError: '',
      lastErrorStage: '',
      lastAppliedAt: null,
    }

    function hoursAgoIso(hours) {
      return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
    }

    function minutesAgoIso(minutes) {
      return new Date(Date.now() - minutes * 60 * 1000).toISOString()
    }

    it('sem sugestão: não renderiza banner nem botão Aplicar', async () => {
      renderPanel()
      await waitFor(() => {
        expect(screen.getByDisplayValue('PRATICAVEL')).toBeInTheDocument()
      })
      expect(document.querySelector('.suggestion-banner')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Aplicar' })).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('sugestão diferente do atual: mostra banner + fonte + aviso de override + botão Aplicar', async () => {
      mockGetBarSuggestion.mockResolvedValueOnce(SUGGESTION_DIFF)
      renderPanel()
      await waitFor(() => {
        expect(document.querySelector('.suggestion-banner')).toBeInTheDocument()
      })
      expect(screen.getByText(/Praticagem ZP21/)).toBeInTheDocument()
      expect(screen.getByText(/Status manual difere do site/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Aplicar' })).toBeInTheDocument()
      // o label do site aparece no banner (além do badge de status atual)
      expect(document.querySelector('.suggestion-banner .status-tag--danger')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('ordem: select "Status atual" -> botão Salvar -> banner de sugestão', async () => {
      mockGetBarSuggestion.mockResolvedValueOnce(SUGGESTION_DIFF)
      renderPanel()
      await waitFor(() => {
        expect(document.querySelector('.suggestion-banner')).toBeInTheDocument()
      })
      const select = screen.getByText('Status atual')
      const salvar = screen.getByRole('button', { name: 'Salvar status da barra' })
      const banner = document.querySelector('.suggestion-banner')
      expect(select.compareDocumentPosition(salvar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(salvar.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('Aplicar chama saveBarStatus com o status do site + profile', async () => {
      const user = userEvent.setup()
      mockGetBarSuggestion.mockResolvedValueOnce(SUGGESTION_DIFF)
      renderPanel()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Aplicar' })).toBeInTheDocument()
      })
      await user.click(screen.getByRole('button', { name: 'Aplicar' }))
      await waitFor(() => {
        expect(mockSaveBarStatus).toHaveBeenCalledTimes(1)
      })
      const [draftArg, profileArg] = mockSaveBarStatus.mock.calls[0]
      expect(draftArg.status).toBe('IMPRATICAVEL')
      expect(profileArg).toEqual(PROFILE)
    })

    it('sugestão igual ao atual: mostra "Coincide" e esconde Aplicar', async () => {
      mockGetBarSuggestion.mockResolvedValueOnce({
        ...SUGGESTION_DIFF,
        status: 'PRATICAVEL',
        label: 'PRATICAVEL',
        tone: 'ok',
      })
      renderPanel()
      await waitFor(() => {
        expect(document.querySelector('.suggestion-banner')).toBeInTheDocument()
      })
      expect(screen.getByText(/Coincide com o status atual/i)).toBeInTheDocument()
      expect(screen.queryByText(/Aplicado automaticamente/i)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Aplicar' })).not.toBeInTheDocument()
    })

    it('sugestão igual ao atual com lastAppliedAt: mostra "Coincide" e "Aplicado automaticamente"', async () => {
      mockGetBarSuggestion.mockResolvedValueOnce({
        ...SUGGESTION_DIFF,
        status: 'PRATICAVEL',
        label: 'PRATICAVEL',
        tone: 'ok',
        lastAppliedAt: minutesAgoIso(5),
      })
      renderPanel()
      await waitFor(() => {
        expect(screen.getByText(/Coincide com o status atual/i)).toBeInTheDocument()
      })
      expect(screen.getByText(/Aplicado automaticamente/i)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Aplicar' })).not.toBeInTheDocument()
    })

    it('sugestão igual ao atual com data de aplicação inválida: só "Coincide", sem "Aplicado automaticamente ."', async () => {
      mockGetBarSuggestion.mockResolvedValueOnce({
        ...SUGGESTION_DIFF,
        status: 'PRATICAVEL',
        label: 'PRATICAVEL',
        tone: 'ok',
        lastAppliedAt: 'nao-e-uma-data',
      })
      renderPanel()
      await waitFor(() => {
        expect(screen.getByText(/Coincide com o status atual/i)).toBeInTheDocument()
      })
      expect(screen.queryByText(/Aplicado automaticamente/i)).not.toBeInTheDocument()
    })

    it('mostra o texto do site e a restrição', async () => {
      mockGetBarSuggestion.mockResolvedValueOnce({
        ...SUGGESTION_DIFF,
        siteDescription: 'Impraticável',
        restriction: 'Correnteza',
      })
      renderPanel()
      await waitFor(() => {
        expect(screen.getByText(/Texto do site: Impraticável/)).toBeInTheDocument()
      })
      expect(screen.getByText(/restrição: Correnteza/)).toBeInTheDocument()
    })

    it('última leitura falhou (lastAttemptAt > lastSuccessAt): alerta com o erro', async () => {
      mockGetBarSuggestion.mockResolvedValueOnce({
        ...SUGGESTION_DIFF,
        lastSuccessAt: minutesAgoIso(60),
        lastAttemptAt: minutesAgoIso(2),
        lastError: 'Falha ao baixar a página da praticagem (HTTP 500).',
        lastErrorStage: 'fetch-page',
      })
      renderPanel()
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Falha na última leitura')
      expect(alert).toHaveTextContent('Falha ao baixar a página da praticagem (HTTP 500)')
      expect(alert).toHaveTextContent('O status abaixo pode estar desatualizado')
      // o banner da última leitura boa continua visível
      expect(document.querySelector('.suggestion-banner')).toBeInTheDocument()
    })

    it('última leitura bem-sucedida há 9 h, sem erro: alerta de leitura velha', async () => {
      mockGetBarSuggestion.mockResolvedValueOnce({
        ...SUGGESTION_DIFF,
        lastSuccessAt: hoursAgoIso(9),
        lastAttemptAt: hoursAgoIso(9),
      })
      renderPanel()
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('A última leitura bem-sucedida')
      expect(alert).toHaveTextContent('Praticagem ZP21')
    })

    it('última leitura bem-sucedida há 10 min, sem erro: nenhum alerta', async () => {
      mockGetBarSuggestion.mockResolvedValueOnce({
        ...SUGGESTION_DIFF,
        lastSuccessAt: minutesAgoIso(10),
        lastAttemptAt: minutesAgoIso(10),
      })
      renderPanel()
      await waitFor(() => {
        expect(document.querySelector('.suggestion-banner')).toBeInTheDocument()
      })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('suggestion só com campos de falha (status null): alerta aparece, banner e Aplicar não', async () => {
      mockGetBarSuggestion.mockResolvedValueOnce({
        status: null,
        label: null,
        tone: null,
        sourceName: 'Fonte externa',
        sourceUrl: '',
        fetchedAt: null,
        siteDescription: '',
        restriction: '',
        lastAttemptAt: minutesAgoIso(1),
        lastSuccessAt: null,
        lastError: 'Variável cond_barra não encontrada na página da praticagem.',
        lastErrorStage: 'parse-status',
        lastAppliedAt: null,
      })
      renderPanel()
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Falha na última leitura')
      expect(alert).toHaveTextContent('cond_barra')
      expect(document.querySelector('.suggestion-banner')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Aplicar' })).not.toBeInTheDocument()
    })

    it('erro ao ler sugestão: painel segue funcional, sem banner nem alerta', async () => {
      mockGetBarSuggestion.mockRejectedValueOnce(new Error('boom'))
      renderPanel()
      await waitFor(() => {
        expect(screen.getByDisplayValue('PRATICAVEL')).toBeInTheDocument()
      })
      expect(document.querySelector('.suggestion-banner')).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      // erro de sugestão NÃO polui o error-banner do status
      expect(screen.queryByText(/Não foi possível/i)).not.toBeInTheDocument()
    })
  })
})
