// UX-3b (D6): utilitario puro (sem React) para ligar erros de campo aos
// atributos de acessibilidade (`aria-invalid`/`aria-describedby`) e para
// focar um campo com erro (com fallback pro gatilho mobile do SelectField
// - `.select-field__trigger` - e pro resumo do formulario).

export function getFieldErrorId(domId) {
  return `${domId}-error`
}

// `hintIds` sao ids de `field-hint`/avisos nao-bloqueantes que tambem devem
// continuar referenciados por `aria-describedby` (mesmo com erro presente).
export function getFieldA11yProps(domId, error, hintIds = []) {
  const describedByIds = [error ? getFieldErrorId(domId) : null, ...hintIds].filter(Boolean)

  return {
    id: domId,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': describedByIds.length > 0 ? describedByIds.join(' ') : undefined,
  }
}

// Foca o campo pelo id do DOM. Se o alvo for um <select> dentro de
// `.select-field` com `.select-field__trigger` irmao (mobile - o SelectField
// esconde o <select> nativo atras de um botao), foca o gatilho no lugar.
// Sem alvo -> foca o fallback (o resumo de erros do formulario).
export function focusField(domId, fallbackId) {
  const doc = typeof document !== 'undefined' ? document : null
  if (!doc) return

  const element = doc.getElementById(domId)

  if (element) {
    if (element.tagName === 'SELECT') {
      const wrapper = element.closest('.select-field')
      const trigger = wrapper?.querySelector('.select-field__trigger')
      if (trigger) {
        trigger.focus()
        return
      }
    }
    element.focus()
    return
  }

  const fallback = fallbackId ? doc.getElementById(fallbackId) : null
  if (fallback) fallback.focus()
}
