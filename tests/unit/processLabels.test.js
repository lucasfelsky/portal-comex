// Specs unitarios de processLabels.js (feat/logistica-ve-nome-processo).
// Cobre o novo `canSeeProcessName(role)` e o comportamento de
// `getProcessTitle`/`getProcessSubtitle` com o flag `canSeeName`
// (renomeado de `isAdmin`, mesma semantica `Boolean(x)`).
import { describe, expect, it } from 'vitest'
import {
  PROCESS_NAME_VIEWER_ROLES,
  canSeeProcessName,
  getProcessTitle,
  getProcessSubtitle,
} from '../../src/features/processes/processLabels'

describe('canSeeProcessName', () => {
  it('admin -> true', () => {
    expect(canSeeProcessName('admin')).toBe(true)
  })

  it('logistica -> true', () => {
    expect(canSeeProcessName('logistica')).toBe(true)
  })

  it('tecnico -> true', () => {
    expect(canSeeProcessName('tecnico')).toBe(true)
  })

  it('faturamento -> true', () => {
    expect(canSeeProcessName('faturamento')).toBe(true)
  })

  it('user -> false', () => {
    expect(canSeeProcessName('user')).toBe(false)
  })

  it('compras -> false', () => {
    expect(canSeeProcessName('compras')).toBe(false)
  })

  it('viewer -> false', () => {
    expect(canSeeProcessName('viewer')).toBe(false)
  })

  it('undefined -> false', () => {
    expect(canSeeProcessName(undefined)).toBe(false)
  })
})

// Paridade front x backend: a lista de perfis que veem o nome vive em
// `processNameAccess.js` (front) e e espelhada em `functions/src/core/shared.js`.
describe('paridade canSeeProcessName x functions/src/core/shared.js', () => {
  const ROLES = ['admin', 'logistica', 'tecnico', 'faturamento', 'user', 'compras', 'viewer', '', undefined]
  const loadServer = () => import('../../functions/src/core/shared.js')

  it('as listas de perfis sao identicas', async () => {
    const server = await loadServer()
    expect([...server.PROCESS_NAME_VIEWER_ROLES].sort()).toEqual([...PROCESS_NAME_VIEWER_ROLES].sort())
  })

  it('canSeeProcessName(role) === canShowProcessNameForRole(FCL, role) para todos os perfis', async () => {
    const server = await loadServer()
    for (const role of ROLES) {
      expect(server.canShowProcessNameForRole({ category: 'FCL' }, role)).toBe(canSeeProcessName(role))
    }
  })

  it('buildRecipientProcessLabel: FCL mostra o nome para tecnico/faturamento e "PO <n>" para user/compras/viewer', async () => {
    const server = await loadServer()
    const process = { category: 'FCL', name: 'Importação Acetona', processNumber: '9036' }
    for (const role of ['admin', 'logistica', 'tecnico', 'faturamento']) {
      expect(server.buildRecipientProcessLabel(process, role)).toBe('Importação Acetona')
    }
    for (const role of ['user', 'compras', 'viewer']) {
      expect(server.buildRecipientProcessLabel(process, role)).toBe('PO 9036')
    }
  })
})

describe('getProcessTitle', () => {
  const restrictedProcess = { category: 'FCL', name: 'Importação Acetona', processNumber: '1234' }

  it('categoria restrita (FCL) + canSeeName=true -> retorna o nome', () => {
    expect(getProcessTitle(restrictedProcess, true)).toBe('Importação Acetona')
  })

  it('categoria restrita (FCL) + canSeeName=false -> retorna "PO: <n>"', () => {
    expect(getProcessTitle(restrictedProcess, false)).toBe('PO: 1234')
  })

  it('categoria restrita (LCL) + canSeeName=false -> retorna "PO: <n>"', () => {
    expect(getProcessTitle({ ...restrictedProcess, category: 'LCL' }, false)).toBe('PO: 1234')
  })

  it('categoria restrita (AEREO) + canSeeName=false -> retorna "PO: <n>"', () => {
    expect(getProcessTitle({ ...restrictedProcess, category: 'AEREO' }, false)).toBe('PO: 1234')
  })

  it('categoria nao-restrita (FOB) -> sempre retorna o nome, mesmo com canSeeName=false', () => {
    const process = { category: 'FOB', name: 'Importação Soda', processNumber: '5678' }
    expect(getProcessTitle(process, false)).toBe('Importação Soda')
    expect(getProcessTitle(process, true)).toBe('Importação Soda')
  })

  it('categoria nao-restrita (CONSOLIDADO) -> sempre retorna o nome', () => {
    const process = { category: 'CONSOLIDADO', name: 'Consolidado X', processNumber: '9999' }
    expect(getProcessTitle(process, false)).toBe('Consolidado X')
  })
})

describe('getProcessSubtitle', () => {
  it('categoria restrita + canSeeName=false -> mascarado ("")', () => {
    const process = { category: 'FCL', name: 'Importação Acetona', processNumber: '1234' }
    expect(getProcessSubtitle(process, false)).toBe('')
  })

  it('categoria restrita + canSeeName=true -> "PO: <n>"', () => {
    const process = { category: 'FCL', name: 'Importação Acetona', processNumber: '1234' }
    expect(getProcessSubtitle(process, true)).toBe('PO: 1234')
  })

  it('categoria CONSOLIDADO sem POs -> ""', () => {
    const process = {
      category: 'CONSOLIDADO',
      name: 'Consolidado X',
      processNumber: '9999',
      purchaseOrders: [],
    }
    expect(getProcessSubtitle(process, true)).toBe('')
  })

  it('caso normal (categoria nao-restrita, nao-CONSOLIDADO) -> "PO: <n>"', () => {
    const process = { category: 'FOB', name: 'Importação Soda', processNumber: '5678' }
    expect(getProcessSubtitle(process, false)).toBe('PO: 5678')
  })

  // F17.2c (D-10): CONSOLIDADO mostra o resumo de purchaseOrders[].
  it('categoria CONSOLIDADO com 3 POs -> "POs: A, B (+1)"', () => {
    const process = {
      category: 'CONSOLIDADO',
      name: 'Consolidado X',
      purchaseOrders: ['A', 'B', 'C'],
    }
    expect(getProcessSubtitle(process, true)).toBe('POs: A, B (+1)')
  })
})
