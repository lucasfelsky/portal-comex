// Fatia C: cartão "Descarga por unidade" (textos, selos, avisos, plurais, botões e somente leitura do mock v5). O cartão é
// "burro": recebe a conferência e devolve eventos. Relógio falso (11:40 de 27/11/2026). Dados inventados.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CargoUnloadCard from '../../src/features/processes/CargoUnloadCard'
import { patchCargoUnloadUnit } from '../../src/features/processes/cargoConferenceUnload'

const D = '2026-11-27T'
const FCL = {
  category: 'FCL',
  containers: [
    { id: 'CNT-1', number: 'DMOU1234560', type: '40HC' },
    { id: 'CNT-2', number: 'DMOU7654321', type: '40HC' },
    { id: 'CNT-3', number: 'DMOU2468135', type: '20DC' },
  ],
}
const AEREO = { category: 'AEREO' }

function conferenceOf(unloadByUnit = {}) {
  let conference = { unloadByUnit: {}, unloadStartAt: '', unloadEndAt: '', receivedDate: '' }
  for (const [id, entry] of Object.entries(unloadByUnit)) conference = patchCargoUnloadUnit(conference, id, entry)
  return conference
}

const IN_PROGRESS = {
  'CNT-1': { startAt: `${D}08:10`, endAt: `${D}09:35` },
  'CNT-2': { startAt: `${D}09:20`, endAt: `${D}10:30` },
  'CNT-3': { startAt: `${D}10:50`, endAt: '' },
}

function setup({ process = FCL, unloadByUnit = {}, editable = true, closed = false, conference } = {}) {
  const handlers = { onChange: vi.fn(), onStart: vi.fn(), onFinish: vi.fn(), onRemove: vi.fn() }
  const view = render(
    <CargoUnloadCard
      process={process}
      conference={conference ?? conferenceOf(unloadByUnit)}
      editable={editable}
      closed={closed}
      {...handlers}
    />
  )
  return { ...view, ...handlers }
}

const unit = (title) => screen.getByText(title, { selector: '.ccf-unit__t' }).closest('.ccf-unit')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(new Date(2026, 10, 27, 11, 40, 0))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CargoUnloadCard: FCL com 3 contêineres em andamento (mock v5)', () => {
  it('título, subtítulo, uma linha por contêiner com número e tipo', () => {
    setup({ unloadByUnit: IN_PROGRESS })
    expect(screen.getByRole('region', { name: 'Descarga por unidade' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Descarga por unidade' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Uma linha para cada contêiner do processo. Cada unidade tem o seu início e o seu fim. Horários de Brasília.'
      )
    ).toBeInTheDocument()
    expect(document.querySelectorAll('.ccf-unit')).toHaveLength(3)
    expect(unit('Contêiner 1 · DMOU1234560')).toHaveTextContent("40' High Cube")
    expect(unit('Contêiner 3 · DMOU2468135')).toHaveTextContent("20' Dry")
  })

  it('selos: duração, duração e "Em andamento · 50 min até agora" (borda de andamento só nessa)', () => {
    setup({ unloadByUnit: IN_PROGRESS })
    expect(unit('Contêiner 1 · DMOU1234560')).toHaveTextContent('1 h 25 min')
    expect(unit('Contêiner 2 · DMOU7654321')).toHaveTextContent('1 h 10 min')
    expect(unit('Contêiner 3 · DMOU2468135')).toHaveTextContent('Em andamento · 50 min até agora')
    expect(unit('Contêiner 3 · DMOU2468135')).toHaveClass('ccf-unit--run')
    expect(unit('Contêiner 1 · DMOU1234560')).not.toHaveClass('ccf-unit--run')
  })

  it('total 2 h 35 min com a soma das finalizadas, avisos de andamento e de sobreposição (tempo corrido 2 h 20 min)', () => {
    setup({ unloadByUnit: IN_PROGRESS })
    const total = document.querySelector('.ccf-total')
    expect(within(total).getByText('Tempo total de descarga')).toBeInTheDocument()
    expect(total.querySelector(':scope > b')).toHaveTextContent('2 h 35 min')
    expect(within(total).getByText('Soma das durações de 2 unidades finalizadas.')).toBeInTheDocument()
    expect(
      within(total).getByText('1 unidade em andamento não entra no total. O total é recalculado quando você informar o fim.')
    ).toBeInTheDocument()
    const overlap = within(total).getByText(/Há unidades que se sobrepõem\./)
    expect(overlap).toHaveTextContent(
      'O total soma cada unidade (mão de obra); o tempo corrido, do primeiro início ao último fim sem repetir a sobreposição, é de 2 h 20 min.'
    )
    // o tempo corrido é texto em negrito sem quebra, nunca o número grande da caixa
    expect(overlap.querySelector('b')).toHaveTextContent('2 h 20 min')
    expect(total.querySelector('b:not(.ccf-note b)')).toBe(total.querySelector(':scope > b'))
  })

  it('primeiro início e data de recebimento (o dia dele)', () => {
    setup({ unloadByUnit: IN_PROGRESS })
    const pair = document.querySelector('.ccf-pair')
    expect(within(pair).getByText('Primeiro início')).toBeInTheDocument()
    expect(within(pair).getByText('27/11/2026 08:10')).toBeInTheDocument()
    expect(within(pair).getByText('Data de recebimento')).toBeInTheDocument()
    expect(within(pair).getByText('27/11/2026')).toBeInTheDocument()
  })

  it('campos: nome acessível único por unidade, com o texto visível "Início"/"Fim"', () => {
    setup({ unloadByUnit: IN_PROGRESS })
    const start = screen.getByLabelText('Início da descarga · Contêiner 2 · DMOU7654321')
    expect(start).toHaveValue(`${D}09:20`)
    expect(start).toHaveAttribute('type', 'datetime-local')
    expect(start).toHaveAttribute('step', '60')
    expect(screen.getByLabelText('Fim da descarga · Contêiner 2 · DMOU7654321')).toHaveValue(`${D}10:30`)
    expect(screen.getAllByText('Início', { selector: 'label' })).toHaveLength(3)
    expect(screen.getAllByText('Fim', { selector: 'label' })).toHaveLength(3)
    const names = [...document.querySelectorAll('.ccf-unit input')].map((input) => input.getAttribute('aria-label'))
    expect(new Set(names).size).toBe(names.length)
  })

  it('"Finalizar agora" só na unidade com início e sem fim; "Iniciar agora" só na sem início', () => {
    const { onFinish, onStart } = setup({ unloadByUnit: { 'CNT-1': IN_PROGRESS['CNT-1'], 'CNT-3': IN_PROGRESS['CNT-3'] } })
    expect(screen.queryAllByRole('button', { name: 'Iniciar agora' })).toHaveLength(1)
    expect(screen.queryAllByRole('button', { name: 'Finalizar agora' })).toHaveLength(1)
    fireEvent.click(within(unit('Contêiner 3 · DMOU2468135')).getByRole('button', { name: 'Finalizar agora' }))
    expect(onFinish).toHaveBeenCalledWith('CNT-3')
    fireEvent.click(within(unit('Contêiner 2 · DMOU7654321')).getByRole('button', { name: 'Iniciar agora' }))
    expect(onStart).toHaveBeenCalledWith('CNT-2')
  })

  it('editar um campo chama onChange com a unidade e SÓ o campo mudado', () => {
    const { onChange } = setup({ unloadByUnit: IN_PROGRESS })
    fireEvent.change(screen.getByLabelText('Fim da descarga · Contêiner 3 · DMOU2468135'), { target: { value: `${D}11:10` } })
    expect(onChange).toHaveBeenCalledWith('CNT-3', { endAt: `${D}11:10` })
    fireEvent.change(screen.getByLabelText('Início da descarga · Contêiner 1 · DMOU1234560'), { target: { value: `${D}08:00` } })
    expect(onChange).toHaveBeenLastCalledWith('CNT-1', { startAt: `${D}08:00` })
  })

  it('o relógio avança de 1 em 1 minuto enquanto há unidade em andamento', () => {
    setup({ unloadByUnit: IN_PROGRESS })
    expect(unit('Contêiner 3 · DMOU2468135')).toHaveTextContent('50 min até agora')
    act(() => {
      vi.advanceTimersByTime(60000)
    })
    expect(unit('Contêiner 3 · DMOU2468135')).toHaveTextContent('Em andamento · 51 min até agora')
    act(() => {
      vi.advanceTimersByTime(60000 * 9)
    })
    expect(unit('Contêiner 3 · DMOU2468135')).toHaveTextContent('Em andamento · 1 h até agora')
  })

  it('sem unidade em andamento não há relógio; ao desmontar o relógio é limpo', () => {
    const idle = setup({ unloadByUnit: { 'CNT-1': IN_PROGRESS['CNT-1'] } })
    expect(vi.getTimerCount()).toBe(0)
    idle.unmount()
    const running = setup({ unloadByUnit: IN_PROGRESS })
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    running.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('CargoUnloadCard: tudo finalizado, singular e plural', () => {
  const ALL = {
    'CNT-1': { startAt: `${D}08:10`, endAt: `${D}09:35` },
    'CNT-2': { startAt: `${D}09:40`, endAt: `${D}10:30` },
    'CNT-3': { startAt: `${D}10:45`, endAt: `${D}11:30` },
  }

  it('3 finalizadas sem sobreposição: 85 + 50 + 45 = 3 h; sem aviso de sobreposição, de andamento nem de sem fim', () => {
    setup({ unloadByUnit: ALL })
    const total = document.querySelector('.ccf-total')
    expect(total.querySelector(':scope > b')).toHaveTextContent('3 h')
    expect(within(total).getByText('Soma das durações de 3 unidades finalizadas.')).toBeInTheDocument()
    expect(total).not.toHaveTextContent('sobrepõem')
    expect(total).not.toHaveTextContent('em andamento')
    expect(total).not.toHaveTextContent('sem fim')
  })

  it('singular: 1 unidade finalizada', () => {
    setup({ unloadByUnit: { 'CNT-1': ALL['CNT-1'] } })
    expect(screen.getByText('Soma das durações de 1 unidade finalizada.')).toBeInTheDocument()
  })

  it('plural do aviso de andamento: N unidades em andamento não entram no total', () => {
    setup({ unloadByUnit: { 'CNT-1': { startAt: `${D}08:10`, endAt: '' }, 'CNT-2': { startAt: `${D}09:40`, endAt: '' } } })
    expect(
      screen.getByText('2 unidades em andamento não entram no total. O total é recalculado quando você informar o fim.')
    ).toBeInTheDocument()
    expect(screen.getByText('Soma das durações de 0 unidades finalizadas.')).toBeInTheDocument()
    expect(document.querySelector('.ccf-total > b')).toHaveTextContent('—')
  })

  it('unidade nunca iniciada: selo "Não iniciada"', () => {
    setup({ unloadByUnit: { 'CNT-1': ALL['CNT-1'] } })
    expect(unit('Contêiner 2 · DMOU7654321')).toHaveTextContent('Não iniciada')
  })
})

describe('CargoUnloadCard: sem contêiner (aéreo, LCL) e estados do mock', () => {
  it('"Descarga única" com o subtítulo próprio e o total "—"', () => {
    setup({ process: AEREO, unloadByUnit: { unica: { startAt: `${D}08:10`, endAt: '' } } })
    expect(screen.getByText('Este processo não tem contêineres. A descarga é uma só. Horários de Brasília.')).toBeInTheDocument()
    expect(unit('Descarga única')).toHaveTextContent('Sem contêiner no processo (LCL ou aéreo)')
    expect(screen.getByLabelText('Início da descarga · Descarga única')).toHaveValue(`${D}08:10`)
    expect(document.querySelector('.ccf-total > b')).toHaveTextContent('—')
    expect(screen.getByText('Soma das durações de 0 unidades finalizadas.')).toBeInTheDocument()
  })

  it('conferência fechada: "Sem fim informado" e "1 unidade ficou sem fim e não entra no total."', () => {
    setup({ unloadByUnit: IN_PROGRESS, editable: false, closed: true })
    expect(unit('Contêiner 3 · DMOU2468135')).toHaveTextContent('Sem fim informado')
    expect(screen.getByText('1 unidade ficou sem fim e não entra no total.')).toBeInTheDocument()
    expect(document.querySelector('.ccf-total')).not.toHaveTextContent('em andamento')
    expect(unit('Contêiner 3 · DMOU2468135')).not.toHaveClass('ccf-unit--run')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('plural de sem fim: N unidades ficaram sem fim e não entram no total.', () => {
    setup({
      unloadByUnit: { 'CNT-1': { startAt: `${D}08:10`, endAt: '' }, 'CNT-2': { startAt: `${D}09:40`, endAt: '' } },
      editable: false,
      closed: true,
    })
    expect(screen.getByText('2 unidades ficaram sem fim e não entram no total.')).toBeInTheDocument()
  })

  it('somente leitura (fechada ou admin): campos desabilitados e nenhum botão', () => {
    setup({ unloadByUnit: IN_PROGRESS, editable: false })
    for (const input of document.querySelectorAll('.ccf-unit input')) expect(input).toBeDisabled()
    expect(screen.queryByRole('button')).toBeNull()
    // admin numa conferência aberta: a unidade sem fim segue "em andamento" (só a fechada vira "sem fim")
    expect(unit('Contêiner 3 · DMOU2468135')).toHaveTextContent('Em andamento · 50 min até agora')
  })

  it('erro de horários: selo "Corrigir horários", mensagem com role=alert e aria-invalid no campo certo', () => {
    setup({ unloadByUnit: { 'CNT-1': { startAt: `${D}10:00`, endAt: `${D}09:00` } } })
    const row = unit('Contêiner 1 · DMOU1234560')
    expect(row).toHaveTextContent('Corrigir horários')
    expect(within(row).getByRole('alert')).toHaveTextContent('O fim da descarga deve ser igual ou posterior ao início.')
    const end = screen.getByLabelText('Fim da descarga · Contêiner 1 · DMOU1234560')
    expect(end).toHaveAttribute('aria-invalid', 'true')
    expect(end).toHaveAccessibleDescription('O fim da descarga deve ser igual ou posterior ao início.')
    expect(screen.getByLabelText('Início da descarga · Contêiner 1 · DMOU1234560')).not.toHaveAttribute('aria-invalid')
    // o erro tira a unidade do total
    expect(screen.getByText('Soma das durações de 0 unidades finalizadas.')).toBeInTheDocument()
  })

  it('fim sem início: o erro cai no Início ("Informe o início da descarga.")', () => {
    setup({ unloadByUnit: { 'CNT-1': { startAt: '', endAt: `${D}09:00` } } })
    expect(screen.getByLabelText('Início da descarga · Contêiner 1 · DMOU1234560')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o início da descarga.')
    expect(screen.getByLabelText('Fim da descarga · Contêiner 1 · DMOU1234560')).not.toHaveAttribute('aria-invalid')
  })
})

describe('CargoUnloadCard: unidade fora do processo e registro anterior (D-4/D-5)', () => {
  it('unidade fora do processo: horários só leitura, selo de estado e "Remover horários"', () => {
    const { onRemove } = setup({ process: AEREO, unloadByUnit: { 'CNT-9': { startAt: `${D}07:00`, endAt: `${D}07:30` } } })
    const row = unit('Unidade fora do processo')
    expect(row).toHaveTextContent('Não existe mais neste processo.')
    expect(row).toHaveTextContent('30 min')
    expect(screen.getByLabelText('Início da descarga · Unidade fora do processo')).toBeDisabled()
    expect(screen.getByLabelText('Fim da descarga · Unidade fora do processo')).toBeDisabled()
    expect(within(row).queryByRole('button', { name: /agora/ })).toBeNull()
    fireEvent.click(within(row).getByRole('button', { name: 'Remover horários' }))
    expect(onRemove).toHaveBeenCalledWith('CNT-9')
    // continua entrando no total e no primeiro início enquanto existir
    expect(document.querySelector('.ccf-total > b')).toHaveTextContent('30 min')
    expect(screen.getByText('27/11/2026 07:00')).toBeInTheDocument()
  })

  it('órfã sem fim nunca é "em andamento" (não dá para finalizar): vira "Sem fim informado"', () => {
    setup({ process: AEREO, unloadByUnit: { 'CNT-9': { startAt: `${D}07:00`, endAt: '' } } })
    expect(unit('Unidade fora do processo')).toHaveTextContent('Sem fim informado')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('conferência antiga: "Registro anterior (sem unidade)" mostra o início/fim antigos, só leitura, e as unidades seguem vazias', () => {
    const old = {
      unloadByUnit: undefined,
      unloadStartAt: '2026-11-24T08:15',
      unloadEndAt: '2026-11-24T10:40',
      receivedDate: '2026-11-24',
    }
    const { onRemove } = setup({ process: AEREO, conference: old })
    const row = unit('Registro anterior (sem unidade)')
    expect(row).toHaveTextContent('2 h 25 min')
    expect(screen.getByLabelText('Início da descarga · Registro anterior (sem unidade)')).toHaveValue('2026-11-24T08:15')
    expect(screen.getByLabelText('Início da descarga · Registro anterior (sem unidade)')).toBeDisabled()
    expect(unit('Descarga única')).toHaveTextContent('Não iniciada')
    expect(document.querySelector('.ccf-total > b')).toHaveTextContent('2 h 25 min')
    expect(screen.getByText('24/11/2026 08:15')).toBeInTheDocument()
    expect(screen.getByText('24/11/2026')).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'Remover horários' }))
    expect(onRemove).toHaveBeenCalledWith('legado')
  })

  it('conferência fechada: nem "Remover horários" aparece', () => {
    setup({ process: AEREO, unloadByUnit: { 'CNT-9': { startAt: `${D}07:00`, endAt: `${D}07:30` } }, editable: false, closed: true })
    expect(screen.queryByRole('button', { name: 'Remover horários' })).toBeNull()
  })
})
