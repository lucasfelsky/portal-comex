// Fatia C (descarga por unidade): TRAVA do rodapé do FR.CMX.001 (Excel e impressão). Decisão do Lucas: o documento controlado
// continua EXATAMENTE como antes: TEMPO TOTAL = fim - início, com `unloadStartAt` = menor início e `unloadEndAt` = maior fim
// das unidades FINALIZADAS (calculados no payload). A soma das durações e o tempo corrido existem só na tela do celular.
// Os valores abaixo são literais de propósito: se alguém mudar o rodapé (para a soma 195 ou o tempo corrido 180, por exemplo),
// este arquivo quebra. Dados inventados (repositório público).
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { CargoReportPrintView } from '../../src/features/processes/CargoReportPrintSheet'
import { buildCargoReportXlsx } from '../../src/features/processes/cargoReportExcel'
import {
  buildConferencePayload,
  createEmptyCargoReportRow,
  fromCargoReportDoc,
  fromConferenceDoc,
} from '../../src/features/processes/cargoReportFormModel'
import { buildCargoReportSheet } from '../../src/features/processes/cargoReportSheet'

const TEMPLATE = new Uint8Array(
  fs.readFileSync(new URL('../../src/features/processes/cargoReportTemplate.xlsx', import.meta.url))
)
const PROCESS = { name: 'DEMO 001', duimpNumber: '25BR00001234567' }
const DAY = '2026-11-27T'

const FORM = {
  ...fromCargoReportDoc({ revision: 1, cargoType: 'FCL', titleSuffix: 'DEMO 001' }),
  rows: [
    {
      ...createEmptyCargoReportRow('r1'),
      po: '4500123',
      dbcorpCode: 'AD5240',
      supplierDescription: 'ITEM DEMO A - TAMBOR 200L',
      sqDescription: 'ITEM DEMO A',
      supplierLot: 'L-1',
      quantityKg: 4000,
      packageWeightKg: 1,
    },
  ],
}
const ROWS = FORM.rows

function payloadOf(extra) {
  return buildConferencePayload({ ...fromConferenceDoc({}), checkedByName: 'Operador Demo', ...extra }, ROWS, {
    actorName: 'Operador Demo',
  })
}

function sheetOf(conference) {
  return buildCargoReportSheet(FORM, { process: PROCESS, conference })
}

function footerCells(sheet) {
  const book = XLSX.read(buildCargoReportXlsx(TEMPLATE, sheet), { type: 'array', cellFormula: true })
  const cells = book.Sheets['SQ QUIMICA']
  return { b38: cells.B38?.v, i39: cells.I39?.v }
}

function printText(sheet) {
  return renderToStaticMarkup(createElement(CargoReportPrintView, { sheet })).replace(/<[^>]+>/g, '\n')
}

function expectFooter(conference, expected) {
  const sheet = sheetOf(conference)
  expect(sheet.unloadStartBr).toBe(expected.startBr)
  expect(sheet.unloadEndBr).toBe(expected.endBr)
  expect(sheet.unloadTotalMinutes).toBe(expected.minutes)
  expect(sheet.unloadSummary).toBe(expected.summary)
  expect(footerCells(sheet).b38).toBe(expected.summary)
  const text = printText(sheet)
  expect(text).toContain(`INÍCIO DA DESCARGA: ${expected.startBr}`)
  expect(text).toContain(`FIM DA DESCARGA: ${expected.endBr}`)
  expect(text).toContain(`TEMPO TOTAL DA DESCARGA: ${expected.minutes === null ? '' : `${expected.minutes} min`}`)
}

describe('rodapé do FR.CMX.001 não muda com a descarga por unidade', () => {
  it('caso 1: conferência antiga (sem unloadByUnit) = 145 min, em Excel e impressão', () => {
    const doc = { unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', receivedDate: '2026-11-24' }
    expectFooter(payloadOf(fromConferenceDoc(doc)), {
      startBr: '24/11/2026 08:15',
      endBr: '24/11/2026 10:40',
      minutes: 145,
      summary: 'DESCARGA: 24/11/2026, 08:15 ÀS 10:40 · TEMPO TOTAL: 145 MIN',
    })
    const cells = footerCells(sheetOf(payloadOf(fromConferenceDoc(doc))))
    expect(cells.i39).toBe('DATA RECEBIMENTO: 24/11/2026')
  })

  it('caso 1b: doc antigo regrava os MESMOS campos de hoje (campo a campo); a chave nova só entra vazia', () => {
    const doc = {
      status: 'aberta',
      revision: 3,
      okByRowId: { r1: true },
      receiptStatus: 'sem_ressalva',
      receivedDate: '2026-11-24',
      nfNumber: '000123',
      unloadStartAt: '2026-11-24T08:15',
      unloadEndAt: '2026-11-24T10:40',
      labelingOk: true,
      labelsByRowId: {},
      checkedByName: 'Operador Demo',
    }
    const { unloadByUnit, ...rest } = payloadOf(fromConferenceDoc(doc))
    expect(unloadByUnit ?? {}).toEqual({})
    expect(rest).toEqual({
      schemaVersion: 1,
      revision: 4,
      status: 'aberta',
      okByRowId: { r1: true },
      countOkByRowId: {},
      palletsByRowId: {},
      unitsByRowId: {},
      partialPallets: [],
      damageByRowId: {},
      labelsByRowId: {},
      checkedByName: 'Operador Demo',
      receiptStatus: 'sem_ressalva',
      receivedDate: '2026-11-24',
      nfNumber: '000123',
      notes: '',
      unloadStartAt: '2026-11-24T08:15',
      unloadEndAt: '2026-11-24T10:40',
      labelingOk: true,
      closedDate: '',
      closedById: '',
      closedByName: '',
      closedDocumentId: '',
    })
  })

  it('caso 2: três unidades (sobreposição e intervalo) = fim - início = 200 min; nunca a soma 195 nem o corrido 180', () => {
    const unloadByUnit = {
      'CNT-1': { startAt: `${DAY}08:10`, endAt: `${DAY}09:35` },
      'CNT-2': { startAt: `${DAY}09:20`, endAt: `${DAY}10:30` },
      'CNT-3': { startAt: `${DAY}10:50`, endAt: `${DAY}11:30` },
    }
    const payload = payloadOf({ unloadByUnit })
    expect(payload.unloadStartAt).toBe('2026-11-27T08:10')
    expect(payload.unloadEndAt).toBe('2026-11-27T11:30')
    expect(payload.receivedDate).toBe('2026-11-27')
    expectFooter(payload, {
      startBr: '27/11/2026 08:10',
      endBr: '27/11/2026 11:30',
      minutes: 200,
      summary: 'DESCARGA: 27/11/2026, 08:10 ÀS 11:30 · TEMPO TOTAL: 200 MIN',
    })
    const sheet = sheetOf(payload)
    expect(sheet.unloadTotalMinutes).not.toBe(195)
    expect(sheet.unloadTotalMinutes).not.toBe(180)
    expect(printText(sheet)).not.toContain('195 min')
    expect(printText(sheet)).not.toContain('180 min')
    expect(footerCells(sheet).b38).not.toContain('195')
    expect(footerCells(sheet).b38).not.toContain('180')
    expect(footerCells(sheet).i39).toBe('DATA RECEBIMENTO: 27/11/2026')
  })

  it('caso 3: uma unidade em andamento fica fora; o fim é o maior fim das finalizadas = 140 min', () => {
    const payload = payloadOf({
      unloadByUnit: {
        'CNT-1': { startAt: `${DAY}08:10`, endAt: `${DAY}09:35` },
        'CNT-2': { startAt: `${DAY}09:20`, endAt: `${DAY}10:30` },
        'CNT-3': { startAt: `${DAY}10:50`, endAt: '' },
      },
    })
    expect(payload.unloadEndAt).toBe('2026-11-27T10:30')
    expectFooter(payload, {
      startBr: '27/11/2026 08:10',
      endBr: '27/11/2026 10:30',
      minutes: 140,
      summary: 'DESCARGA: 27/11/2026, 08:10 ÀS 10:30 · TEMPO TOTAL: 140 MIN',
    })
  })

  it('caso 4: todas em andamento = só o início, como a conferência de hoje com só o início', () => {
    const payload = payloadOf({
      unloadByUnit: {
        'CNT-1': { startAt: `${DAY}08:10`, endAt: '' },
        'CNT-2': { startAt: `${DAY}09:20`, endAt: '' },
      },
    })
    expect(payload.unloadStartAt).toBe('2026-11-27T08:10')
    expect(payload.unloadEndAt).toBe('')
    expectFooter(payload, {
      startBr: '27/11/2026 08:10',
      endBr: '',
      minutes: null,
      summary: 'DESCARGA: INÍCIO 27/11/2026 08:10',
    })
  })
})
