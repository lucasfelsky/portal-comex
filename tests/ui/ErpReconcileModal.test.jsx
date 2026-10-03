// Modal "Importar do DBCorp" (F1 + PR 3: concilia e grava a referencia do ERP). As fontes entram
// como objetos `ErpSource` injetados (`load: vi.fn()`), sem mock do leitor de
// planilha. So' o modulo de exportacao e' mockado (nao baixa arquivo no teste).
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../src/features/erp/erpReconciliationExport', async (importOriginal) => ({
  ...(await importOriginal()),
  exportErpReconciliationToXlsx: vi.fn().mockResolvedValue('conciliacao-erp-2026-10-02.xlsx'),
}))

import ErpReconcileModal, { ErpReconcileResults } from '../../src/features/erp/ErpReconcileModal.jsx'
import { exportErpReconciliationToXlsx } from '../../src/features/erp/erpReconciliationExport'
import {
  CREATION_SCENARIO_KEYS,
  buildCreationScenarioLooseRows,
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

// F3: aba "Criar processos". O modal recebe a criacao por callback (`onCreateProcesses`) e nunca
// grava processo. Relogio fixo (so' `Date`): meio-dia local de 2026-10-02 = SCENARIO_TODAY em qualquer fuso.
describe('ErpReconcileModal - criar processos (F3)', () => {
  const K = CREATION_SCENARIO_KEYS
  const NEW_NOTE =
    'A planilha vira a referência do ERP para os avisos. Processos existentes não são alterados; novos processos só são criados na aba Criar processos, depois da sua confirmação.'
  const FILLER = makePortalProcess({ id: 'p-filler', name: 'OMEGA SEA 999-26', processNumber: '9999', category: 'FCL' })
  const savedOutcome = (hints) => ({ snapshotId: 'S', counts: { hints, hintsSkipped: 0 }, skipped: [] })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 2, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function creationSource(rows = buildCreationScenarioLooseRows()) {
    const loose = rows.map((row, index) => ({ ...row, rowNumber: index + 2 }))
    return makeFileSource(vi.fn().mockResolvedValue({ rows: loose, warnings: [], meta: { fileName: 'criar.xlsx', rowCount: loose.length } }))
  }

  // Resultado do callback no formato da pagina: `created` com id e a lista nova de processos.
  function outcomeFor(drafts, { skipped = [], failed = [] } = {}) {
    const entries = drafts.map((draft, index) => ({
      ...makePortalProcess({ id: `PROC-t${index + 1}` }),
      ...draft.process,
      items: draft.process.items.map((item, itemIndex) => ({ id: `it-${index}-${itemIndex}`, ...item })),
    }))
    return {
      created: entries.map((entry, index) => ({ key: drafts[index].key, id: entry.id, name: entry.name })),
      skipped,
      failed,
      processes: [FILLER, ...entries],
      auditFailed: false,
      refreshFailed: false,
    }
  }

  const PROCESSES = [FILLER]

  function modalProps(overrides = {}) {
    return {
      processes: PROCESSES,
      sources: [creationSource()],
      onCreateProcesses: vi.fn(),
      ...overrides,
    }
  }

  async function openCreateTab(user, view = null) {
    await uploadFile(user, view?.container ?? document.body)
    await screen.findByText('Processos casados')
    await user.click(screen.getByRole('button', { name: /^Criar processos/ }))
  }

  const checkbox = (name) => screen.getByRole('checkbox', { name })
  const createButton = (count) => screen.getByRole('button', { name: count === 1 ? 'Criar 1 processo' : `Criar ${count} processos` })

  it('caso-real: CR-59 a aba so existe com onCreateProcesses e mostra "Criar processos (N)"; com a prop o texto fixo muda; sem a prop nada muda', async () => {
    const user = userEvent.setup()
    const view = renderModal(modalProps())
    expect(screen.getByText(NEW_NOTE)).toBeInTheDocument()
    expect(screen.queryByText(FIXED_NOTE)).not.toBeInTheDocument()
    await uploadFile(user)
    await screen.findByText('Processos casados')
    const group = screen.getByRole('group', { name: 'Seções do resultado' })
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Resumo', 'Divergências (0)', 'Só no ERP (16)', 'Criar processos (8)', 'Só no Portal (1)', 'Avisos (6)',
    ])
    view.unmount()

    renderModal({ processes: [FILLER], sources: [creationSource()] })
    expect(screen.getByText(FIXED_NOTE)).toBeInTheDocument()
    await uploadFile(user)
    await screen.findByText('Processos casados')
    expect(screen.queryByRole('button', { name: /^Criar processos/ })).not.toBeInTheDocument()
  })

  it('caso-real: CR-59 selos, grupos por categoria e a secao "Não criáveis" com o motivo', async () => {
    const user = userEvent.setup()
    renderModal(modalProps())
    await openCreateTab(user)
    const headings = screen.getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent)
    expect(headings).toContain('Aguardando embarque (4)')
    expect(headings).toContain('Embarcado sem processo no Portal (4)')
    expect(headings).toContain('Não criáveis (1)')
    // LAMBDA (embarcou, ETD unico), TETA (atracado) e ZETA (embarcou com DI).
    expect(screen.getAllByText('Embarque confirmado')).toHaveLength(3)
    expect(screen.getAllByText('DUIMP')).toHaveLength(1)
    expect(screen.getAllByText('Conferir antes')).toHaveLength(1)
    for (const badge of ['FCL', 'LCL', 'CON']) expect(screen.getAllByText(badge).length).toBeGreaterThan(0)

    const row = checkbox(K.fclAgEmbarque).closest('li')
    expect(row).toHaveTextContent('Fornecedor: ALFA CHEM')
    expect(row).toHaveTextContent('ETD: 20/10/2026')
    expect(row).toHaveTextContent('ETA: 25/11/2026')
    expect(row).toHaveTextContent('PEDIDO 9620')
    expect(row).toHaveTextContent('2 itens · 1.500,5 kg')
    expect(checkbox(K.fclEmbarcouComDi).closest('li')).toHaveTextContent('ALFA MAERSK / 639W')

    const blocked = screen.getByRole('heading', { name: 'Não criáveis (1)' }).closest('section')
    expect(within(blocked).getByText(K.aereo)).toBeInTheDocument()
    expect(within(blocked).getByText(/Tipo não criável a partir do DBCorp/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: K.aereo })).not.toBeInTheDocument()
  })

  it('caso-real: CR-59 o filtro "Tipo" esconde linhas; a selecao escondida continua contada e a confirmacao lista todos', async () => {
    const user = userEvent.setup()
    renderModal(modalProps())
    await openCreateTab(user)
    await user.click(checkbox(K.fclAgEmbarque))
    await user.click(checkbox(K.lclAgEmbarque))
    await user.selectOptions(screen.getByLabelText('Tipo'), 'LCL')
    expect(screen.queryByRole('checkbox', { name: K.fclAgEmbarque })).not.toBeInTheDocument()
    expect(checkbox(K.lclAgEmbarque)).toBeChecked()
    expect(screen.getByText('1 selecionado oculto pelo filtro.')).toBeInTheDocument()
    expect(createButton(2)).toBeEnabled()

    await user.click(createButton(2))
    const list = screen.getByRole('heading', { name: 'Confirme os processos a criar' }).parentElement
    expect(within(list).getByText(K.fclAgEmbarque)).toBeInTheDocument()
    expect(within(list).getByText(K.lclAgEmbarque)).toBeInTheDocument()
    expect(within(list).getByText('Serão criados 2 processos no Portal.', { exact: false })).toBeInTheDocument()
  })

  it('caso-real: CR-59 "Selecionar todos" marca so as linhas visiveis, criaveis e sem "Conferir antes"; selecao parcial deixa indeterminate', async () => {
    const user = userEvent.setup()
    renderModal(modalProps())
    await openCreateTab(user)
    // Embarcado sem processo: 4 linhas, 1 delas "Conferir antes" -> o botao conta 3.
    const embarcados = screen.getByRole('checkbox', { name: 'Selecionar todos de Embarcado sem processo no Portal (3)' })
    expect(embarcados).not.toBeChecked()
    await user.click(embarcados)
    expect(embarcados).toBeChecked()
    expect(checkbox(K.fclConflito)).toBeChecked()
    expect(checkbox(K.fclAtracado)).toBeChecked()
    expect(checkbox(K.fclEmbarcouComDi)).toBeChecked()
    expect(checkbox(K.fclSemEta)).not.toBeChecked()
    expect(createButton(3)).toBeEnabled()

    // Parcial: 1 de 4 elegiveis em "Aguardando embarque".
    const aguardando = screen.getByRole('checkbox', { name: 'Selecionar todos de Aguardando embarque (4)' })
    await user.click(checkbox(K.fclAgEmbarque))
    expect(aguardando).not.toBeChecked()
    expect(aguardando.indeterminate).toBe(true)
    await user.click(aguardando)
    expect(aguardando).toBeChecked()
    expect(aguardando.indeterminate).toBe(false)
    expect(createButton(7)).toBeEnabled()
    await user.click(aguardando)
    expect(createButton(3)).toBeEnabled()

    // Com o filtro, so' as visiveis entram: LCL tem 1.
    await user.click(embarcados)
    await user.selectOptions(screen.getByLabelText('Tipo'), 'LCL')
    expect(screen.getByRole('checkbox', { name: 'Selecionar todos de Aguardando embarque (1)' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Selecionar todos de Embarcado/ })).not.toBeInTheDocument()
  })

  it('caso-real: CR-59 com 1 selecionado: "Criar 1 processo", confirmacao no singular, foco no titulo e "Voltar" devolve o foco ao botao sem chamar o callback', async () => {
    const user = userEvent.setup()
    const onCreateProcesses = vi.fn()
    renderModal(modalProps({ onCreateProcesses }))
    await openCreateTab(user)
    expect(createButton(0)).toBeDisabled()
    await user.click(checkbox(K.lclAgEmbarque))
    await user.click(createButton(1))
    const title = screen.getByRole('heading', { name: 'Confirme os processos a criar' })
    expect(title).toHaveFocus()
    expect(screen.getByText(/Será criado 1 processo no Portal\./)).toBeInTheDocument()
    expect(screen.getByText(/Processos existentes não são alterados\./, { selector: 'p' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(createButton(1)).toHaveFocus()
    expect(onCreateProcesses).not.toHaveBeenCalled()
  })

  it('caso-real: CR-59 "Confirmar criação" chama o callback 1x com { key, process } sem id e com onProgress e recheck; clique duplo = 1 chamada', async () => {
    const user = userEvent.setup()
    const onCreateProcesses = vi.fn(() => new Promise(() => {}))
    renderModal(modalProps({ onCreateProcesses }))
    await openCreateTab(user)
    await user.click(checkbox(K.lclAgEmbarque))
    await user.click(createButton(1))
    await user.dblClick(screen.getByRole('button', { name: 'Confirmar criação' }))
    expect(onCreateProcesses).toHaveBeenCalledTimes(1)
    const [drafts, options] = onCreateProcesses.mock.calls[0]
    expect(drafts).toHaveLength(1)
    expect(Object.keys(drafts[0]).sort()).toEqual(['key', 'process'])
    expect(drafts[0].key).toBe(`LCL|${K.lclAgEmbarque}`)
    expect(drafts[0].process).toMatchObject({ name: K.lclAgEmbarque, category: 'LCL', houseBl: 'HBL-963', masterBl: '' })
    expect(drafts[0].process).not.toHaveProperty('id')
    expect(typeof options.onProgress).toBe('function')
    expect(typeof options.recheck).toBe('function')
  })

  it('caso-real: CR-59 o recheck reconcilia a MESMA planilha com a lista fresca e marca o casado', async () => {
    const user = userEvent.setup()
    const onCreateProcesses = vi.fn(() => new Promise(() => {}))
    renderModal(modalProps({ onCreateProcesses }))
    await openCreateTab(user)
    await user.click(checkbox(K.lclAgEmbarque))
    await user.click(createButton(1))
    await user.click(screen.getByRole('button', { name: 'Confirmar criação' }))
    const { recheck } = onCreateProcesses.mock.calls[0][1]
    const fresh = [FILLER, makePortalProcess({ id: 'p-novo', name: K.fclAgEmbarque, processNumber: '9620', category: 'FCL' })]
    const status = recheck(fresh)
    expect(status.get(`FCL|${K.fclAgEmbarque}`)).toEqual({ creatable: false, reason: 'casado', existingName: K.fclAgEmbarque })
    expect(status.get(`LCL|${K.lclAgEmbarque}`)).toEqual({ creatable: true, reason: '', existingName: '' })
    expect(recheck([]).size).toBe(0)
  })

  it('caso-real: CR-59 durante a gravacao da referencia o botao Criar fica desabilitado; com isCreatingProcesses o input da planilha e o botao tambem', async () => {
    const user = userEvent.setup()
    const props = { ...modalProps(), onSaveReference: vi.fn().mockResolvedValue(savedOutcome(3)) }
    const onClose = vi.fn()
    const { rerender } = render(<ErpReconcileModal open onClose={onClose} {...props} />)
    await openCreateTab(user)
    await user.click(checkbox(K.lclAgEmbarque))
    expect(createButton(1)).toBeEnabled()

    rerender(<ErpReconcileModal open onClose={onClose} {...props} isSavingReference />)
    expect(createButton(1)).toBeDisabled()
    rerender(<ErpReconcileModal open onClose={onClose} {...props} />)
    expect(createButton(1)).toBeEnabled()

    rerender(<ErpReconcileModal open onClose={onClose} {...props} isCreatingProcesses />)
    expect(createButton(1)).toBeDisabled()
    expect(document.querySelector('input[type="file"]')).toBeDisabled()
    expect(checkbox(K.lclAgEmbarque)).toBeDisabled()
  })

  it('caso-real: CR-59 progresso "Criando 1 de 2…" antes de qualquer onProgress e "Criando 2 de 2…" depois de { done: 1, total: 2 }', async () => {
    const user = userEvent.setup()
    const onCreateProcesses = vi.fn(() => new Promise(() => {}))
    renderModal(modalProps({ onCreateProcesses }))
    await openCreateTab(user)
    await user.click(checkbox(K.lclAgEmbarque))
    await user.click(checkbox(K.fclAgEmbarque))
    await user.click(createButton(2))
    await user.click(screen.getByRole('button', { name: 'Confirmar criação' }))
    const status = await screen.findByText('Criando 1 de 2…')
    expect(status.closest('[role="status"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Criar 2 processos' })).toBeDisabled()

    act(() => onCreateProcesses.mock.calls[0][1].onProgress({ done: 1, total: 2 }))
    expect(await screen.findByText('Criando 2 de 2…')).toBeInTheDocument()
  })

  it('caso-real: CR-59 resultado parcial com as 3 listas (criados, pulados, com erro) e o titulo focado', async () => {
    const user = userEvent.setup()
    const onCreateProcesses = vi.fn().mockResolvedValue({
      created: [{ key: `LCL|${K.lclAgEmbarque}`, id: 'PROC-t1', name: K.lclAgEmbarque }],
      skipped: [{ key: `FCL|${K.fclAgEmbarque}`, name: K.fclAgEmbarque, existingName: 'ALFA JA EXISTENTE' }],
      failed: [{ key: `CONSOLIDADO|${K.con}`, name: 'CON DG 964-26', message: 'Rascunho inválido (etd)' }],
    })
    renderModal(modalProps({ onCreateProcesses }))
    await openCreateTab(user)
    await user.click(checkbox(K.lclAgEmbarque))
    await user.click(createButton(1))
    await user.click(screen.getByRole('button', { name: 'Confirmar criação' }))
    const title = await screen.findByRole('heading', { name: 'Resultado da criação' })
    expect(title).toHaveFocus()
    expect(screen.getByText('1 processo criado · 1 pulado · 1 com erro')).toBeInTheDocument()
    expect(screen.getByText('1 processo criado · 1 pulado · 1 com erro').closest('[role="status"]')).not.toBeNull()
    const region = title.closest('section')
    expect(within(region).getByRole('heading', { name: 'Criados (1)' })).toBeInTheDocument()
    expect(within(region).getByText(`${K.lclAgEmbarque} (PROC-t1)`)).toBeInTheDocument()
    expect(within(region).getByRole('heading', { name: 'Pulados (já existiam) (1)' })).toBeInTheDocument()
    expect(within(region).getByText(`${K.fclAgEmbarque} — já existe: ALFA JA EXISTENTE`)).toBeInTheDocument()
    expect(within(region).getByRole('heading', { name: 'Com erro (1)' })).toBeInTheDocument()
    expect(within(region).getByText('CON DG 964-26: Rascunho inválido (etd)')).toBeInTheDocument()
  })

  it('caso-real: CR-66 o aviso de processos do Portal sem embarque casado aparece na aba e na confirmacao com a contagem; sem nenhum, nao aparece', async () => {
    const user = userEvent.setup()
    // FILLER nao casa com nenhum embarque da planilha: 1 em "Só no Portal".
    const view = renderModal(modalProps())
    await openCreateTab(user)
    const notice = screen.getByRole('note')
    expect(notice).toHaveTextContent('1 processo do Portal não casou com nenhum embarque desta planilha (aba "Só no Portal")')
    expect(notice).toHaveTextContent('criar de novo duplica o processo: confira antes.')
    // O aviso nao bloqueia: a linha continua marcavel.
    await user.click(checkbox(K.lclAgEmbarque))
    await user.click(createButton(1))
    expect(screen.getByRole('heading', { name: 'Confirme os processos a criar' })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('1 processo do Portal não casou com nenhum embarque')
    view.unmount()

    // 2 sem embarque casado: plural.
    const other = makePortalProcess({ id: 'p-outro', name: 'OUTRO PROCESSO', processNumber: '9998', category: 'FCL' })
    const second = renderModal(modalProps({ processes: [FILLER, other] }))
    await openCreateTab(user)
    expect(screen.getByRole('note')).toHaveTextContent('2 processos do Portal não casaram com nenhum embarque')
    second.unmount()

    // Todos os processos do Portal casam com a planilha: portalOnly = 0, sem aviso.
    const matched = makePortalProcess({ id: 'p-casado', name: K.fclAgEmbarque, processNumber: '9620', category: 'FCL' })
    renderModal(modalProps({ processes: [matched] }))
    await openCreateTab(user)
    expect(screen.getByRole('button', { name: /^Só no Portal \(0\)/ })).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('caso-real: CR-66 FCL ja gravado no Portal como consolidado (sem embarque casado, mesmo PEDIDO) vai para "Não criáveis" com o nome do processo e sai da contagem', async () => {
    const user = userEvent.setup()
    const legacy = makePortalProcess({
      id: 'p-legado', name: 'PROCESSO LEGADO', category: 'CONSOLIDADO', processNumber: '',
      purchaseOrders: [{ po: '9620', reference: '', supplierName: '' }],
    })
    renderModal(modalProps({ processes: [FILLER, legacy] }))
    await uploadFile(user)
    await screen.findByText('Processos casados')
    // 8 criaveis do cenario - o FCL ja existente = 7.
    expect(screen.getByRole('button', { name: /^Criar processos \(7\)/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Criar processos/ }))
    expect(screen.queryByRole('checkbox', { name: K.fclAgEmbarque })).not.toBeInTheDocument()
    const blocked = screen.getByRole('heading', { name: 'Não criáveis (2)' }).closest('section')
    const card = within(blocked).getByText(K.fclAgEmbarque).closest('li')
    expect(card).toHaveTextContent('Já tem processo no Portal com o mesmo PEDIDO ou nome da PO.')
    expect(card).toHaveTextContent('já existe: PROCESSO LEGADO')
  })

  it('caso-real: CR-61 com o callback devolvendo os processos criados: o Resumo sobe, as linhas somem da aba e a referencia e regravada com o resultado novo', async () => {
    const user = userEvent.setup()
    const onSaveReference = vi.fn().mockResolvedValue(savedOutcome(3))
    const onCreateProcesses = vi.fn(async (drafts) => outcomeFor(drafts))
    renderModal(modalProps({ onCreateProcesses, onSaveReference }))
    await uploadFile(user)
    expect((await summaryMetrics()).matched).toBe('0')
    expect(onSaveReference).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: /^Criar processos/ }))
    await user.click(checkbox(K.lclAgEmbarque))
    await user.click(checkbox(K.fclAgEmbarque))
    await user.click(createButton(2))
    await user.click(screen.getByRole('button', { name: 'Confirmar criação' }))

    expect(await screen.findByText('2 processos criados · 0 pulados · 0 com erro')).toBeInTheDocument()
    expect(onCreateProcesses).toHaveBeenCalledTimes(1)
    // D-F3-3: a referencia e regravada com a conciliacao nova (2 casados).
    await waitFor(() => expect(onSaveReference).toHaveBeenCalledTimes(2))
    expect(onSaveReference.mock.calls[1][0].summary.matched).toBe(2)
    expect(onSaveReference.mock.calls[0][0].summary.matched).toBe(0)
    // As linhas criadas somem da aba e a contagem cai.
    expect(screen.queryByRole('checkbox', { name: K.lclAgEmbarque })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: K.fclAgEmbarque })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Criar processos \(6\)/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Resumo/ }))
    expect(metric('Processos casados')).toBe('2')
  })

  it('caso-real: CR-61 callback rejeitado: error-banner e nenhuma 2a gravacao da referencia', async () => {
    const user = userEvent.setup()
    const onSaveReference = vi.fn().mockResolvedValue(savedOutcome(3))
    const onCreateProcesses = vi.fn().mockRejectedValue(new Error('lista vazia'))
    renderModal(modalProps({ onCreateProcesses, onSaveReference }))
    await openCreateTab(user)
    await user.click(checkbox(K.lclAgEmbarque))
    await user.click(createButton(1))
    await user.click(screen.getByRole('button', { name: 'Confirmar criação' }))
    await waitFor(() => expect(document.querySelector('.error-banner')).toBeInTheDocument())
    expect(document.querySelector('.error-banner')).toHaveTextContent('Não foi possível criar os processos.')
    expect(document.querySelector('.error-banner')).toHaveTextContent('lista vazia')
    expect(onSaveReference).toHaveBeenCalledTimes(1)
    // A conciliacao continua na tela e da' para tentar de novo.
    expect(screen.getByRole('button', { name: /^Criar processos \(8\)/ })).toBeInTheDocument()
    expect(checkbox(K.lclAgEmbarque)).toBeEnabled()
  })

  it('caso-real: CR-61 fechar no meio da criacao e reabrir: entrada e botao desabilitados; o onProgress e o resultado antigos nao escrevem no run novo', async () => {
    const user = userEvent.setup()
    let resolveOld
    const onCreateProcesses = vi.fn(() => new Promise((resolve) => { resolveOld = resolve }))
    const onSaveReference = vi.fn().mockResolvedValue(savedOutcome(3))
    const onClose = vi.fn()
    const props = { processes: PROCESSES, sources: [creationSource()], onCreateProcesses, onSaveReference }
    const { rerender } = render(<ErpReconcileModal open onClose={onClose} {...props} />)
    await openCreateTab(user)
    await user.click(checkbox(K.lclAgEmbarque))
    await user.click(createButton(1))
    await user.click(screen.getByRole('button', { name: 'Confirmar criação' }))
    expect(await screen.findByText('Criando 1 de 1…')).toBeInTheDocument()
    const { onProgress } = onCreateProcesses.mock.calls[0][1]

    // Fecha no meio: o resultado some, mas a trava (da pagina) segue de pe.
    await user.click(document.querySelector('.erp-reconcile__actions .ghost-button'))
    expect(onClose).toHaveBeenCalledTimes(1)
    rerender(<ErpReconcileModal open onClose={onClose} {...props} isCreatingProcesses />)
    expect(document.querySelector('input[type="file"]')).toBeDisabled()
    expect(screen.queryByText('Processos casados')).not.toBeInTheDocument()

    // O callback antigo termina: a trava solta e nada do run antigo aparece.
    await act(async () => {
      resolveOld(outcomeFor([{ key: `LCL|${K.lclAgEmbarque}`, process: { ...buildDraftProcess() } }]))
    })
    rerender(<ErpReconcileModal open onClose={onClose} {...props} />)
    await waitFor(() => expect(document.querySelector('input[type="file"]')).not.toBeDisabled())
    expect(onSaveReference).toHaveBeenCalledTimes(1)

    // Run novo: o onProgress do run antigo nao escreve e nao ha resultado herdado.
    await uploadFile(user)
    await screen.findByText('Processos casados')
    await user.click(screen.getByRole('button', { name: /^Criar processos/ }))
    act(() => onProgress({ done: 1, total: 1 }))
    expect(screen.queryByText(/^Criando \d de \d…$/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Resultado da criação' })).not.toBeInTheDocument()
    expect(onSaveReference).toHaveBeenCalledTimes(2)
  })

  // Rascunho minimo de um LCL valido (o conteudo nao importa: o callback antigo so' devolve processos).
  function buildDraftProcess() {
    return {
      name: K.lclAgEmbarque, category: 'LCL', processNumber: '9630', purchaseOrders: [], supplierName: 'BETA TRADING',
      originLocation: 'NINGBO', destination: 'NAVEGANTES', incoterm: 'FOB', vesselName: '', voyage: '', etd: '2026-10-18',
      eta: '2026-11-22', shippedAt: '', masterBl: '', houseBl: 'HBL-963', duimpNumber: '', duimpRegisteredAt: '',
      items: [{ commercialName: 'GLICOL UPSILON', quantity: 800 }],
    }
  }
})
