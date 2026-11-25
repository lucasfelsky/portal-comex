// S9-D do Relatório de Carga: nota sob o PESO LÍQ. da linha (desktop e cartão do celular). Mostra o tipo e de onde
// veio a embalagem ("deste fornecedor" ou "padrão do item"); sem embalagem cadastrada, o aviso e, para quem edita,
// o atalho "Cadastrar para <fornecedor>" (abre o cadastro rápido). Só apresentação.

function firstWord(name) {
  return String(name ?? '').trim().split(/\s+/)[0] ?? ''
}

// `packaging`: { packagingType, via } | null (de `deriveCargoReportRow`). `onRegister`: só em edição pelo COMEX.
// `hideWarning`: o cartão do celular já tem o selo "Sem embalagem cadastrada" no fim.
export default function CargoReportPackagingNote({
  packaging,
  noPackaging,
  code,
  supplierName,
  onRegister,
  showType = true,
  hideWarning = false,
}) {
  const name = String(supplierName ?? '').trim()
  const canRegister = noPackaging && typeof onRegister === 'function' && name !== ''
  return (
    <>
      {showType && packaging?.packagingType && !noPackaging ? (
        <span className="crf-pk">
          {`${packaging.packagingType} · ${packaging.via === 'supplier' ? 'deste fornecedor' : 'padrão do item'}`}
        </span>
      ) : null}
      {noPackaging && !hideWarning ? <span className="hint r">Sem embalagem cadastrada</span> : null}
      {canRegister ? (
        <button
          type="button"
          className="crf-linkbtn"
          aria-label={`Cadastrar embalagem de ${code} para ${name}`}
          onClick={onRegister}
        >
          {`Cadastrar para ${firstWord(name)}`}
        </button>
      ) : null}
    </>
  )
}
