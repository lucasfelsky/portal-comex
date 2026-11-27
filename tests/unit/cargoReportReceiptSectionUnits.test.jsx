// Fatia C: o card "Responsáveis e recebimento" do COMPUTADOR quando o celular registrou a descarga por unidade. Início e Fim
// ficam somente leitura (primeiro início e último fim, calculados), o tempo total segue fim - início (igual ao Excel) e a dica
// explica. Sem unidades, igual a antes. Dados inventados.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CargoReportReceiptSection from '../../src/features/processes/CargoReportReceiptSection'
import { EMPTY_CARGO_CONFERENCE } from '../../src/features/processes/cargoConferenceModel'

const D = '2026-11-27T'
const MAP = {
  'CNT-1': { startAt: `${D}08:10`, endAt: `${D}09:35` },
  'CNT-2': { startAt: `${D}09:20`, endAt: `${D}10:30` },
  'CNT-3': { startAt: `${D}10:50`, endAt: `${D}11:30` },
}

function setup(overrides = {}, props = {}) {
  const onChange = vi.fn()
  render(
    <CargoReportReceiptSection
      conference={{ ...EMPTY_CARGO_CONFERENCE, ...overrides }}
      onChange={onChange}
      canEdit
      radioName="t"
      {...props}
    />
  )
  return { onChange }
}

afterEach(cleanup)

describe('computador com descarga por unidade', () => {
  const withUnits = {
    unloadByUnit: MAP,
    unloadStartAt: `${D}08:10`,
    unloadEndAt: `${D}11:30`,
    receivedDate: '2026-11-27',
  }

  it('Início e Fim aparecem desabilitados com os calculados; o tempo total é fim - início (200 min), nunca a soma', () => {
    setup(withUnits)
    expect(screen.getByLabelText('Início da descarga')).toBeDisabled()
    expect(screen.getByLabelText('Início da descarga')).toHaveValue(`${D}08:10`)
    expect(screen.getByLabelText('Fim da descarga')).toBeDisabled()
    expect(screen.getByLabelText('Fim da descarga')).toHaveValue(`${D}11:30`)
    expect(screen.getByLabelText('Tempo total da descarga')).toHaveValue('200 min')
    expect(screen.getByLabelText('Data de recebimento')).toHaveValue('27/11/2026')
  })

  it('a nota explica de onde vêm os horários (plural e singular)', () => {
    setup(withUnits)
    expect(
      screen.getByText('Registrada por unidade no celular (3 unidades). Calculado: primeiro início ao último fim.')
    ).toBeInTheDocument()
    expect(screen.queryByText('Calculado: fim menos início.')).not.toBeInTheDocument()
    cleanup()
    setup({ unloadByUnit: { 'CNT-1': MAP['CNT-1'] }, unloadStartAt: `${D}08:10`, unloadEndAt: `${D}09:35` })
    expect(
      screen.getByText('Registrada por unidade no celular (1 unidade). Calculado: primeiro início ao último fim.')
    ).toBeInTheDocument()
  })

  it('unidade em andamento: o fim calculado é o maior fim das finalizadas', () => {
    setup({
      unloadByUnit: { ...MAP, 'CNT-3': { startAt: `${D}10:50`, endAt: '' } },
      unloadStartAt: `${D}08:10`,
      unloadEndAt: `${D}10:30`,
    })
    expect(screen.getByLabelText('Fim da descarga')).toHaveValue(`${D}10:30`)
    expect(screen.getByLabelText('Tempo total da descarga')).toHaveValue('140 min')
  })

  it('sem permissão de edição segue desabilitado, sem erro', () => {
    setup(withUnits, { canEdit: false })
    expect(screen.getByLabelText('Início da descarga')).toBeDisabled()
  })
})

describe('computador sem descarga por unidade (como hoje)', () => {
  it('conferência antiga: Início e Fim editáveis, tempo = fim - início e a dica de sempre', () => {
    const { onChange } = setup({ unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40' })
    expect(screen.getByLabelText('Início da descarga')).toBeEnabled()
    expect(screen.getByLabelText('Fim da descarga')).toBeEnabled()
    expect(screen.getByLabelText('Tempo total da descarga')).toHaveValue('145 min')
    expect(screen.getByText('Calculado: fim menos início.')).toBeInTheDocument()
    expect(screen.queryByText(/Registrada por unidade/)).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('mapa vazio ({}) também edita como hoje', () => {
    setup({ unloadByUnit: {} })
    expect(screen.getByLabelText('Início da descarga')).toBeEnabled()
    expect(screen.getByText('Calculado: fim menos início.')).toBeInTheDocument()
  })
})
