import { useProcessFormContext, anyPending } from './processFormContext'

// Refino F4d (ProcessoForm.dc.html): "Dado pendente" 11/600 `--warning-700` logo
// abaixo do campo pendente (borda `--warning`). Dentro do <label className="field">,
// como os demais `field-hint`. `field` = chave ou lista de chaves (editores de
// lista: contêineres, itens, anuências, POs). Sem contexto (tablet/mobile) nao
// renderiza nada.
export default function PendingFieldHint({ field }) {
  const { isPending } = useProcessFormContext()
  if (!anyPending(isPending, field)) return null
  return <small className="field-hint field-hint--pending">Dado pendente</small>
}
