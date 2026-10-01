// Contagens de carga com singular/plural em PT-BR ("1 contêiner", "2 contêineres",
// "0 pallets"). Fonte unica: antes havia 4 copias locais de `formatCargoUnit`.
// Singular SO' quando a quantidade e' exatamente 1; vazio/NaN conta como 0 (plural).
export function formatCargoUnit(quantity, singularLabel, pluralLabel) {
  const value = Number(quantity) || 0
  return `${value} ${value === 1 ? singularLabel : pluralLabel}`
}

export function formatContainerCount(quantity) {
  return formatCargoUnit(quantity, 'contêiner', 'contêineres')
}

export function formatPalletCount(quantity) {
  return formatCargoUnit(quantity, 'pallet', 'pallets')
}
