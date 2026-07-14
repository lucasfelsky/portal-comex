// Unit tests do syncBarStatus.mjs — cobrem o mapeamento OCR -> enum
// (a funcao `mapOcrTextToStatus`) sem precisar do emulador Firestore
// nem de rede. O fluxo completo (fetch imagem + OCR + gravar sugestao)
// é coberto por tests/scripts/syncBarStatus.e2e.test.js, que roda só
// quando FIRESTORE_EMULATOR_HOST está setado (mesmo padrao do
// syncExternalNews.e2e.test.js).

import { describe, expect, it } from 'vitest'
import { mapOcrTextToStatus } from '../../scripts/syncBarStatus.mjs'

describe('syncBarStatus — mapOcrTextToStatus', () => {
  it('mapeia "Condições da Barra: PRATICÁVEL" -> PRATICAVEL', () => {
    const result = mapOcrTextToStatus('Condições da Barra: PRATICÁVEL')
    expect(result).not.toBeNull()
    expect(result.value).toBe('PRATICAVEL')
    expect(result.tone).toBe('ok')
  })

  it('mapeia "PRATICAVEL" sem acento', () => {
    const result = mapOcrTextToStatus('PRATICAVEL')
    expect(result).not.toBeNull()
    expect(result.value).toBe('PRATICAVEL')
  })

  it('mapeia "PRATICÁVEL C/ RESTRIÇÕES" -> PRATICAVEL_RESTRICOES', () => {
    const result = mapOcrTextToStatus('Condições da Barra: PRATICÁVEL C/ RESTRIÇÕES')
    expect(result).not.toBeNull()
    expect(result.value).toBe('PRATICAVEL_RESTRICOES')
    expect(result.tone).toBe('warn')
  })

  it('mapeia "PRATICAVEL COM RESTRICOES" (variacao de texto)', () => {
    const result = mapOcrTextToStatus('PRATICAVEL COM RESTRICOES')
    expect(result).not.toBeNull()
    expect(result.value).toBe('PRATICAVEL_RESTRICOES')
  })

  it('mapeia "IMPRATICÁVEL" -> IMPRATICAVEL', () => {
    const result = mapOcrTextToStatus('Condições da Barra: IMPRATICÁVEL')
    expect(result).not.toBeNull()
    expect(result.value).toBe('IMPRATICAVEL')
    expect(result.tone).toBe('danger')
  })

  it('mapeia "IMPRATICAVEL" sem acento', () => {
    const result = mapOcrTextToStatus('IMPRATICAVEL')
    expect(result).not.toBeNull()
    expect(result.value).toBe('IMPRATICAVEL')
  })

  it('prioriza "restricoes" sobre "praticavel" sozinho (subset)', () => {
    // "PRATICAVEL C/ RESTRICOES" contém "praticavel" — precisa cair no
    // status com restricoes, não no praticavel puro.
    const result = mapOcrTextToStatus('PRATICAVEL C/ RESTRICOES')
    expect(result.value).toBe('PRATICAVEL_RESTRICOES')
  })

  it('prioriza "impraticavel" sobre "praticavel" (superstring)', () => {
    // "IMPRATICAVEL" contém "praticavel" como substring — precisa cair
    // no impraticavel, não no praticavel.
    const result = mapOcrTextToStatus('IMPRATICAVEL')
    expect(result.value).toBe('IMPRATICAVEL')
  })

  it('retorna null pra texto vazio', () => {
    expect(mapOcrTextToStatus('')).toBeNull()
    expect(mapOcrTextToStatus('   ')).toBeNull()
    expect(mapOcrTextToStatus(null)).toBeNull()
    expect(mapOcrTextToStatus(undefined)).toBeNull()
  })

  it('retorna null pra texto sem nenhum status conhecido', () => {
    expect(mapOcrTextToStatus('Condições do tempo: bom')).toBeNull()
    expect(mapOcrTextToStatus('Calado máximo: 10,5m')).toBeNull()
  })

  it('tolera ruido do OCR (caracteres estranhos, numeros)', () => {
    // OCR real da imagem da Praticagem retorna algo como:
    // "Ê, Condições da Barra:\nXX & PRATICÁVEL"
    const result = mapOcrTextToStatus('Ê, Condições da Barra:\nXX & PRATICÁVEL')
    expect(result).not.toBeNull()
    expect(result.value).toBe('PRATICAVEL')
  })
})