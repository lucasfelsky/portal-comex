// Tests do ImportProcessesModal (F11).
// Mocka o parser puro (parseProcessesFromWorkbook — já tem teste próprio em
// importProcesses.test.jsx) pra focar na UI: preview, dedup, confirmar, erro.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const mockParse = vi.fn()
vi.mock('../../src/utils/importProcesses', () => ({
  parseProcessesFromWorkbook: (...args) => mockParse(...args),
}))

import ImportProcessesModal from '../../src/features/processes/ImportProcessesModal'

function makeFile() {
  return new File(['conteudo'], 'processos.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

function getFileInput() {
  return document.querySelector('input[type="file"]')
}

let onClose
let onConfirm

beforeEach(() => {
  mockParse.mockReset()
  onClose = vi.fn()
  onConfirm = vi.fn().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

function renderModal(props = {}) {
  return render(
    <ImportProcessesModal
      open
      onClose={onClose}
      existingProcessNumbers={new Set(['FCL-EXISTE'])}
      onConfirm={onConfirm}
      {...props}
    />
  )
}

describe('ImportProcessesModal', () => {
  it('fechado (open=false) não renderiza nada', () => {
    render(
      <ImportProcessesModal open={false} onClose={onClose} onConfirm={onConfirm} />
    )
    expect(getFileInput()).not.toBeInTheDocument()
  })

  it('aberto: mostra input de arquivo e dica de colunas', () => {
    renderModal()
    expect(getFileInput()).toBeInTheDocument()
    expect(screen.getByText(/Colunas reconhecidas/i)).toBeInTheDocument()
  })

  it('parse com linhas válidas: mostra preview e habilita confirmar', async () => {
    const user = userEvent.setup()
    mockParse.mockResolvedValueOnce({
      validRows: [
        { name: 'Atlas', category: 'FCL', processNumber: 'FCL-001' },
        { name: 'Boreal', category: 'LCL', processNumber: 'LCL-002' },
      ],
      errors: [],
    })
    renderModal()
    await user.upload(getFileInput(), makeFile())

    await waitFor(() => {
      expect(screen.getByText('2 a criar')).toBeInTheDocument()
    })
    const confirmButton = screen.getByRole('button', { name: /Importar 2 processos/i })
    expect(confirmButton).toBeEnabled()
  })

  it('dedup: linha com processNumber já existente é pulada', async () => {
    const user = userEvent.setup()
    mockParse.mockResolvedValueOnce({
      validRows: [
        { name: 'Novo', category: 'FCL', processNumber: 'FCL-NOVO' },
        { name: 'Duplicado', category: 'FCL', processNumber: 'FCL-EXISTE' },
      ],
      errors: [],
    })
    renderModal()
    await user.upload(getFileInput(), makeFile())

    await waitFor(() => {
      expect(screen.getByText('1 a criar')).toBeInTheDocument()
    })
    expect(screen.getByText(/1 duplicada \(pulada\)/i)).toBeInTheDocument()
  })

  it('erros do parser aparecem no preview', async () => {
    const user = userEvent.setup()
    mockParse.mockResolvedValueOnce({
      validRows: [{ name: 'Ok', category: 'FCL', processNumber: 'FCL-1' }],
      errors: [{ linha: 3, motivo: 'Categoria inválida.' }],
    })
    renderModal()
    await user.upload(getFileInput(), makeFile())

    await waitFor(() => {
      expect(screen.getByText('1 com erro')).toBeInTheDocument()
    })
    expect(screen.getByText(/Linha 3: Categoria inválida\./i)).toBeInTheDocument()
  })

  it('confirmar chama onConfirm só com as linhas a criar (sem duplicatas) e fecha', async () => {
    const user = userEvent.setup()
    mockParse.mockResolvedValueOnce({
      validRows: [
        { name: 'Novo', category: 'FCL', processNumber: 'FCL-NOVO' },
        { name: 'Duplicado', category: 'FCL', processNumber: 'FCL-EXISTE' },
      ],
      errors: [],
    })
    renderModal()
    await user.upload(getFileInput(), makeFile())
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Importar 1 processo/i })).toBeEnabled()
    })
    await user.click(screen.getByRole('button', { name: /Importar 1 processo/i }))

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })
    const rows = onConfirm.mock.calls[0][0]
    expect(rows).toHaveLength(1)
    expect(rows[0].processNumber).toBe('FCL-NOVO')
    expect(onClose).toHaveBeenCalled()
  })

  it('parser lança: mostra erro e não mostra preview', async () => {
    const user = userEvent.setup()
    mockParse.mockRejectedValueOnce(new Error('A planilha enviada está vazia.'))
    renderModal()
    await user.upload(getFileInput(), makeFile())

    await waitFor(() => {
      expect(screen.getByText(/A planilha enviada está vazia\./i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/a criar/i)).not.toBeInTheDocument()
  })

  it('confirmar desabilitado quando só há duplicatas/erros (nada a criar)', async () => {
    const user = userEvent.setup()
    mockParse.mockResolvedValueOnce({
      validRows: [{ name: 'Duplicado', category: 'FCL', processNumber: 'FCL-EXISTE' }],
      errors: [{ linha: 2, motivo: 'Nome do processo é obrigatório.' }],
    })
    renderModal()
    await user.upload(getFileInput(), makeFile())

    await waitFor(() => {
      expect(screen.getByText('0 a criar')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Importar 0 processos/i })).toBeDisabled()
  })
})
