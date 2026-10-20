// activeProcessContext: módulo simples para compartilhar o processo
// atualmente selecionado na página de Chegadas com o SupportButton.
// O ProcessesPage chama setActiveProcess() quando o usuário seleciona
// um processo; o SupportButton chama getActiveProcess() ao abrir chamado.
//
// Refino visual F2: o AppLayout também precisa saber quando o detalhe de um
// processo está aberto (breadcrumb "Chegadas › <processo>" da topbar), então
// o módulo ganhou subscribeActiveProcess(listener). O listener recebe o
// processo ativo (ou null) a cada setActiveProcess/clearActiveProcess.

let activeProcess = null
const listeners = new Set()

function notify() {
  listeners.forEach((listener) => listener(activeProcess))
}

export function setActiveProcess(process) {
  activeProcess = process ?? null
  notify()
}

export function getActiveProcess() {
  return activeProcess
}

export function clearActiveProcess() {
  activeProcess = null
  notify()
}

export function subscribeActiveProcess(listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
