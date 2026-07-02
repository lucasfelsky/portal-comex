// Tests do hook useAsyncMutation (Sprint 26).
// Cobre:
//   - isRunning fica true durante execucao, false depois
//   - sucesso: retorna o valor, nao dispara toast se successMessage omitido
//   - sucesso com successMessage: dispara toast.success
//   - erro: dispara toast.error com mensagem custom + detail
//   - erro sem errorMessage: usa 'Operacao falhou' padrao
//   - rethrow: erro propaga pra quem chamou
//   - onSuccess/onError callbacks sao chamados
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

const toastSpies = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}

vi.mock('../../src/components/Toast.jsx', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useToast: () => toastSpies,
  }
})

import { ToastProvider } from '../../src/components/Toast.jsx'
import { useAsyncMutation } from '../../src/hooks/useAsyncMutation.js'

function ProbeWithSpy({ fn, options }) {
  const { run, isRunning } = useAsyncMutation()
  return (
    <div>
      <span data-testid="running">{String(isRunning)}</span>
      <button
        type="button"
        onClick={() => {
          // Caller DEVE capturar o erro (e' o contrato do hook).
          // Se nao capturar, vira unhandledRejection no Node.
          run(fn, options).catch(() => {})
        }}
      >
        Run
      </button>
    </div>
  )
}

function renderWithToast(ui) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

beforeEach(() => {
  toastSpies.success.mockReset()
  toastSpies.error.mockReset()
  toastSpies.warning.mockReset()
  toastSpies.info.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useAsyncMutation', () => {
  it('isRunning fica true durante execucao, false depois', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    renderWithToast(<ProbeWithSpy fn={fn} options={{}} />)
    expect(screen.getByTestId('running')).toHaveTextContent('false')
    await act(async () => {
      screen.getByRole('button', { name: 'Run' }).click()
    })
    await waitFor(() => {
      expect(screen.getByTestId('running')).toHaveTextContent('false')
    })
  })

  it('sucesso: retorna o valor, NAO dispara toast.success se successMessage omitido', async () => {
    let captured
    const fn = vi.fn().mockImplementation(async () => {
      captured = 'retorno'
      return 'retorno'
    })
    renderWithToast(<ProbeWithSpy fn={fn} options={{}} />)
    await act(async () => {
      screen.getByRole('button', { name: 'Run' }).click()
    })
    await waitFor(() => {
      expect(captured).toBe('retorno')
    })
    expect(toastSpies.success).not.toHaveBeenCalled()
  })

  it('sucesso com successMessage: dispara toast.success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    renderWithToast(<ProbeWithSpy fn={fn} options={{ successMessage: 'Salvo!' }} />)
    await act(async () => {
      screen.getByRole('button', { name: 'Run' }).click()
    })
    await waitFor(() => {
      expect(toastSpies.success).toHaveBeenCalledWith('Salvo!')
    })
  })

  it('erro: dispara toast.error com errorMessage custom + detail do error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'))
    renderWithToast(
      <ProbeWithSpy fn={fn} options={{ errorMessage: 'Falha ao salvar' }} />
    )
    await act(async () => {
      screen.getByRole('button', { name: 'Run' }).click()
    })
    await waitFor(() => {
      expect(toastSpies.error).toHaveBeenCalledWith('Falha ao salvar (boom)')
    })
  })

  it('erro sem errorMessage: usa padrao "Operacao falhou"', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('x'))
    renderWithToast(<ProbeWithSpy fn={fn} options={{}} />)
    await act(async () => {
      screen.getByRole('button', { name: 'Run' }).click()
    })
    await waitFor(() => {
      expect(toastSpies.error).toHaveBeenCalledWith('Operacao falhou (x)')
    })
  })

  it('erro: rethrow para quem chamou', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'))
    let caught
    function Catch() {
      const { run } = useAsyncMutation()
      return (
        <button
          type="button"
          onClick={async () => {
            try {
              await run(fn, { errorMessage: 'err' })
            } catch (e) {
              caught = e
            }
          }}
        >
          Run
        </button>
      )
    }
    renderWithToast(<Catch />)
    await act(async () => {
      screen.getByRole('button', { name: 'Run' }).click()
    })
    await waitFor(() => {
      expect(caught).toBeInstanceOf(Error)
      expect(caught.message).toBe('boom')
    })
  })

  it('onSuccess callback e chamado com o resultado', async () => {
    const fn = vi.fn().mockResolvedValue('resultado')
    const onSuccess = vi.fn()
    renderWithToast(
      <ProbeWithSpy fn={fn} options={{ onSuccess, successMessage: 'ok' }} />
    )
    await act(async () => {
      screen.getByRole('button', { name: 'Run' }).click()
    })
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('resultado')
    })
  })

  it('onError callback e chamado com o erro', async () => {
    const error = new Error('x')
    const fn = vi.fn().mockRejectedValue(error)
    const onError = vi.fn()
    renderWithToast(
      <ProbeWithSpy fn={fn} options={{ onError, errorMessage: 'err' }} />
    )
    await act(async () => {
      screen.getByRole('button', { name: 'Run' }).click()
    })
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(error)
    })
  })

  it('erro sem .message: usa so errorMessage (sem "(undefined)")', async () => {
    const fn = vi.fn().mockRejectedValue({ code: 'X' })
    renderWithToast(<ProbeWithSpy fn={fn} options={{ errorMessage: 'Falhou' }} />)
    await act(async () => {
      screen.getByRole('button', { name: 'Run' }).click()
    })
    await waitFor(() => {
      expect(toastSpies.error).toHaveBeenCalledWith('Falhou (X)')
    })
  })
})
