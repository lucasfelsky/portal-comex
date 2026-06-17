export function isMaritimeCategory(category) {
  return category === 'FCL' || category === 'LCL' || category === 'CONSOLIDADO'
}

export function isAirCategory(category) {
  return category === 'AEREO'
}

export function isRestrictedCategory(category) {
  return category === 'FCL' || category === 'LCL' || category === 'AEREO'
}

export function shouldShowContainerQuantity(category) {
  return category !== 'AEREO' && category !== 'LCL'
}