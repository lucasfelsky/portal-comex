// Specs unitarios de processLabels.js (feat/logistica-ve-nome-processo).
// Cobre o novo `canSeeProcessName(role)` e o comportamento de
// `getProcessTitle`/`getProcessSubtitle` com o flag `canSeeName`
// (renomeado de `isAdmin`, mesma semantica `Boolean(x)`).
import { describe, expect, it } from 'vitest'
import {
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

  it('categoria CONSOLIDADO -> sempre ""', () => {
    const process = { category: 'CONSOLIDADO', name: 'Consolidado X', processNumber: '9999' }
    expect(getProcessSubtitle(process, true)).toBe('')
  })

  it('caso normal (categoria nao-restrita, nao-CONSOLIDADO) -> "PO: <n>"', () => {
    const process = { category: 'FOB', name: 'Importação Soda', processNumber: '5678' }
    expect(getProcessSubtitle(process, false)).toBe('PO: 5678')
  })
})
