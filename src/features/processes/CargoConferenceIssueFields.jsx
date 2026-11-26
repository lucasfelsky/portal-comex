import { useId } from 'react'
import { CARGO_ISSUE_NOTE_MAX } from './cargoConferenceIssues'
import CargoConferencePhotoBlock from './CargoConferencePhotoBlock'

// S10-I do Relatório de Carga: bloco "avaria / ressalva" de UM item, igual no celular e no computador: as fotos (com
// `photoProps` = { tools, rowId, number, title }, S10-J1b) e a observação (até 1.000 caracteres), SEMPRE visíveis. Não há
// botão para "ativar" a avaria: o item TEM avaria quando a observação (aparada) não está vazia OU há pelo menos uma foto
// (`hasCargoRowIssue`, em `cargoConferenceIssues.js`). Somente leitura (`editable` falso): só as fotos e o texto, e nada
// quando o item não tem avaria. Apresentação pura: `onChange({ note })` leva a mudança ao chamador.

const PLACEHOLDER = 'O que aconteceu, onde, quantas unidades'

export default function CargoConferenceIssueFields({ issue, editable, itemLabel, variant = 'mobile', onChange, photoProps = null }) {
  const noteId = useId()
  const prefix = variant === 'desktop' ? 'crf-issue' : 'ccf-issue'
  const note = issue?.note ?? ''
  const photos = Array.isArray(issue?.photos) ? issue.photos : []
  const photoBlock = photoProps ? (
    <CargoConferencePhotoBlock {...photoProps} photos={photos} editable={editable} variant={variant} />
  ) : null

  if (!editable) {
    if (!note.trim() && photos.length === 0) return null
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
      <label className={`${prefix}__label`} htmlFor={noteId}>
        Observação da avaria ou ressalva (opcional)
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
