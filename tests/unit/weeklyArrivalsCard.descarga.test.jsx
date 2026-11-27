// Chegadas da semana: carga em descarga no CD mostra "Carga sendo descarregada" no selo, não "Recebida no CD".
// Dados inventados (repo público).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import WeeklyArrivalsCard from '../../src/features/processes/WeeklyArrivalsCard'

// Quarta-feira local; só `Date` é congelado.
const NOW = new Date(2026, 10, 25, 10, 0)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

const buildProcess = (collectionStatus) => ({
  id: 'proc-teste-001',
  name: 'ACME QUÍMICA',
  category: 'CONSOLIDADO',
  containerQuantity: 3,
  archived: false,
  processStatus: 'Carga recebida',
  collectionStatus,
  collectionWindows: [
    { id: 'w1', containerNumber: 1, scheduledAt: new Date(2026, 10, 25, 8, 0).toISOString() },
    { id: 'w2', containerNumber: 2, scheduledAt: new Date(2026, 10, 25, 8, 30).toISOString() },
    { id: 'w3', containerNumber: 3, scheduledAt: new Date(2026, 10, 25, 9, 0).toISOString() },
  ],
})

describe.each([
  ['desktop', { variant: 'desktop' }],
  ['legacy', {}],
])('WeeklyArrivalsCard (%s) - descarga no CD', (_name, props) => {
  it('mostra "Carga sendo descarregada" com o tom info e não "Recebida no CD"', () => {
    render(<WeeklyArrivalsCard processes={[buildProcess('Veículo no CD para descarga')]} canSeeName {...props} />)

    const badges = screen.getAllByText('Carga sendo descarregada')
    expect(badges.length).toBeGreaterThan(0)
    for (const badge of badges) {
      expect(badge.className).toContain('process-derived-status-badge')
      expect(badge.className).toContain('status-tag--info')
    }
    expect(screen.queryByText('Recebida no CD')).toBeNull()
  })

  it('controle: conferência continua mostrando "Recebida no CD"', () => {
    render(<WeeklyArrivalsCard processes={[buildProcess('Carga recebida, em conferência')]} canSeeName {...props} />)

    expect(screen.getAllByText('Recebida no CD').length).toBeGreaterThan(0)
    expect(screen.queryByText('Carga sendo descarregada')).toBeNull()
  })
})
