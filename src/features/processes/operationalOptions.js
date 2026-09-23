// F17.2a (D-2): listas fechadas + normalizadores de identificacao/carga
// perigosa. Funcao pura, sem React/firebase - mesma regra de import de
// `containers.js` (D-11).

export const INCOTERM_OPTIONS = [
  'EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP',
]

// D-2: classes/divisoes IMDG - valor gravado = codigo, label com acento pra UI.
export const IMO_CLASS_OPTIONS = [
  { value: '1', label: '1 — Explosivos' },
  { value: '2.1', label: '2.1 — Gases inflamáveis' },
  { value: '2.2', label: '2.2 — Gases não inflamáveis, não tóxicos' },
  { value: '2.3', label: '2.3 — Gases tóxicos' },
  { value: '3', label: '3 — Líquidos inflamáveis' },
  { value: '4.1', label: '4.1 — Sólidos inflamáveis' },
  { value: '4.2', label: '4.2 — Sujeitas a combustão espontânea' },
  { value: '4.3', label: '4.3 — Emitem gases inflamáveis em contato com água' },
  { value: '5.1', label: '5.1 — Oxidantes' },
  { value: '5.2', label: '5.2 — Peróxidos orgânicos' },
  { value: '6.1', label: '6.1 — Tóxicas' },
  { value: '6.2', label: '6.2 — Infectantes' },
  { value: '7', label: '7 — Material radioativo' },
  { value: '8', label: '8 — Corrosivas' },
  { value: '9', label: '9 — Diversas' },
]

const IMO_CLASS_VALUES = new Set(IMO_CLASS_OPTIONS.map((option) => option.value))

// D-2: normaliza removendo prefixo UN/espacos.
export function normalizeUnNumber(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/^UN\s*/, '')
    .replace(/\s+/g, '')
}

export function isValidUnNumber(value) {
  return /^\d{4}$/.test(normalizeUnNumber(value))
}

export function normalizeImoClass(value) {
  return IMO_CLASS_VALUES.has(value) ? value : ''
}

export function getImoClassLabel(value) {
  const match = IMO_CLASS_OPTIONS.find((option) => option.value === value)
  return match ? match.label : ''
}

// D-1: decimais aceitam virgula no input; >= 0; NaN -> 0.
export function normalizeDecimal(value) {
  const normalized = String(value ?? '').trim().replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export function normalizeInteger(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}
