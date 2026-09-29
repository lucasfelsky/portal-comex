// L38 (Parte C): `planTokenRevocation` (funcao pura) do script de revogacao
// de tokens de download dos documentos do processo.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { planTokenRevocation } from '../../scripts/revokeProcessDocumentTokens.mjs'

const withToken = (name) => ({ name, metadata: { metadata: { firebaseStorageDownloadTokens: 'tok-1' } } })

describe('planTokenRevocation', () => {
  it('inclui bl, fispq e containerWash com token', () => {
    const files = [
      withToken('processes/p1/documents/bl/1-u1-bl.pdf'),
      withToken('processes/p1/documents/fispq/ITEM-1/1-u1-f.pdf'),
      withToken('processes/p2/documents/containerWash/CNT-1/1-u1-w.pdf'),
    ]
    expect(planTokenRevocation(files).map((f) => f.name)).toEqual(files.map((f) => f.name))
  })

  it('exclui objetos sem token ou com token vazio', () => {
    const files = [
      { name: 'processes/p1/documents/bl/a.pdf', metadata: { metadata: {} } },
      { name: 'processes/p1/documents/bl/b.pdf', metadata: {} },
      { name: 'processes/p1/documents/bl/c.pdf' },
      { name: 'processes/p1/documents/bl/d.pdf', metadata: { metadata: { firebaseStorageDownloadTokens: '  ' } } },
    ]
    expect(planTokenRevocation(files)).toEqual([])
  })

  it('nunca inclui post-receipt, news, supportTickets nem prefixo parecido', () => {
    const files = [
      withToken('processes/p1/post-receipt/x.jpg'),
      withToken('news/capa.jpg'),
      withToken('supportTickets/t1/print.png'),
      withToken('processes/p1/documentsX/y.pdf'),
    ]
    expect(planTokenRevocation(files)).toEqual([])
  })

  it('entrada invalida -> lista vazia', () => {
    expect(planTokenRevocation(undefined)).toEqual([])
  })
})
