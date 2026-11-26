// S11-F: quem está logado, do ponto de vista da fila da leitura automática do COA (`coaAutoReadQueue`). A leitura é só
// admin e gasta créditos da Tess: se a conta sai (logout) ou muda (outro uid ou outro perfil), a fila para e é limpa.
//
// Módulo mínimo e sem dependências, para o `AuthContext` poder importá-lo sem puxar a fila (nem a callable) para o
// chunk principal. Quem informa é o `AuthContext` (efeito no perfil carregado); quem escuta é a fila.
// Isolamento entre testes: `resetCoaAutoReadActor()`.

let actor = null
const listeners = new Set()

// `next`: `{ uid, role }` do perfil carregado, ou nulo/sem uid quando não há sessão.
export function setCoaAutoReadActor(next) {
  const uid = String(next?.uid ?? '')
  const normalized = uid ? { uid, role: String(next?.role ?? '') } : null
  if (normalized?.uid === actor?.uid && normalized?.role === actor?.role) return
  actor = normalized
  listeners.forEach((listener) => listener())
}

export function subscribeCoaAutoReadActor(listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetCoaAutoReadActor() {
  actor = null
}
