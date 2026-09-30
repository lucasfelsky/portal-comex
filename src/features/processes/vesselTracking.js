// Rastreio de navio (botao "Rastrear navio" no bloco "Embarque e transito").
// Modulo puro, SEM imports: e' usado por `processDraftValidation.js`,
// `processesRepository.js` e componentes, e `tests/ui/ProcessesPage.test.jsx`
// mocka `processCategories` - por isso a categoria e' comparada por literal.

const VESSEL_CATEGORIES = ['FCL', 'LCL', 'CONSOLIDADO']

// "IMO 9787027" -> "9787027". Retorna a string resultante (pode ser invalida;
// quem valida e' `isValidVesselImo`).
export function normalizeVesselImo(value) {
  return String(value ?? '')
    .trim()
    .replace(/^IMO[\s:.#-]*/i, '')
    .replace(/\s+/g, '')
}

// Vazio e' valido (campo opcional). Senao: 7 digitos + digito verificador
// (soma de d[i] * (7 - i), i = 0..5, mod 10 === d[6]).
export function isValidVesselImo(value) {
  const imo = normalizeVesselImo(value)
  if (imo === '') return true
  if (!/^\d{7}$/.test(imo)) return false

  let sum = 0
  for (let index = 0; index < 6; index += 1) {
    sum += Number(imo[index]) * (7 - index)
  }

  return sum % 10 === Number(imo[6])
}

export function isVesselTrackingCategory(category) {
  return VESSEL_CATEGORIES.includes(category)
}

export function buildVesselFinderEmbedUrl(imo, { height = 420, referrer = '' } = {}) {
  return (
    'https://www.vesselfinder.com/aismap' +
    '?zoom=undefined&lat=undefined&lon=undefined' +
    `&width=100%25&height=${height}` +
    `&names=true&imo=${imo}&track=true` +
    '&fleet=false&fleet_name=false&fleet_hide_old_positions=false' +
    '&clicktoact=false&store_pos=false' +
    `&ra=${encodeURIComponent(referrer)}`
  )
}

export function buildVesselFinderDetailsUrl(imo) {
  return `https://www.vesselfinder.com/vessels/details/${imo}`
}

export function buildMarineTrafficUrl(imo) {
  return `https://www.marinetraffic.com/en/ais/details/ships/imo:${imo}`
}

export function buildVesselFinderSearchUrl(name) {
  return `https://www.vesselfinder.com/vessels?name=${encodeURIComponent(name)}`
}

export function getVesselTrackingTarget(process) {
  if (!isVesselTrackingCategory(process?.category)) return null

  const name = String(process?.vesselName ?? '').trim()
  const rawImo = normalizeVesselImo(process?.vesselImo)
  const hasValidImo = rawImo !== '' && isValidVesselImo(rawImo)

  if (hasValidImo) {
    return { mode: 'embed', imo: rawImo, name, voyage: String(process?.voyage ?? '').trim() }
  }

  if (name) return { mode: 'search', name }

  return null
}
