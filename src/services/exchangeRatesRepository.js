const PTAX_API_BASE = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata'

function formatDateForPtax(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const year = String(date.getFullYear())
  return `${month}-${day}-${year}`
}

function getDateRange() {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - 7)

  return {
    start: formatDateForPtax(startDate),
    end: formatDateForPtax(endDate),
  }
}

async function fetchCurrencyRate(currencyCode) {
  const { start, end } = getDateRange()
  const requestUrl =
    `${PTAX_API_BASE}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@moeda='${currencyCode}'&@dataInicial='${start}'&@dataFinalCotacao='${end}'&$top=1&$orderby=dataHoraCotacao%20desc&$format=json`

  const response = await fetch(requestUrl, {
    headers: {
      Accept: 'application/json',
    },
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

export async function getDailyPtaxRates() {
  const [usdRate, eurRate] = await Promise.all([
    fetchCurrencyRate('USD'),
    fetchCurrencyRate('EUR'),
  ])

  return {
    usd: usdRate,
    eur: eurRate,
    updatedAt: usdRate.quotedAt || eurRate.quotedAt,
  }
}
