// BackButton: botao de voltar com icone de seta (Sprint 31).
// Visivel apenas quando ha historico de navegacao interno.
//
// API:
//   <BackButton onClick={() => navigate(-1)} label="Voltar" />

import Icon from './Icon'

export default function BackButton({
  onClick,
  label = 'Voltar',
  className = '',
  show = true,
}) {
  if (!show) return null
  return (
    <button
      type="button"
      className={`ghost-button back-button ${className}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon name="chevron-left" size={16} className="back-button__icon" />
      <span className="back-button__label">{label}</span>
    </button>
  )
}
