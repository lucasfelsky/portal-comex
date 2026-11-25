// S4 do Relatório de Carga: folha de impressão (larguras por coluna, 28 linhas, CSS que mantém 1 página)
// e ciclo de vida da classe `crf-printing` no body (afterprint, desmontagem e saídas alternativas).
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import CargoReportPrintSheet, {
  CargoReportPrintView,
  PRINT_BODY_CLASS,
  PRINT_COLUMNS,
} from '../../src/features/processes/CargoReportPrintSheet'

const css = fs.readFileSync(path.resolve(__dirname, '../../src/styles.css'), 'utf8').replace(/\r\n/g, '\n')

const row = (i) => ({
  id: `r${i}`,
  po: '4500123',
  dbcorpCode: 'AD5240',
  supplierDescription: 'DEA FOAM14339 - BOMBONA 25KG',
  sqDescription: 'DEA FOAM14339 - BB 25KG',
  ok: i % 2 === 0,
  supplierLot: 'DF2406A',
  lotSq: 'DF2406A450',
  wmsLabel: 'WMS-77120',
  sqLabel: 'SQ-001245',
  quantityKg: 12500,
  countOk: i % 2 === 1,
  netWeightKg: 25,
  packageWeightKg: 1.2,
  packages: 500,
})

const makeSheet = (count) => ({
  title: 'RELATÓRIO DE CARGA - ACME SEA 021-26',
  duimpNumber: '25BR00001234567',
  cargoType: 'FCL',
  rows: Array.from({ length: count }, (_, index) => row(index)),
  notes: 'obs',
  checkedByName: 'Operador Logística',
  labeledBy: 'A',
  labelMadeBy: 'B',
  receiptStatus: 'com_ressalva',
  receivedDateBr: '22/11/2026',
  unloadStartBr: '',
  unloadEndBr: '',
  unloadTotalMinutes: null,
  labelingOk: false,
  completedDateBr: '',
  nfNumber: '1',
  alerts: [],
})

// Bloco do `@media print` da folha, sem comentários.
function printCss() {
  const at = css.indexOf('@media print {')
  expect(at).toBeGreaterThan(0)
  return css.slice(at, css.indexOf('/* ============', at))
}

function ruleBody(block, selector) {
  const at = block.indexOf(`${selector} {`)
  expect(at, selector).toBeGreaterThanOrEqual(0)
  return block.slice(at, block.indexOf('}', at))
}

describe('CargoReportPrintView: larguras e linhas', () => {
  it('as colunas somam 100% e as de descrição são as mais largas', () => {
    expect(PRINT_COLUMNS).toHaveLength(14)
    const total = PRINT_COLUMNS.reduce((sum, column) => sum + column.width, 0)
    expect(total).toBeCloseTo(100, 5)

    const wide = PRINT_COLUMNS.filter((column) => column.wide)
    expect(wide.map((column) => column.key)).toEqual(['supplierDescription', 'sqDescription'])
    const narrow = PRINT_COLUMNS.filter((column) => !column.wide)
    const widestNarrow = Math.max(...narrow.map((column) => column.width))
    for (const column of wide) expect(column.width).toBeGreaterThanOrEqual(2 * widestNarrow)
  })

  it('renderiza um <colgroup> com a largura de cada coluna e a classe is-wide nas descrições', () => {
    const { container } = render(<CargoReportPrintView sheet={makeSheet(5)} />)

    const cols = [...container.querySelectorAll('colgroup col')]
    expect(cols).toHaveLength(14)
    expect(cols.map((col) => col.style.width)).toEqual(PRINT_COLUMNS.map((column) => `${column.width}%`))
    expect(cols.filter((col) => col.classList.contains('is-wide'))).toHaveLength(2)

    const firstRowCells = [...container.querySelectorAll('tbody tr')[0].children]
    expect(firstRowCells.filter((cell) => cell.classList.contains('is-wide'))).toHaveLength(2)
    expect(firstRowCells[9]).toHaveClass('is-number')
  })

  it('S6: CONTAGEM mostra ☑/☐ como o OK?, centralizada, e a soma das larguras segue 100%', () => {
    const countColumn = PRINT_COLUMNS.find((column) => column.key === 'countOk')
    expect(countColumn).toMatchObject({ label: 'CONTAGEM', center: true })
    expect(PRINT_COLUMNS.some((column) => column.key === 'count')).toBe(false)
    expect(PRINT_COLUMNS.reduce((sum, column) => sum + column.width, 0)).toBeCloseTo(100, 5)

    const { container } = render(<CargoReportPrintView sheet={makeSheet(2)} />)
    const [first, second] = [...container.querySelectorAll('tbody tr')].map((tr) => [...tr.children])
    expect(first[4]).toHaveTextContent('☑')
    expect(first[10]).toHaveTextContent('☐')
    expect(second[4]).toHaveTextContent('☐')
    expect(second[10]).toHaveTextContent('☑')
    expect(first[10]).toHaveClass('is-center')
  })

  it('S6: LOTE FORNEC. e LOTE SQ vão em span.crf-print__lot com o texto completo (sem reticências)', () => {
    const longRow = { ...row(0), supplierLot: '2609G00020GOWMWM8888', lotSq: '2609G00020GOWMWM8888GOO' }
    const { container } = render(<CargoReportPrintView sheet={{ ...makeSheet(1), rows: [longRow] }} />)
    const cells = [...container.querySelectorAll('tbody tr')[0].children]
    expect(cells[5].querySelector('span.crf-print__lot')).toHaveTextContent('2609G00020GOWMWM8888')
    expect(cells[6].querySelector('span.crf-print__lot')).toHaveTextContent('2609G00020GOWMWM8888GOO')
    expect(container.querySelectorAll('tbody span.crf-print__lot')).toHaveLength(2)
  })

  it('S9-E: a lista longa de NFs vai inteira no HTML do rodapé (o texto não é cortado antes do CSS)', () => {
    const list = Array.from({ length: 100 }, (_, index) => String(10000000 + index)).join('; ')
    const { container } = render(<CargoReportPrintView sheet={{ ...makeSheet(1), nfNumber: list }} />)
    expect(container.textContent).toContain(`Nº DA NF: ${list}`)
  })

  it('S9-E: na folha impressa o "Nº DA NF" fica em UMA linha com reticências (o rodapé tem teto de 32 mm); o dado completo é do HTML/Excel', () => {
    // LIMITE ACEITO PELO LUCAS (S9-E): na impressão o "Nº DA NF" mostra só a 1ª linha (≈ 6 NFs de 8 dígitos, ≈ 12 de
    // 5) com reticências; no Excel a célula I40 mostra ≈ 50 caracteres e corta na borda da mescla. A lista INTEIRA
    // (até 1.000 caracteres) fica guardada na conferência, no HTML e no valor da célula do Excel.
    // Medido em A4 paisagem: com as 7 linhas do recebimento o rodapé (max-height 32 mm) só tem espaço para 1 linha
    // de NF; o grid espreme o <p> até caber. Quebrar a linha não mostraria mais NFs sem aumentar o rodapé (o que
    // mudaria o layout) e tiraria as reticências que avisam do corte. Este teste trava o comportamento atual.
    const general = ruleBody(printCss(), '.crf-print__foot > div:not(:last-child) p')
    expect(general).toContain('white-space: nowrap')
    expect(general).toContain('text-overflow: ellipsis')
    expect(ruleBody(printCss(), '.crf-print__foot > div')).toContain('max-height: 32mm')
  })

  it('a tabela tem sempre 28 linhas: as vazias completam as preenchidas', () => {
    for (const filled of [0, 5, 28]) {
      const { container, unmount } = render(<CargoReportPrintView sheet={makeSheet(filled)} />)
      expect(container.querySelectorAll('tbody tr')).toHaveLength(28)
      expect(container.querySelectorAll('tbody tr[aria-hidden="true"]')).toHaveLength(28 - filled)
      unmount()
    }
  })

  it('acima de 28 linhas a tabela cresce (sem linhas vazias) e o rodapé continua uma vez só', () => {
    for (const filled of [29, 45, 200]) {
      const { container, unmount } = render(<CargoReportPrintView sheet={makeSheet(filled)} />)
      expect(container.querySelectorAll('tbody tr')).toHaveLength(filled)
      expect(container.querySelectorAll('tbody tr[aria-hidden="true"]')).toHaveLength(0)
      expect(container.querySelectorAll('thead tr')).toHaveLength(1)
      expect(container.querySelectorAll('.crf-print__foot')).toHaveLength(1)
      unmount()
    }
  })

  it('mostra os rótulos do modelo e o Nº da DUIMP', () => {
    render(<CargoReportPrintView sheet={makeSheet(1)} />)
    const region = screen.getByRole('region', { name: 'Visão de impressão do relatório de carga' })
    expect(region).toHaveTextContent('Nº da DUIMP: 25BR00001234567')
    expect(region).toHaveTextContent('☑ COM RESSALVA')
    expect(region).toHaveTextContent('☐ SEM RESSALVA')
  })

  const footerLines = () =>
    [...document.querySelectorAll('.crf-print__foot p')].map((line) => line.textContent)

  it('S8: descarga e etiquetagem OK em linhas próprias; DATA RECEBIMENTO mostra o dia derivado', () => {
    const sheet = {
      ...makeSheet(1),
      receivedDateBr: '24/11/2026',
      unloadStartBr: '24/11/2026 08:15',
      unloadEndBr: '24/11/2026 10:40',
      unloadTotalMinutes: 145,
      labelingOk: true,
    }
    render(<CargoReportPrintView sheet={sheet} />)
    const lines = footerLines()
    expect(lines).toContain('ETIQUETAGEM: OK · Operador Logística')
    expect(lines).toContain('DATA RECEBIMENTO: 24/11/2026')
    expect(lines).toContain('INÍCIO DA DESCARGA: 24/11/2026 08:15')
    expect(lines).toContain('FIM DA DESCARGA: 24/11/2026 10:40')
    expect(lines).toContain('TEMPO TOTAL DA DESCARGA: 145 min')
    // OBSERVAÇÕES continua só com as notas.
    expect(lines).toContain('OBSERVAÇÕES: obs')
    // ordem da 2ª coluna: recebimento, início, fim, tempo total, conclusão
    const order = ['DATA RECEBIMENTO', 'INÍCIO DA DESCARGA', 'FIM DA DESCARGA', 'TEMPO TOTAL DA DESCARGA', 'DATA CONCLUSÃO']
    const positions = order.map((label) => lines.findIndex((line) => line.startsWith(label)))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(positions.every((position) => position >= 0)).toBe(true)
  })

  it('S8: sem descarga e sem OK as linhas ficam só com o rótulo e a etiquetagem mostra só o nome', () => {
    render(<CargoReportPrintView sheet={makeSheet(1)} />)
    const lines = footerLines()
    expect(lines).toContain('ETIQUETAGEM: Operador Logística')
    expect(lines).toContain('INÍCIO DA DESCARGA: ')
    expect(lines).toContain('FIM DA DESCARGA: ')
    expect(lines).toContain('TEMPO TOTAL DA DESCARGA: ')
  })

  it('S8: etiquetagem OK sem nome mostra só "OK"', () => {
    render(<CargoReportPrintView sheet={{ ...makeSheet(1), checkedByName: '', labelingOk: true }} />)
    expect(footerLines()).toContain('ETIQUETAGEM: OK')
  })
})

describe('CSS da folha de impressão (1 página A4 paisagem)', () => {
  it('a tabela usa layout fixo e as células ficam em uma linha, com reticências e altura fixa', () => {
    const block = printCss()
    expect(ruleBody(block, '.crf-print__table')).toContain('table-layout: fixed')
    const cell = ruleBody(block, '.crf-print__table th,\n  .crf-print__table td')
    for (const declaration of ['white-space: nowrap', 'text-overflow: ellipsis', 'overflow: hidden', 'height: 4.6mm', 'max-height: 4.6mm']) {
      expect(cell).toContain(declaration)
    }
  })

  it('S6: o lote em 2 linhas quebra em qualquer ponto e fica menor, sem aumentar a altura da linha', () => {
    const lot = ruleBody(css, '.crf-print__table td .crf-print__lot')
    for (const declaration of ['overflow-wrap: anywhere', 'white-space: normal', 'display: block', 'max-height: 2em', 'font-size: 5.6pt']) {
      expect(lot).toContain(declaration)
    }
    // A regra mora dentro de um @media print (nunca vale na tela).
    const before = css.slice(0, css.indexOf('.crf-print__table td .crf-print__lot {'))
    expect(before.lastIndexOf('@media print {')).toBeGreaterThan(before.lastIndexOf('\n}\n'))
  })

  it('as descrições vão alinhadas à esquerda e o cabeçalho, rodapé e título têm altura limitada', () => {
    const block = printCss()
    expect(ruleBody(block, '.crf-print__head')).toContain('max-height: 20mm')
    expect(ruleBody(block, '.crf-print__title h1')).toContain('max-height: 2.3em')
    expect(ruleBody(block, '.crf-print__foot > div')).toContain('max-height: 32mm')
  })

  it('a folha usa a página nomeada A4 paisagem e fica 2 mm menor que a área útil', () => {
    expect(css).toContain('@page cargo-report {\n  size: A4 landscape;\n  margin: 8mm;\n}')
    expect(ruleBody(printCss(), 'body.crf-printing .crf-print')).toContain('width: calc(100% - 2mm)')
  })
})

describe('CargoReportPrintSheet: ciclo de vida do body.crf-printing', () => {
  let print

  beforeEach(() => {
    print = vi.spyOn(window, 'print').mockImplementation(() => {})
    document.body.classList.remove(PRINT_BODY_CLASS)
  })

  afterEach(() => {
    print.mockRestore()
    vi.restoreAllMocks()
    delete window.matchMedia
    document.body.classList.remove(PRINT_BODY_CLASS)
  })

  it('liga a classe e chama window.print uma vez', () => {
    render(<CargoReportPrintSheet sheet={makeSheet(2)} onDone={vi.fn()} />)
    expect(document.body).toHaveClass(PRINT_BODY_CLASS)
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('afterprint tira a classe e avisa uma só vez', () => {
    const onDone = vi.fn()
    render(<CargoReportPrintSheet sheet={makeSheet(2)} onDone={onDone} />)

    act(() => {
      window.dispatchEvent(new Event('afterprint'))
      window.dispatchEvent(new Event('afterprint'))
    })

    expect(document.body).not.toHaveClass(PRINT_BODY_CLASS)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('desmontar tira a classe mesmo sem afterprint e não deixa listener para trás', () => {
    const onDone = vi.fn()
    const { unmount } = render(<CargoReportPrintSheet sheet={makeSheet(2)} onDone={onDone} />)
    expect(document.body).toHaveClass(PRINT_BODY_CLASS)

    unmount()
    expect(document.body).not.toHaveClass(PRINT_BODY_CLASS)

    document.body.classList.add(PRINT_BODY_CLASS)
    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(document.body).toHaveClass(PRINT_BODY_CLASS) // listener removido: nada mexe na classe
    expect(onDone).not.toHaveBeenCalled()
  })

  it('o 1º beforeprint (da própria impressão) mantém a classe; um 2º com ela presa limpa e avisa', () => {
    const onDone = vi.fn()
    render(<CargoReportPrintSheet sheet={makeSheet(2)} onDone={onDone} />)

    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    expect(document.body).toHaveClass(PRINT_BODY_CLASS)
    expect(onDone).not.toHaveBeenCalled()

    // afterprint perdido; o usuário aperta Ctrl+P: novo beforeprint com a classe ainda ligada
    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    expect(document.body).not.toHaveClass(PRINT_BODY_CLASS)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('saída do modo de impressão (matchMedia print) também encerra', () => {
    let listener = null
    window.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: (_type, handler) => {
        listener = handler
      },
      removeEventListener: vi.fn(),
    }))
    const onDone = vi.fn()
    render(<CargoReportPrintSheet sheet={makeSheet(2)} onDone={onDone} />)
    expect(window.matchMedia).toHaveBeenCalledWith('print')

    act(() => listener({ matches: true }))
    expect(document.body).toHaveClass(PRINT_BODY_CLASS)
    expect(onDone).not.toHaveBeenCalled()

    act(() => listener({ matches: false }))
    expect(document.body).not.toHaveClass(PRINT_BODY_CLASS)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('o foco da janela só encerra bem depois do window.print (não corta a impressão em curso)', () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000_000)
    const onDone = vi.fn()
    render(<CargoReportPrintSheet sheet={makeSheet(2)} onDone={onDone} />)

    now.mockReturnValue(1_000_000 + 300)
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(document.body).toHaveClass(PRINT_BODY_CLASS)
    expect(onDone).not.toHaveBeenCalled()

    now.mockReturnValue(1_000_000 + 5000)
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(document.body).not.toHaveClass(PRINT_BODY_CLASS)
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
