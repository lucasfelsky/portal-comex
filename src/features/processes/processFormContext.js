import { createContext, useContext } from 'react'

// Refino F4d: contexto do formulario de processo no desktop (modal). Os campos
// do wizard sao renderizados por varios componentes (ProcessTransitFields,
// ProcessCargoFields, ProcessArrivalFields, ProcessCustomsFields...); em vez de
// repassar props por todos eles, o dialogo fornece:
//   - `desktop`: a apresentacao em modal (>= 1041px). Fora dele o valor padrao e'
//     `false` e o DOM dos campos e' o de sempre (tablet/mobile e testes antigos);
//   - `isPending(key)`: a chave (`field` ou `id` de `PENDING_FIELD_RULES`) esta
//     pendente no RASCUNHO atual. So existe em edicao; o aviso some quando o
//     campo e' preenchido.
const DEFAULT_VALUE = { desktop: false, isPending: () => false }

export const ProcessFormContext = createContext(DEFAULT_VALUE)

export function useProcessFormContext() {
  return useContext(ProcessFormContext)
}

const PENDING_ATTRS = { 'data-pending': 'true' }
const NO_ATTRS = {}

// `field` pode ser uma chave ou uma lista (grupo: qualquer uma pendente basta).
export function anyPending(isPending, field) {
  return (Array.isArray(field) ? field : [field]).some((key) => isPending(key))
}

// Variante sem hook, para quem RENDERIZA o provider (o ProcessForm monta o JSX
// inline dos passos antes de o contexto existir na arvore dele).
export function pendingAttrsFor(isPending) {
  return (field) => (anyPending(isPending, field) ? PENDING_ATTRS : NO_ATTRS)
}

// `const pending = usePendingAttrs()` e `<label className="field" {...pending('etd')}>`:
// o atributo liga a borda de aviso (CSS) ao campo pendente.
export function usePendingAttrs() {
  const { isPending } = useContext(ProcessFormContext)
  return pendingAttrsFor(isPending)
}
