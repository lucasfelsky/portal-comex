// F18b-1 (B5): `planDocumentIndexBackfill` (funcao pura, sem I/O) do script
// de backfill do `documentIndex`.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { planDocumentIndexBackfill } from '../../scripts/backfillDocumentIndex.mjs'

describe('planDocumentIndexBackfill', () => {
  it('processo sem documentos e sem documentIndex -> inalterado', () => {
    const plan = planDocumentIndexBackfill([{ id: 'P1' }], {})
    expect(plan).toEqual([
      {
        id: 'P1',
        before: { fispqItemIds: [], containerWashIds: [] },
        after: { fispqItemIds: [], containerWashIds: [] },
        changed: false,
      },
    ])
  })

  it('processo com documentos e sem documentIndex previo -> muda', () => {
    const plan = planDocumentIndexBackfill(
      [{ id: 'P2' }],
      {
        P2: [
          { type: 'fispq', itemId: 'ITEM-1' },
          { type: 'containerWash', containerId: 'CNT-1' },
        ],
      }
    )
    const [entry] = plan
    expect(entry.changed).toBe(true)
    expect(entry.after).toEqual({ fispqItemIds: ['ITEM-1'], containerWashIds: ['CNT-1'] })
  })

  it('documentIndex ja bate com a subcolecao -> inalterado', () => {
    const plan = planDocumentIndexBackfill(
      [{ id: 'P3', documentIndex: { fispqItemIds: ['ITEM-1'], containerWashIds: [] } }],
      { P3: [{ type: 'fispq', itemId: 'ITEM-1' }] }
    )
    expect(plan[0].changed).toBe(false)
  })

  it('documentIndex velho (falta item novo) -> muda', () => {
    const plan = planDocumentIndexBackfill(
      [{ id: 'P4', documentIndex: { fispqItemIds: ['ITEM-1'], containerWashIds: [] } }],
      {
        P4: [
          { type: 'fispq', itemId: 'ITEM-1' },
          { type: 'fispq', itemId: 'ITEM-2' },
        ],
      }
    )
    expect(plan[0].changed).toBe(true)
    expect(plan[0].after.fispqItemIds).toEqual(['ITEM-1', 'ITEM-2'])
  })

  it('lista de processos vazia -> []', () => {
    expect(planDocumentIndexBackfill([], {})).toEqual([])
    expect(planDocumentIndexBackfill(undefined, undefined)).toEqual([])
  })
})
