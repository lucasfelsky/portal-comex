
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/logger';
import nodemailer from 'nodemailer';
import { assertApprovedCaller } from '../core/shared.js';

const PTAX_API_BASE = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata';

function formatDateForPtax(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const year = String(date.getFullYear())
  return `${month}-${day}-${year}`
}
function getPtaxDateRange() {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - 7)

  return {
    start: formatDateForPtax(startDate),
    end: formatDateForPtax(endDate),
  }
}
async function fetchCurrencyRate(currencyCode) {
  const { start, end } = getPtaxDateRange()
  const requestUrl =
    `${PTAX_API_BASE}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@moeda='${currencyCode}'&@dataInicial='${start}'&@dataFinalCotacao='${end}'&$top=1&$orderby=dataHoraCotacao%20desc&$format=json`

  const response = await fetch(requestUrl, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Falha ao consultar PTAX para ${currencyCode}.`)
  }

  const payload = await response.json()
  const latestRate = payload?.value?.[0]

  if (!latestRate) {
    throw new Error(`Nenhuma cotação PTAX encontrada para ${currencyCode}.`)
  }

  return {
    currencyCode,
    buy: Number(latestRate.cotacaoCompra ?? 0),
    sell: Number(latestRate.cotacaoVenda ?? 0),
    quotedAt: latestRate.dataHoraCotacao ?? null,
  }
}
export const getDailyPtaxRates = onCall(async (request) => {
  await assertApprovedCaller(request.auth)

  const [usdResult, eurResult] = await Promise.allSettled([
    fetchCurrencyRate('USD'),
    fetchCurrencyRate('EUR'),
  ])

  const usdRate = usdResult.status === 'fulfilled' ? usdResult.value : null
  const eurRate = eurResult.status === 'fulfilled' ? eurResult.value : null

  if (usdResult.status === 'rejected') {
    logger.error('Falha ao consultar PTAX para USD.', usdResult.reason)
  }

  if (eurResult.status === 'rejected') {
    logger.error('Falha ao consultar PTAX para EUR.', eurResult.reason)
  }

  if (!usdRate && !eurRate) {
    throw new HttpsError('unavailable', 'Não foi possível consultar a PTAX no momento.')
  }

  return {
    usd: usdRate,
    eur: eurRate,
    updatedAt: usdRate?.quotedAt || eurRate?.quotedAt || null,
  }
})
