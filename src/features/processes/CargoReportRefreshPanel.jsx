// S9-C do Relatório de Carga: prévia do "Atualizar do processo e do FUP". Fica DENTRO do card Itens (sem
// `position: fixed`). Lista as diferenças com caixa de seleção: o que o usuário editou à mão vem desmarcado e
// nada é aplicado sem a escolha dele. Relatório novo com itens só no FUP / só no processo abre na mesma lista.

// Círculo de informação das notas (mesmo traço do mock; o `Icon` do app não tem este ícone).
export function CargoInfoIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  )
}

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

// "O FUP mudou", "O processo mudou" ou "O processo e o FUP mudaram", conforme a origem dos itens.
function buildHeadline(mode, items) {
  if (mode === 'pending') return `Itens que estão só no FUP ou só no processo (${items.length}).`
  const sources = new Set(items.map((item) => item.source))
  const subject = sources.has('P') && sources.has('F') ? 'O processo e o FUP mudaram' : sources.has('P') ? 'O processo mudou' : 'O FUP mudou'
  return `${subject} desde que você preencheu (${plural(items.length, 'alteração', 'alterações')}).`
}

export default function CargoReportRefreshPanel({ panel, onToggle, onApply, onDismiss }) {
  if (!panel) return null
  const { mode, items, selected } = panel

  if (mode === 'refresh' && items.length === 0) {
    return (
      <div className="crf-note crf-note--ok crf-refresh" role="status">
        <CargoInfoIcon />
        <div className="crf-refresh__body">
          <b>Tudo em dia.</b> Processo e FUP não mudaram desde que você preencheu.
        </div>
        <button type="button" className="secondary-button crf-refresh__close" onClick={onDismiss}>
          Fechar
        </button>
      </div>
    )
  }

  const selectedSet = new Set(selected)
  return (
    <div className="crf-note crf-note--warn crf-refresh" role="region" aria-label="Diferenças do processo e do FUP">
      <CargoInfoIcon />
      <div className="crf-refresh__body">
        <p>
          <b>{buildHeadline(mode, items)}</b>{' '}
          {mode === 'pending'
            ? 'Escolha o que entra.'
            : 'Escolha o que aplicar; o que você editou à mão nunca é sobrescrito sem aparecer aqui.'}
        </p>
        <div className="crf-diff">
          {items.map((item) => (
            <label key={item.id} className={`crf-diffrow${item.applicable ? '' : ' is-info'}`}>
              <input
                type="checkbox"
                checked={item.applicable && selectedSet.has(item.id)}
                disabled={!item.applicable}
                onChange={() => onToggle(item.id)}
              />
              <span className="crf-diffrow__text">
                <b>{item.title}</b>
                <small>{item.detail}</small>
              </span>
              <span className="crf-diffrow__kind">{item.kind}</span>
            </label>
          ))}
        </div>
        <div className="crf-refresh__actions">
          <button type="button" className="primary-button" disabled={selected.length === 0} onClick={onApply}>
            Aplicar selecionadas
          </button>
          <button type="button" className="secondary-button" onClick={onDismiss}>
            Agora não
          </button>
        </div>
      </div>
    </div>
  )
}
