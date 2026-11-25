import { useId } from 'react'
import Icon from '../../components/Icon'
import { CARGO_ISSUE_NOTE_MAX } from './cargoConferenceIssues'
import CargoConferencePhotoBlock from './CargoConferencePhotoBlock'

// S10-I do Relatório de Carga: bloco "avaria / ressalva" de UM item, igual no celular e no computador: botão
// "Registrar avaria / ressalva neste item" (`aria-pressed`) e a observação (até 1.000 caracteres). S10-J1b: com
// `photoProps` ({ tools, rowId, number, title }) o bloco traz as fotos do item antes do botão (mock aprovado). Somente
// leitura (`editable` falso): só as fotos e o texto, e nada quando o item não tem avaria. Apresentação pura:
// `onChange({ flagged?, note? })` leva a mudança parcial ao chamador.

const PLACEHOLDER = 'O que aconteceu, onde, quantas unidades'

export default function CargoConferenceIssueFields({ issue, editable, itemLabel, variant = 'mobile', onChange, photoProps = null }) {
  const noteId = useId()
  const prefix = variant === 'desktop' ? 'crf-issue' : 'ccf-issue'
  const flagged = issue?.flagged === true
  const note = issue?.note ?? ''
  const photos = Array.isArray(issue?.photos) ? issue.photos : []
  const photoBlock = photoProps ? (
    <CargoConferencePhotoBlock {...photoProps} photos={photos} editable={editable} variant={variant} />
  ) : null

  if (!editable) {
    if (!flagged && !note.trim() && photos.length === 0) return null
    return (
      <div className={prefix}>
        {photoBlock}
        <span className={`${prefix}__label`}>Observação da avaria ou ressalva</span>
        <p className={`${prefix}__text`}>{note.trim() || '(sem observação)'}</p>
      </div>
    )
  }

  return (
    <div className={prefix}>
      {photoBlock}
      <button
        type="button"
        className={`secondary-button ${prefix}__flag`}
        aria-pressed={flagged}
        aria-label={`Registrar avaria / ressalva neste ${itemLabel}`}
        onClick={() => onChange({ flagged: !flagged })}
      >
        <Icon name="alert-triangle" size={18} />
        Registrar avaria / ressalva neste item
      </button>
      <label className={`${prefix}__label`} htmlFor={noteId}>
        Observação da avaria ou ressalva
      </label>
      <textarea
        id={noteId}
        value={note}
        maxLength={CARGO_ISSUE_NOTE_MAX}
        placeholder={PLACEHOLDER}
        aria-label={`Observação da avaria ou ressalva do ${itemLabel}`}
        onChange={(event) => onChange({ note: event.target.value })}
      />
      <small className={`${prefix}__count`}>{`${note.length} de ${CARGO_ISSUE_NOTE_MAX.toLocaleString('pt-BR')}`}</small>
    </div>
  )
}
