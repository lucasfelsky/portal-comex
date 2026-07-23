// activeProcessContext: módulo simples para compartilhar o processo
// atualmente selecionado na página de Chegadas com o SupportButton.
// O ProcessesPage chama setActiveProcess() quando o usuário seleciona
// um processo; o SupportButton chama getActiveProcess() ao abrir chamado.

let activeProcess = null

export function setActiveProcess(process) {
  activeProcess = process ?? null
}

export function getActiveProcess() {
  return activeProcess
}

export function clearActiveProcess() {
  activeProcess = null
}