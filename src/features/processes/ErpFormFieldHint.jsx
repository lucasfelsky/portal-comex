import { useLayoutEffect, useRef } from 'react'
import ErpHint from '../erp/ErpHint'
import { allowedErpApplyOperations } from '../erp/erpReference'
import { focusField } from '../../utils/fieldErrors'

// Aviso "ERP" do formulario de edicao (so' admin): envolve UM campo e mostra o
// chip logo abaixo dele. O clique no chip grava o valor do ERP NO RASCUNHO
// (`onDraftChange`, o mesmo callback de cada campo); nada e' persistido ate o
// "Salvar alterações". O chip fica FORA do <label>: o <button> e' rotulavel e,
// dentro do label, viraria o controle rotulado (o input perderia o nome).
// A allowlist de campos (`ERP_FORM_APPLY_FIELDS`) e' reaplicada aqui, no clique:
// so' o que passa por `allowedErpApplyOperations` e' gravado; sem nada valido, o chip vira so' aviso.
//
// `active` = o formulario esta com referencia do ERP (modo edicao). Ativo, o
// wrapper existe SEMPRE (com ou sem aviso): trocar a arvore quando o chip
// aparece/some remontaria o input e tiraria o foco no meio da digitacao. Inativo,
// devolve `children` intacto (o DOM e' o de sempre).
//
// Fica em `src/features/processes` (e nao em `src/features/erp`): a guarda de
// escopo do ERP fixa o numero de arquivos daquela pasta.
const FIELD_SELECTOR = 'input:not([type=checkbox]):not([type=file]), select, textarea'

export default function ErpFormFieldHint({ active = false, hint = null, onDraftChange, children }) {
  if (!active) return children
  return (
    <ErpFormFieldHintView hint={hint} onDraftChange={onDraftChange}>
      {children}
    </ErpFormFieldHintView>
  )
}

function ErpFormFieldHintView({ hint, onDraftChange, children }) {
  const wrapperRef = useRef(null)
  const pendingFocusRef = useRef(false)

  // Depois de aplicar, o chip some: o foco volta para o campo (senao cairia no body).
  useLayoutEffect(() => {
    if (!pendingFocusRef.current) return
    pendingFocusRef.current = false
    const target = wrapperRef.current?.querySelector(FIELD_SELECTOR)
    if (!target) return
    if (target.id) focusField(target.id)
    else target.focus()
  })

  const apply = allowedErpApplyOperations(hint?.apply)

  function handleApply() {
    if (!apply) return
    pendingFocusRef.current = true
    for (const operation of apply) onDraftChange(operation.field, operation.value)
  }

  return (
    <div className="erp-form-field" ref={wrapperRef}>
      {children}
      {hint ? <ErpHint hint={hint} onApply={apply ? handleApply : undefined} /> : null}
    </div>
  )
}
