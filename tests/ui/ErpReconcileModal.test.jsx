// Modal "Importar do DBCorp" (F1 + PR 3: concilia e grava a referencia do ERP). As fontes entram
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
  makePortalProcess,
} from '../fixtures/erp/dbcorpSynthetic.js'

const FIXED_NOTE =
  'A planilha vira a referência do ERP para os avisos nos processos. Nenhum dado dos processos é alterado.'
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
  it('mostra o titulo "Importar do DBCorp", o aviso fixo da referencia do ERP e o input .xlsx', () => {
    renderModal()
    expect(screen.getByRole('dialog', { name: 'Importar do DBCorp' })).toBeInTheDocument()
    expect(screen.getByText(FIXED_NOTE)).toBeInTheDocument()
    const input = document.querySelector('input[type="file"]')
    expect(input).toHaveAttribute('accept', '.xlsx')
    expect(input).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Exportar resultado' })).toBeDisabled()
  })

  it('caso-real: CR-32 seletor de arquivo estilizado: input por clip (focavel), botao em label, nome do arquivo no status', async () => {
    const user = userEvent.setup()
    renderModal()
    const input = screen.getByLabelText('Arquivo (Planilha de teste)')
    expect(input).toBe(document.querySelector('input[type="file"]'))
    expect(input).toHaveClass('file-picker__input')
    // Oculto por clip no CSS, nunca por hidden/display:none (continua focavel).
    expect(input).not.toHaveAttribute('hidden')
    expect(input.style.display).not.toBe('none')
    input.focus()
    expect(input).toHaveFocus()

    const button = input.closest('label')
    expect(button).toHaveClass('ghost-button', 'file-picker__button')
    expect(button).not.toHaveClass('file-picker__button--disabled')
    expect(button).toHaveTextContent('Escolher arquivo')

    const status = document.getElementById(input.getAttribute('aria-describedby'))
    expect(status).toHaveClass('file-picker__status')
    expect(status).toHaveTextContent('Nenhum arquivo escolhido')

    await uploadFile(user)
    await screen.findByText('Processos casados')
    expect(status).toHaveTextContent('teste.xlsx')
    expect(status).not.toHaveTextContent('Nenhum arquivo escolhido')

    // Fechar limpa o nome do arquivo.
    await user.click(document.querySelector('.erp-reconcile__actions .ghost-button'))
    expect(status).toHaveTextContent('Nenhum arquivo escolhido')
  })

  it('caso-real: CR-32 sem processos do Portal, o botao do seletor fica desabilitado (label e input)', () => {
    renderModal({ processes: [] })
    const input = screen.getByLabelText('Arquivo (Planilha de teste)')
    expect(input).toBeDisabled()
    expect(input.closest('label')).toHaveClass('file-picker__button--disabled')
  })

  it('caso-real: CR-31 pelo modal, o processo arquivado que casa aparece no Resumo como "1 (1 arquivado)"', async () => {
    const user = userEvent.setup()
    const load = vi.fn().mockResolvedValue({
      rows: [{ ...makeLooseRow({ itemId: 'A-1', pedido: 9036, poRef: 'BETA SEA 904-26' }), rowNumber: 2 }],
      warnings: [],
      meta: { fileName: 'teste.xlsx', rowCount: 1 },
    })
    renderModal({
      processes: [
        makePortalProcess({ id: 'p-arch', name: 'VELHO', processNumber: '9036', category: 'FCL', archived: true }),
      ],
      sources: [makeFileSource(load)],
    })
    await uploadFile(user)
    expect((await summaryMetrics()).matched).toBe('1 (1 arquivado)')
  })

  it('caso-real: CR-33 planilha so com o cabecalho: banner "so o cabecalho" e exportar desabilitado', async () => {
    const user = userEvent.setup()
    const load = vi.fn().mockResolvedValue({ rows: [], warnings: [], meta: { fileName: 'vazia.xlsx', rowCount: 0 } })
    renderModal({ sources: [makeFileSource(load)] })
    await uploadFile(user)
    await waitFor(() => expect(document.querySelector('.error-banner')).toBeInTheDocument())
    expect(document.querySelector('.error-banner')).toHaveTextContent('só o cabeçalho')
    expect(screen.queryByText('Processos casados')).not.toBeInTheDocument()
    expect(screen.queryByText('Só no Portal (não encontrado nesta planilha)')).not.toBeInTheDocument()
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

describe('ErpReconcileModal - referencia do ERP (PR 3, Importar do DBCorp)', () => {
  const savedOutcome = (hints, hintsSkipped = 0) => ({ snapshotId: 'S', counts: { hints, hintsSkipped }, skipped: [] })
  const REFERENCE_AT = new Date(2026, 9, 2, 14, 30).getTime()

  function pendingSave() {
    let resolveSave
    let rejectSave
    const onSaveReference = vi.fn(
      () =>
        new Promise((resolve, reject) => {
          resolveSave = resolve
          rejectSave = reject
        })
    )
    return { onSaveReference, resolveSave: (value) => resolveSave(value), rejectSave: (error) => rejectSave(error) }
  }

  it('onSaveReference recebe 1x o MESMO resultado que o modal renderiza e exporta (toBe) e o banner confirma', async () => {
    const user = userEvent.setup()
    const onSaveReference = vi.fn().mockResolvedValue(savedOutcome(3))
    renderModal({ onSaveReference })
    await uploadFile(user)
    expect(await screen.findByText('Referência do ERP salva: 3 processos.')).toBeInTheDocument()
    expect(onSaveReference).toHaveBeenCalledTimes(1)
    const [result] = onSaveReference.mock.calls[0]
    expect(result.blocked).toBeNull()
    expect(result.summary.matched).toBe(3)
    // O Resumo continua na tela e o export leva o mesmo objeto que foi salvo.
    await screen.findByText('Processos casados')
    await user.click(screen.getByRole('button', { name: 'Exportar resultado' }))
    await waitFor(() => expect(exportErpReconciliationToXlsx).toHaveBeenCalledTimes(1))
    expect(vi.mocked(exportErpReconciliationToXlsx).mock.calls[0][0]).toBe(result)
  })

  it('singular, plural e " K sem aviso (embarque grande demais)." so com K > 0', async () => {
    const user = userEvent.setup()
    const onSaveReference = vi.fn().mockResolvedValue(savedOutcome(1))
    const first = renderModal({ onSaveReference })
    await uploadFile(user)
    expect(await screen.findByText('Referência do ERP salva: 1 processo.')).toBeInTheDocument()
    expect(screen.queryByText(/sem aviso/)).not.toBeInTheDocument()
    first.unmount()

    renderModal({ onSaveReference: vi.fn().mockResolvedValue(savedOutcome(1, 2)) })
    await uploadFile(user)
    expect(
      await screen.findByText('Referência do ERP salva: 1 processo. 2 sem aviso (embarque grande demais).')
    ).toBeInTheDocument()
  })

  it('"Referência atual" vem so da prop referenceInfo (rerender atualiza a linha)', () => {
    const props = { open: true, onClose: vi.fn(), processes: buildScenarioPortalProcesses(), sources: [makeFileSource()] }
    const { rerender } = render(<ErpReconcileModal {...props} />)
    expect(screen.getByText('Nenhuma referência do ERP salva ainda.')).toBeInTheDocument()
    expect(screen.queryByText(/Referência atual/)).not.toBeInTheDocument()

    rerender(<ErpReconcileModal {...props} referenceInfo={{ snapshotId: 'A', updatedAtMs: REFERENCE_AT }} />)
    expect(screen.getByText('Referência atual: planilha de 02/10/2026 14:30')).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma referência do ERP salva ainda.')).not.toBeInTheDocument()

    rerender(
      <ErpReconcileModal {...props} referenceInfo={{ snapshotId: 'B', updatedAtMs: new Date(2026, 9, 3, 9, 5).getTime() }} />
    )
    expect(screen.getByText('Referência atual: planilha de 03/10/2026 09:05')).toBeInTheDocument()

    rerender(<ErpReconcileModal {...props} referenceInfo={null} />)
    expect(screen.getByText('Nenhuma referência do ERP salva ainda.')).toBeInTheDocument()
  })

  it('referencia incompleta (importacoes concorrentes): a linha pede nova importacao em vez de mostrar a data', () => {
    const props = { open: true, onClose: vi.fn(), processes: buildScenarioPortalProcesses(), sources: [makeFileSource()] }
    const { rerender } = render(
      <ErpReconcileModal {...props} referenceInfo={{ snapshotId: 'A', updatedAtMs: REFERENCE_AT, incomplete: true }} />
    )
    expect(
      screen.getByText(
        'A referência do ERP salva está incompleta (outra importação gravou ao mesmo tempo). Importe a planilha de novo.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/Referência atual/)).not.toBeInTheDocument()

    rerender(<ErpReconcileModal {...props} referenceInfo={{ snapshotId: 'B', updatedAtMs: REFERENCE_AT }} />)
    expect(screen.getByText('Referência atual: planilha de 02/10/2026 14:30')).toBeInTheDocument()
    expect(screen.queryByText(/incompleta/)).not.toBeInTheDocument()
  })

  it('resultado bloqueado nao chama onSaveReference', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 6 }, (_, index) => ({
      ...makeLooseRow({ itemId: `B-${index}`, pedido: 9600 + index, poRef: `ALFA SEA 96${index}-26`, etd: '10/6/26' }),
      rowNumber: index + 2,
    }))
    const load = vi.fn().mockResolvedValue({ rows, warnings: [], meta: { fileName: 'ruim.xlsx', rowCount: 6 } })
    const onSaveReference = vi.fn().mockResolvedValue(savedOutcome(0))
    renderModal({ sources: [makeFileSource(load)], onSaveReference })
    await uploadFile(user)
    await waitFor(() => expect(document.querySelector('.error-banner')).toBeInTheDocument())
    expect(onSaveReference).not.toHaveBeenCalled()
    expect(screen.queryByText(/Referência do ERP salva/)).not.toBeInTheDocument()
  })

  it('processes=[] (lista do Portal vazia) nao chama onSaveReference nem a fonte', async () => {
    const fileLoad = vi.fn().mockResolvedValue(scenarioLoaded())
    const onSaveReference = vi.fn().mockResolvedValue(savedOutcome(0))
    renderModal({ processes: [], sources: [makeFileSource(fileLoad)], onSaveReference })
    const input = document.querySelector('input[type="file"]')
    fireEvent.change(input, { target: { files: [new File(['x'], 'teste.xlsx')] } })
    await Promise.resolve()
    expect(fileLoad).not.toHaveBeenCalled()
    expect(onSaveReference).not.toHaveBeenCalled()
  })

  it('sem onSaveReference nada quebra: so o Resumo e nenhum banner de gravacao', async () => {
    const user = userEvent.setup()
    renderModal()
    await uploadFile(user)
    await screen.findByText('Processos casados')
    expect(screen.queryByText(/Referência do ERP salva/)).not.toBeInTheDocument()
    expect(screen.queryByText('Salvando a referência do ERP…')).not.toBeInTheDocument()
    expect(document.querySelector('.error-banner')).toBeNull()
  })

  it('callback rejeitado vira error-banner "Conciliação ok, mas..." e o Resumo continua', async () => {
    const user = userEvent.setup()
    const onSaveReference = vi.fn().mockRejectedValue(new Error('falhou'))
    renderModal({ onSaveReference })
    await uploadFile(user)
    await waitFor(() => expect(document.querySelector('.error-banner')).toBeInTheDocument())
    expect(document.querySelector('.error-banner')).toHaveTextContent(
      'Conciliação ok, mas não foi possível salvar a referência do ERP.'
    )
    expect(screen.getByText('Processos casados')).toBeInTheDocument()
    expect(screen.queryByText(/Referência do ERP salva/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar resultado' })).toBeEnabled()
    expect(document.querySelector('input[type="file"]')).not.toBeDisabled()
  })

  it('durante a gravacao: status "Salvando...", input e label desabilitados; depois do save, habilita de novo', async () => {
    const user = userEvent.setup()
    const { onSaveReference, resolveSave } = pendingSave()
    renderModal({ onSaveReference })
    await uploadFile(user)
    expect(await screen.findByText('Salvando a referência do ERP…')).toBeInTheDocument()
    expect(screen.getByText('Salvando a referência do ERP…').closest('[role="status"]')).not.toBeNull()
    const input = document.querySelector('input[type="file"]')
    expect(input).toBeDisabled()
    expect(input.closest('label')).toHaveClass('file-picker__button--disabled')
    // A conciliacao ja esta na tela enquanto grava.
    expect(screen.getByText('Processos casados')).toBeInTheDocument()

    resolveSave(savedOutcome(3))
    expect(await screen.findByText('Referência do ERP salva: 3 processos.')).toBeInTheDocument()
    expect(screen.queryByText('Salvando a referência do ERP…')).not.toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).not.toBeDisabled()
  })

  it('isSavingReference (gravacao em voo da pagina) desabilita input e botao da fonte e avisa, com a fase local idle', () => {
    renderModal({ isSavingReference: true })
    expect(document.querySelector('input[type="file"]')).toBeDisabled()
    expect(document.querySelector('input[type="file"]').closest('label')).toHaveClass('file-picker__button--disabled')
    expect(screen.getByText('Uma importação anterior ainda está salvando a referência do ERP.')).toBeInTheDocument()

    renderModal({ isSavingReference: true, sources: [makeRequestSource()] })
    expect(screen.getByRole('button', { name: 'Carregar de API de teste' })).toBeDisabled()
  })

  it('fechar no meio da gravacao zera o estado local (sem banner) e o save atrasado nao escreve de volta', async () => {
    const user = userEvent.setup()
    const { onSaveReference, resolveSave } = pendingSave()
    const { onClose } = renderModal({ onSaveReference })
    await uploadFile(user)
    await screen.findByText('Salvando a referência do ERP…')
    await user.click(document.querySelector('.erp-reconcile__actions .ghost-button'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Salvando a referência do ERP…')).not.toBeInTheDocument()
    resolveSave(savedOutcome(3))
    await Promise.resolve()
    await Promise.resolve()
    expect(screen.queryByText(/Referência do ERP salva/)).not.toBeInTheDocument()
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

  const baseResult = (overrides = {}, summaryOverrides = {}) => ({
    blocked: null,
    blockedMessage: '',
    sourceInfo: { source: 'x', label: 'Fonte X', fileName: '', fetchedAt: '', rowCount: 0, generatedOn: '2026-10-02' },
    summary: {
      erpRows: 0, shipments: 0, activeShipments: 0, matched: 0, matchedArchived: 0, matchedWithDiffs: 0,
      erpMissingFields: 0, erpOnly: 0, erpOnlyByCategory: {}, portalOnly: 0, portalOnlyArchived: 0, warnings: 0,
      warningsByCode: {}, ...summaryOverrides,
    },
    matched: [],
    erpOnly: [],
    portalOnly: [],
    warnings: [],
    ...overrides,
  })

  const makeWarning = (code, message, concludedShipment) => ({
    code,
    message,
    ref: { rowNumber: null, itemId: '', pedido: '', shipmentKey: '', processId: '' },
    concludedShipment,
  })

  it('caso-real: CR-31 Resumo: "27 (1 arquivado)", "27 (2 arquivados)" e so "27" sem arquivados', () => {
    const { rerender } = render(
      <ErpReconcileResults result={baseResult({}, { matched: 27, matchedArchived: 1 })} />
    )
    expect(metric('Processos casados')).toBe('27 (1 arquivado)')
    rerender(<ErpReconcileResults result={baseResult({}, { matched: 27, matchedArchived: 2 })} />)
    expect(metric('Processos casados')).toBe('27 (2 arquivados)')
    rerender(<ErpReconcileResults result={baseResult({}, { matched: 27, matchedArchived: 0 })} />)
    expect(metric('Processos casados')).toBe('27')
    // Resultado sem o campo (versao antiga): so o total.
    const legacy = baseResult({}, { matched: 3 })
    delete legacy.summary.matchedArchived
    rerender(<ErpReconcileResults result={legacy} />)
    expect(metric('Processos casados')).toBe('3')
  })

  it('caso-real: CR-41 avisos de embarques concluidos ficam ocultos por padrao; o checkbox mostra todos', async () => {
    const user = userEvent.setup()
    const warnings = [
      makeWarning('aereo_inferido', 'embarque ativo', false),
      makeWarning('conflito_no_grupo', 'embarque concluido A', true),
      makeWarning('ref_desconhecida', 'embarque concluido B', true),
    ]
    render(<ErpReconcileResults result={baseResult({ warnings }, { warnings: 3 })} />)
    // O "Avisos" do Resumo continua sendo o total.
    expect(metric('Avisos')).toBe('3')

    await user.click(screen.getByRole('button', { name: 'Avisos (1)' }))
    expect(screen.getByText('embarque ativo')).toBeInTheDocument()
    expect(screen.queryByText('embarque concluido A')).not.toBeInTheDocument()
    expect(screen.queryByText('embarque concluido B')).not.toBeInTheDocument()
    expect(screen.getByText('2 avisos de embarques concluídos ocultos.')).toBeInTheDocument()

    const toggle = screen.getByRole('checkbox', { name: 'Mostrar avisos de embarques concluídos (2)' })
    expect(toggle).not.toBeChecked()
    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'Avisos (3)' })).toBeInTheDocument()
    expect(screen.getByText('embarque ativo')).toBeInTheDocument()
    expect(screen.getByText('embarque concluido A')).toBeInTheDocument()
    expect(screen.getByText('embarque concluido B')).toBeInTheDocument()
    expect(screen.queryByText(/avisos de embarques concluídos ocultos/)).not.toBeInTheDocument()

    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'Avisos (1)' })).toBeInTheDocument()
    expect(screen.queryByText('embarque concluido A')).not.toBeInTheDocument()
  })

  it('caso-real: CR-41 singular, tudo oculto e sem avisos concluidos', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ErpReconcileResults
        result={baseResult({ warnings: [makeWarning('conflito_no_grupo', 'so concluido', true)] }, { warnings: 1 })}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Avisos (0)' }))
    expect(screen.getByText('1 aviso de embarque concluído oculto.')).toBeInTheDocument()
    expect(screen.getByText('Nenhum aviso de embarque ativo.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Mostrar avisos de embarques concluídos (1)' })).toBeInTheDocument()

    // Sem nenhum aviso concluido (inclusive sem a marca): sem checkbox e nada muda.
    rerender(
      <ErpReconcileResults
        result={baseResult({ warnings: [{ ...makeWarning('aereo_inferido', 'ativo', false), concludedShipment: undefined }] }, { warnings: 1 })}
      />
    )
    expect(screen.getByRole('button', { name: 'Avisos (1)' })).toBeInTheDocument()
    expect(screen.getByText('ativo')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/oculto/)).not.toBeInTheDocument()
  })

  it('caso-real: CR-41 pelo modal: concluidos ocultos na aba Avisos, e o export leva todos os avisos', async () => {
    const user = userEvent.setup()
    const loose = [
      makeLooseRow({ itemId: 'C1', pedido: 9801, poRef: 'ALFA SEA 981-26', status: 'CONCLUÍDO', etd: 46301 }),
      makeLooseRow({ itemId: 'C2', pedido: 9801, poRef: 'ALFA SEA 981-26', status: 'CONCLUÍDO', etd: 46281 }),
      makeLooseRow({ itemId: 'C4', pedido: 9803, poRef: 'GAMA SEA 983-26', status: 'EMBARCOU', refEmbarque: 'DAP - ITAJAI' }),
    ].map((row, index) => ({ ...row, rowNumber: index + 2 }))
    const load = vi.fn().mockResolvedValue({ rows: loose, warnings: [], meta: { fileName: 'teste.xlsx', rowCount: 3 } })
    renderModal({ sources: [makeFileSource(load)] })
    await uploadFile(user)
    await screen.findByText('Processos casados')

    await user.click(screen.getByRole('button', { name: /^Avisos/ }))
    expect(screen.getByText('aereo_inferido')).toBeInTheDocument()
    expect(screen.queryByText('conflito_no_grupo')).not.toBeInTheDocument()
    expect(screen.getByText('1 aviso de embarque concluído oculto.')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Mostrar avisos de embarques concluídos (1)' }))
    expect(screen.getByText('conflito_no_grupo')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Exportar resultado' }))
    await waitFor(() => expect(exportErpReconciliationToXlsx).toHaveBeenCalledTimes(1))
    const [result] = vi.mocked(exportErpReconciliationToXlsx).mock.calls[0]
    expect(result.warnings.map((warning) => [warning.code, warning.concludedShipment]).sort()).toEqual([
      ['aereo_inferido', false],
      ['conflito_no_grupo', true],
    ])
  })

  it('sem resultado nao renderiza nada; bloqueado mostra so a mensagem', () => {
    const { container, rerender } = render(<ErpReconcileResults result={null} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<ErpReconcileResults result={{ blocked: 'lista_portal_vazia', blockedMessage: EMPTY_PORTAL_MESSAGE }} />)
    expect(screen.getByText(EMPTY_PORTAL_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })
})
