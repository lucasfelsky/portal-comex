// F17.4b (B-1/B-6/B-8): cobertura de `src/features/processes/receiptDivergence.js`
// (fonte) + paridade com o espelho puro
// `functions/src/core/receiptDivergence.js`. Este arquivo esta' em
// `tests/unit/` (nao entra na contagem fixa do `audit-vault-counts`).
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  RECEIPT_DIVERGENCE_TYPES,
  MAX_RECEIPT_DIVERGENCE_NOTES,
  normalizeReceiptDivergenceFields,
  hasReceiptDivergence,
} from '../../src/features/processes/receiptDivergence.js'
import {
  RECEIPT_DIVERGENCE_TYPES_MIRROR,
  normalizeReceiptDivergenceFieldsMirror,
  isReceiptDivergenceReportedMirror,
} from '../../functions/src/core/receiptDivergence.js'

describe('normalizeReceiptDivergenceFields (B-1)', () => {
  it('flag false zera tipo/notas', () => {
    expect(
      normalizeReceiptDivergenceFields({
        receiptDivergence: false,
        receiptDivergenceType: 'Avaria',
        receiptDivergenceNotes: 'algo',
      })
    ).toEqual({ receiptDivergence: false, receiptDivergenceType: '', receiptDivergenceNotes: '' })

    expect(normalizeReceiptDivergenceFields({})).toEqual({
      receiptDivergence: false,
      receiptDivergenceType: '',
      receiptDivergenceNotes: '',
    })
  })

  it('tipo fora da lista -> ""', () => {
    expect(
      normalizeReceiptDivergenceFields({ receiptDivergence: true, receiptDivergenceType: 'Outro' })
        .receiptDivergenceType
    ).toBe('')
  })

  it('notas com 2001 caracteres cortam em MAX_RECEIPT_DIVERGENCE_NOTES (2000)', () => {
    const notes = 'x'.repeat(2001)
    const result = normalizeReceiptDivergenceFields({ receiptDivergence: true, receiptDivergenceNotes: notes })
    expect(result.receiptDivergenceNotes).toHaveLength(MAX_RECEIPT_DIVERGENCE_NOTES)
  })

  it('trimText: false preserva espacos', () => {
    const result = normalizeReceiptDivergenceFields(
      { receiptDivergence: true, receiptDivergenceNotes: '  caixa amassada  ' },
      { trimText: false }
    )
    expect(result.receiptDivergenceNotes).toBe('  caixa amassada  ')
  })

  it('trimText default (true) apara espacos', () => {
    const result = normalizeReceiptDivergenceFields({
      receiptDivergence: true,
      receiptDivergenceNotes: '  caixa amassada  ',
    })
    expect(result.receiptDivergenceNotes).toBe('caixa amassada')
  })
})

describe('hasReceiptDivergence', () => {
  it('so true quando a flag e\' exatamente true', () => {
    expect(hasReceiptDivergence({ receiptDivergence: true })).toBe(true)
    expect(hasReceiptDivergence({ receiptDivergence: 'true' })).toBe(false)
    expect(hasReceiptDivergence({})).toBe(false)
  })
})

describe('paridade B-8 (src x mirror)', () => {
  it('RECEIPT_DIVERGENCE_TYPES_MIRROR === RECEIPT_DIVERGENCE_TYPES', () => {
    expect(RECEIPT_DIVERGENCE_TYPES_MIRROR).toEqual(RECEIPT_DIVERGENCE_TYPES)
  })

  const flags = [true, false, 'true', undefined]
  const types = ['Avaria', 'Falta', 'Sobra', 'Lote', 'Outro', '', undefined]
  const notesValues = ['', '  x  ', 'x'.repeat(2001), undefined]

  it('normalizeReceiptDivergenceFieldsMirror === normalizeReceiptDivergenceFields (matriz completa, trimText true)', () => {
    for (const receiptDivergence of flags) {
      for (const receiptDivergenceType of types) {
        for (const receiptDivergenceNotes of notesValues) {
          const input = { receiptDivergence, receiptDivergenceType, receiptDivergenceNotes }
          expect(normalizeReceiptDivergenceFieldsMirror(input)).toEqual(
            normalizeReceiptDivergenceFields(input)
          )
        }
      }
    }
  })

  it('notificacao e marco usam a MESMA funcao isReceiptDivergenceReportedMirror', () => {
    expect(isReceiptDivergenceReportedMirror({ receiptDivergence: false }, { receiptDivergence: true })).toBe(
      true
    )
    expect(isReceiptDivergenceReportedMirror({ receiptDivergence: true }, { receiptDivergence: true })).toBe(
      false
    )
    expect(isReceiptDivergenceReportedMirror({}, {})).toBe(false)
  })
})
