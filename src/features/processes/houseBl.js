// D-F3-1: nos maritimos (FCL, LCL e CONSOLIDADO) o Portal tem UM so' campo de BL,
// o "House BL". Processos legados que so' tem `masterBl` continuam aparecendo
// pelo mesmo campo (leitura `houseBl || masterBl`), sem migracao de dados.
// Modulo puro: nenhum import (nao e' mockado pelo `ProcessesPage.test.jsx`).

function text(value) {
  return String(value ?? '').trim()
}

// Valor EXIBIDO e comparado: o House BL; sem ele, o MBL antigo. Nao objeto ou
// nada preenchido -> ''.
export function getHouseBl(process) {
  return text(process?.houseBl) || text(process?.masterBl)
}

// Valor do <input>: cru (sem trim, para nao comer o espaco digitado) quando ha'
// House BL; senao o `masterBl` cru.
export function getHouseBlInputValue(process) {
  if (text(process?.houseBl) !== '') return process.houseBl
  return String(process?.masterBl ?? '')
}

// Edicao do campo "House BL". Editar GRAVA em `houseBl` e LIMPA o `masterBl`
// antigo (senao apagar o campo faria o MBL reaparecer). Se o valor voltar a ser
// exatamente o de antes (igualdade exata com o que o campo mostrava na base),
// restaura o par original: nada de "BL atualizado" espurio nem formulario sujo
// sem mudanca. Salvar sem tocar no campo nunca passa por aqui.
export function applyHouseBlInput(draft, value, baseline = null) {
  const next = String(value ?? '')
  if (baseline && typeof baseline === 'object' && next === String(getHouseBlInputValue(baseline))) {
    return { ...draft, houseBl: baseline.houseBl ?? '', masterBl: baseline.masterBl ?? '' }
  }
  return { ...draft, houseBl: next, masterBl: '' }
}
