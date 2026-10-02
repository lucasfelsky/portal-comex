// Modal "Conciliar com ERP (DBCorp)" - F1 (somente leitura). As fontes entram
// como objetos `ErpSource` injetados (`load: vi.fn()`), sem mock do leitor de
// planilha. So' o modulo de exportacao e' mockado (nao baixa arquivo no teste).
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../src/features/erp/erpReconciliationExport', async (importOriginal) => ({
  ...(await importOriginal()),
  exportErpReconciliationToXlsx: vi.fn().mockResolvedValue('conciliacao-erp-2026-10-02.xlsx'),
}))

import ErpReconcileModal, { ErpReconcileResults } from '../../src/features/erp/ErpReconcileModal.jsx'
import { exportErpReconciliationToXlsx } from '../../src/features/erp/erpReconciliationExport'
import {
  buildScenarioApiRows,
  buildScenarioLooseRows,
  buildScenarioPortalProcesses,
  makeLooseRow,
} from '../fixtures/erp/dbcorpSynthetic.js'

const FIXED_NOTE = 'Nada é gravado: a tela só compara a fonte com os processos já carregados.'
const EMPTY_PORTAL_MESSAGE = 'Os processos do Portal não foram carregados. Recarregue a página antes de conciliar.'

function scenarioLoaded() {
  const rows = buildScenarioLooseRows().map((row, index) => ({ ...row, rowNumber: index + 2 }))
  return { rows, warnings: [], meta: { fileName: 'teste.xlsx', rowCount: rows.length } }
}

function makeFileSource(load = vi.fn().mockResolvedValue(scenarioLoaded())) {
  return { id: 'fake-file', label: 'Planilha de teste', inputKind: 'file', accept: '.xlsx', load }
}

function makeRequestSource(load) {
  return {
    id: 'fake-api',
    label: 'API de teste',
    inputKind: 'request',
    load:
      load ??
      vi.fn().mockResolvedValue({
        rows: buildScenarioApiRows(),
        warnings: [],
        meta: { fetchedAt: '2026-10-02T09:00:00', rowCount: 10 },
      }),
  }
}

function renderModal(props = {}) {
  const onClose = vi.fn()
  const view = render(
    <ErpReconcileModal
      open
      onClose={onClose}
      processes={buildScenarioPortalProcesses()}
      sources={[makeFileSource()]}
      {...props}
    />
  )
  return { ...view, onClose }
}

async function uploadFile(user, container = document.body) {
  const input = container.querySelector('input[type="file"]')
  await user.upload(input, new File(['conteudo'], 'teste.xlsx'))
}

function metric(label) {
  return screen.getByText(label).closest('div').querySelector('dd').textContent
}

async function summaryMetrics() {
  await screen.findByText('Processos casados')
  return {
    erpRows: metric('Linhas do ERP'),
    shipments: metric('Embarques no ERP'),
    matched: metric('Processos casados'),
    withDiffs: metric('Casados com divergências'),
    erpOnly: metric('Só no ERP'),
    portalOnly: metric('Só no Portal (não encontrado nesta planilha)'),
  }
}

beforeEach(() => {
  vi.mocked(exportErpReconciliationToXlsx).mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErpReconcileModal - fonte de arquivo', () => {
  it('mostra o titulo, o aviso fixo de que nada e gravado e o input .xlsx', () => {
    renderModal()
    expect(screen.getByRole('dialog', { name: 'Conciliar com ERP (DBCorp)' })).toBeInTheDocument()
    expect(screen.getByText(FIXED_NOTE)).toBeInTheDocument()
    const input = document.querySelector('input[type="file"]')
    expect(input).toHaveAttribute('accept', '.xlsx')
    expect(input).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Exportar resultado' })).toBeDisabled()
  })

  it('sobe o arquivo, mostra o Resumo com as contagens e navega pelas abas', async () => {
    const user = userEvent.setup()
    const load = vi.fn().mockResolvedValue(scenarioLoaded())
    renderModal({ sources: [makeFileSource(load)] })

    await uploadFile(user)

    expect(load).toHaveBeenCalledTimes(1)
    expect(load.mock.calls[0][0]).toBeInstanceOf(File)
    expect(await summaryMetrics()).toEqual({
      erpRows: '10', shipments: '8', matched: '3', withDiffs: '1', erpOnly: '5', portalOnly: '2',
    })
    expect(document.querySelector('.erp-reconcile__meta')).toHaveTextContent('Planilha de teste')
    expect(document.querySelector('.erp-reconcile__meta')).toHaveTextContent('teste.xlsx')

    await user.click(screen.getByRole('button', { name: /^Divergências/ }))
    expect(screen.getByText('BETA SEA 904-26')).toBeInTheDocument()
    expect(screen.getByText('ETD')).toBeInTheDocument()
    expect(screen.getByText('Quantidade (kg): RESINA OMEGA')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Só no ERP/ }))
    // caso-real: CR-27 rotulo provisorio da LCL Shanghai em pre-embarque
    expect(screen.getByText(/Aguardando consolidação \(provável\)/)).toBeInTheDocument()
    expect(screen.getByText('OMICRON SEA 907-26')).toBeInTheDocument()
    expect(screen.getByText('ETD vencido')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Só no Portal/ }))
    expect(screen.getByText('ZETA SEA 999-26')).toBeInTheDocument()
    expect(screen.getByText('SIGMA SEA 998-26')).toBeInTheDocument()
    expect(screen.getByText('Arquivado')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Avisos/ }))
    expect(screen.getByText('Nenhum aviso.')).toBeInTheDocument()
  })

  it('caso-real: CR-27 a aba Só no ERP agrupa por categoria e mostra "Aguardando consolidação (provável)"', async () => {
    const user = userEvent.setup()
    renderModal()
    await uploadFile(user)
    await screen.findByText('Processos casados')
    await user.click(screen.getByRole('button', { name: /^Só no ERP/ }))
    const headings = screen.getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent)
    expect(headings).toContain('Aguardando consolidação (provável) (1)')
    expect(headings).toContain('Embarcado sem processo no Portal (1)')
    expect(headings).toContain('Nacional (1)')
  })

  it('o toggle revela as diferencas de formato/informativas (desligado por padrao)', async () => {
    const user = userEvent.setup()
    renderModal()
    await uploadFile(user)
    await screen.findByText('Processos casados')
    await user.click(screen.getByRole('button', { name: /^Divergências/ }))

    // "Destino" (ITAJAÍ x ITAJAI) e' so' de formato
    expect(screen.queryByText('Destino')).not.toBeInTheDocument()
    const toggle = screen.getByRole('checkbox', { name: 'Mostrar diferenças de formato/informativas' })
    expect(toggle).not.toBeChecked()
    await user.click(toggle)
    expect(screen.getByText('Destino')).toBeInTheDocument()
    await user.click(toggle)
    expect(screen.queryByText('Destino')).not.toBeInTheDocument()
  })

  it('exportar chama o modulo de exportacao com o resultado', async () => {
    const user = userEvent.setup()
    renderModal()
    await uploadFile(user)
    await screen.findByText('Processos casados')

    const button = screen.getByRole('button', { name: 'Exportar resultado' })
    expect(button).toBeEnabled()
    await user.click(button)
    await waitFor(() => expect(exportErpReconciliationToXlsx).toHaveBeenCalledTimes(1))
    const [result] = vi.mocked(exportErpReconciliationToXlsx).mock.calls[0]
    expect(result.summary).toMatchObject({ matched: 3, erpOnly: 5 })
    expect(result.sourceInfo.generatedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('falha ao exportar vira error-banner', async () => {
    vi.mocked(exportErpReconciliationToXlsx).mockRejectedValueOnce(new Error('disco cheio'))
    const user = userEvent.setup()
    renderModal()
    await uploadFile(user)
    await screen.findByText('Processos casados')
    await user.click(screen.getByRole('button', { name: 'Exportar resultado' }))
    await waitFor(() => expect(document.querySelector('.error-banner')).toHaveTextContent('Não foi possível exportar o resultado.'))
  })

  it('Fechar chama onClose', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    await user.click(document.querySelector('.erp-reconcile__actions .ghost-button'))
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.click(document.querySelector('.modal__close'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('ErpReconcileModal - fonte por requisicao (API)', () => {
  it('mostra "Carregar de {label}" e produz o mesmo Resumo do arquivo', async () => {
    const user = userEvent.setup()
    const fileView = renderModal()
    await uploadFile(user)
    const fromFile = await summaryMetrics()
    fileView.unmount()

    const load = vi.fn().mockResolvedValue({
      rows: buildScenarioApiRows(),
      warnings: [],
      meta: { fetchedAt: '2026-10-02T09:00:00', rowCount: 10 },
    })
    renderModal({ sources: [makeRequestSource(load)] })
    expect(document.querySelector('input[type="file"]')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Carregar de API de teste' }))

    const fromApi = await summaryMetrics()
    expect(load).toHaveBeenCalledTimes(1)
    expect(fromApi).toEqual(fromFile)
  })

  it('com mais de uma fonte, oferece a escolha da fonte', async () => {
    const user = userEvent.setup()
    const requestLoad = vi.fn().mockResolvedValue({ rows: buildScenarioApiRows(), warnings: [], meta: { rowCount: 10 } })
    renderModal({ sources: [makeFileSource(), makeRequestSource(requestLoad)] })
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).not.toBeNull()
    await user.selectOptions(screen.getByRole('combobox'), 'fake-api')
    expect(document.querySelector('input[type="file"]')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Carregar de API de teste' }))
    expect((await summaryMetrics()).matched).toBe('3')
  })
})

describe('ErpReconcileModal - erros e bloqueios', () => {
  it('erro de load vira error-banner e o modal continua usavel', async () => {
    const user = userEvent.setup()
    const load = vi.fn().mockRejectedValue(new Error('arquivo corrompido'))
    renderModal({ sources: [makeFileSource(load)] })
    await uploadFile(user)
    await waitFor(() => expect(document.querySelector('.error-banner')).toBeInTheDocument())
    expect(document.querySelector('.error-banner')).toHaveTextContent('Não foi possível conciliar com o ERP.')
    expect(screen.queryByText('Processos casados')).not.toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).not.toBeDisabled()
  })

  it('processes=[]: banner bloqueante e load nunca e chamado', async () => {
    const user = userEvent.setup()
    const fileLoad = vi.fn().mockResolvedValue(scenarioLoaded())
    const { unmount } = renderModal({ processes: [], sources: [makeFileSource(fileLoad)] })
    expect(screen.getByText(EMPTY_PORTAL_MESSAGE)).toBeInTheDocument()
    const input = document.querySelector('input[type="file"]')
    expect(input).toBeDisabled()
    // mesmo forcando o evento, o modal nao chama a fonte
    fireEvent.change(input, { target: { files: [new File(['x'], 'teste.xlsx')] } })
    await Promise.resolve()
    expect(fileLoad).not.toHaveBeenCalled()
    unmount()

    const requestLoad = vi.fn()
    renderModal({ processes: [], sources: [makeRequestSource(requestLoad)] })
    expect(screen.getByText(EMPTY_PORTAL_MESSAGE)).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Carregar de API de teste' })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(requestLoad).not.toHaveBeenCalled()
  })

  it('result.blocked mostra o blockedMessage e nao deixa exportar', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 6 }, (_, index) => ({
      ...makeLooseRow({ itemId: `B-${index}`, pedido: 9600 + index, poRef: `ALFA SEA 96${index}-26`, etd: '10/6/26' }),
      rowNumber: index + 2,
    }))
    const load = vi.fn().mockResolvedValue({ rows, warnings: [], meta: { fileName: 'ruim.xlsx', rowCount: 6 } })
    renderModal({ sources: [makeFileSource(load)] })
    await uploadFile(user)
    await waitFor(() => expect(document.querySelector('.error-banner')).toBeInTheDocument())
    expect(document.querySelector('.error-banner')).toHaveTextContent('ETD (EMBARQUE)')
    expect(screen.queryByText('Processos casados')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar resultado' })).toBeDisabled()
  })
})

describe('ErpReconcileResults', () => {
  it('renderiza so o resultado: abas com contagem e Resumo inicial', () => {
    const result = {
      blocked: null,
      blockedMessage: '',
      sourceInfo: { source: 'x', label: 'Fonte X', fileName: '', fetchedAt: '', rowCount: 0, generatedOn: '2026-10-02' },
      summary: {
        erpRows: 0, shipments: 0, activeShipments: 0, matched: 0, matchedWithDiffs: 0, erpMissingFields: 0,
        erpOnly: 0, erpOnlyByCategory: {}, portalOnly: 0, portalOnlyArchived: 0, warnings: 0, warningsByCode: {},
      },
      matched: [],
      erpOnly: [],
      portalOnly: [],
      warnings: [],
    }
    render(<ErpReconcileResults result={result} showMinor={false} />)
    const group = screen.getByRole('group', { name: 'Seções do resultado' })
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Resumo', 'Divergências (0)', 'Só no ERP (0)', 'Só no Portal (0)', 'Avisos (0)',
    ])
    expect(screen.getByText('Fonte X')).toBeInTheDocument()
  })

  it('sem resultado nao renderiza nada; bloqueado mostra so a mensagem', () => {
    const { container, rerender } = render(<ErpReconcileResults result={null} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<ErpReconcileResults result={{ blocked: 'lista_portal_vazia', blockedMessage: EMPTY_PORTAL_MESSAGE }} />)
    expect(screen.getByText(EMPTY_PORTAL_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })
})
