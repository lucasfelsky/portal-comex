import { useEffect, useId, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { getFieldA11yProps, getFieldErrorId } from '../../utils/fieldErrors'
import {
  CARGO_NF_LIST_MAX_CHARS,
  CARGO_NF_MAX_CHARS,
  CARGO_NF_MAX_COUNT,
  addCargoNfs,
  formatCargoNfList,
  normalizeCargoNf,
  readCargoNfList,
  removeCargoNfAt,
} from './cargoNfList'

// S9-E do Relatório de Carga: campo "Nº da NF" da conferência como LISTA (chips + botão só com o ícone +). A verdade é `value`
// (o texto gravável, "NF1; NF2"). Enter e o botão + ("Adicionar NF") transformam o que está digitado em chips; colar com
// `;`/`,`/quebra de linha inclui várias de uma vez. NF recusada (duplicada, longa demais, limite) NÃO entra e fica
// no campo para corrigir.
//
// O que está digitado e ainda não virou chip já vale em `value` (o pai enxerga a NF, o formulário fica "sujo" e
// Salvar/Salvar e fechar gravam sem depender de o campo perder o foco). Por isso sair do campo NÃO mexe no layout:
// nada de chip novo nascendo no blur e empurrando a barra de ações no meio do clique.
// `variant`: 'desktop' | 'mobile' (só muda a classe; o alvo de toque de 44 px vem de .crf-wrap--mobile e .crf-nfs--mobile).

const PASTE_SEPARATORS = /[;,\n\r\t]/
const MESSAGE_DUPLICATE = 'Esta NF já está na lista.'
const MESSAGE_TOO_LONG = `Cada NF tem até ${CARGO_NF_MAX_CHARS} caracteres.`
const MESSAGE_LIMIT_CHARS = `A lista de NFs chegou ao limite de ${CARGO_NF_LIST_MAX_CHARS.toLocaleString('pt-BR')} caracteres.`
const MESSAGE_LIMIT_COUNT = `A lista de NFs chegou ao limite de ${CARGO_NF_MAX_COUNT} NFs.`

function describeAdded(added) {
  return added.length === 1 ? `NF ${added[0]} adicionada.` : `${added.length} NFs adicionadas: ${added.join(', ')}.`
}

// `withDuplicates`: a duplicada só avisa quando a pessoa confirma (Enter, Adicionar ou colar), não a cada tecla.
function describeRejection(result, withDuplicates) {
  if (result.overflow.length > 0) {
    return result.list.length >= CARGO_NF_MAX_COUNT ? MESSAGE_LIMIT_COUNT : MESSAGE_LIMIT_CHARS
  }
  if (result.tooLong.length > 0) return MESSAGE_TOO_LONG
  if (withDuplicates && result.duplicates.length > 0) return MESSAGE_DUPLICATE
  return ''
}

export default function CargoNfListField({
  value,
  onChange,
  disabled = false,
  label = 'Nº da NF',
  hint = null,
  variant = 'desktop',
}) {
  const id = useId()
  const inputRef = useRef(null)
  const removeRefs = useRef([])
  const pendingFocus = useRef(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [announcement, setAnnouncement] = useState('')
  // Quantas das últimas NFs de `value` vêm do texto digitado (ainda não são chips). Só vale se `value` for o último
  // texto que este campo emitiu; se o pai trocou o valor (descartar, recarregar), tudo conta como confirmado.
  const [draft, setDraft] = useState({ count: 0, emitted: '' })
  // O pai trocou `value` por fora (Descartar, guarda de saída, recarregar): o texto digitado, o erro e o rascunho
  // deixam de valer, senão o campo mostraria uma NF que o formulário não tem. Ajuste de estado durante o render.
  if (draft.emitted !== value && (text !== '' || error !== '' || draft.count > 0)) {
    setText('')
    setError('')
    setDraft({ count: 0, emitted: value })
  }
  const list = readCargoNfList(value)
  const draftCount = draft.emitted === value ? Math.min(draft.count, list.length) : 0
  const chipsList = list.slice(0, list.length - draftCount)
  const savedText = formatCargoNfList(list)
  const className = `crf-field crf-nfs${variant === 'mobile' ? ' crf-nfs--mobile' : ''}`

  // Depois de remover um chip, o foco vai para o seguinte (que ocupa o mesmo lugar), senão o anterior, senão o campo.
  useEffect(() => {
    const target = pendingFocus.current
    if (target === null) return
    pendingFocus.current = null
    const element = target < 0 ? inputRef.current : removeRefs.current[target]
    element?.focus()
  }, [value])

  // Emite o valor = chips confirmados + NFs válidas do texto digitado. Devolve o resultado de `addCargoNfs`.
  function emit(confirmed, raw, { confirm }) {
    const result = addCargoNfs(confirmed, raw)
    const nextValue = formatCargoNfList(result.list)
    if (nextValue !== value) onChange(nextValue)
    setDraft({ count: confirm ? 0 : result.added.length, emitted: nextValue })
    return result
  }

  function handleTextChange(next) {
    setText(next)
    const result = emit(chipsList, next, { confirm: false })
    setError(describeRejection(result, false))
  }

  function commit(raw) {
    if (!normalizeCargoNf(String(raw).replace(/[;,]/g, ' '))) {
      setText('')
      setError('')
      emit(chipsList, '', { confirm: true })
      return
    }
    const result = emit(chipsList, raw, { confirm: true })
    if (result.added.length > 0) setAnnouncement(describeAdded(result.added))
    setText(result.rejected.join('; '))
    setError(describeRejection(result, true))
  }

  function remove(index) {
    const nf = chipsList[index]
    pendingFocus.current = index < chipsList.length - 1 ? index : index - 1
    emit(removeCargoNfAt(chipsList, index), text, { confirm: false })
    setAnnouncement(`NF ${nf} removida.`)
    setError('')
  }

  function handleKeyDown(event) {
    if (event.key !== 'Enter' || event.nativeEvent?.isComposing) return
    event.preventDefault()
    commit(text)
  }

  function handlePaste(event) {
    const pasted = event.clipboardData?.getData('text') ?? ''
    if (!PASTE_SEPARATORS.test(pasted)) return
    event.preventDefault()
    const input = event.currentTarget
    const start = input.selectionStart ?? text.length
    const end = input.selectionEnd ?? start
    commit(`${text.slice(0, start)}${pasted}${text.slice(end)}`)
  }

  // Somente leitura mostra a lista INTEIRA (inclusive o que estava digitado e já vale em `value`); editável só os chips.
  const shownList = disabled ? list : chipsList
  const chips = shownList.length > 0 && (
    <ul className="crf-nfs__list" role="list" aria-label="NFs adicionadas">
      {shownList.map((nf, index) => (
        <li className="crf-nf-chip" key={nf}>
          <span className="crf-nf-chip__text">{nf}</span>
          {disabled ? null : (
            <button
              type="button"
              className="crf-nf-chip__x"
              aria-label={`Remover NF ${nf}`}
              ref={(element) => {
                removeRefs.current[index] = element
              }}
              onClick={() => remove(index)}
            >
              <Icon name="close" size={12} strokeWidth={2.2} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )

  if (disabled) {
    return (
      <div className={className}>
        <span className="crf-nfs__label">{label}</span>
        {chips || <span className="crf-nfs__empty">—</span>}
        {hint ? <span className="auto">{hint}</span> : null}
      </div>
    )
  }

  const savedId = `${id}-saved`
  const hintIds = [savedId, hint ? `${id}-hint` : null].filter(Boolean)

  return (
    <div className={className}>
      <label htmlFor={id}>{label}</label>
      <div className="crf-nfs__row">
        <input
          {...getFieldA11yProps(id, error, hintIds)}
          ref={inputRef}
          type="text"
          inputMode="text"
          enterKeyHint="done"
          autoComplete="off"
          maxLength={CARGO_NF_LIST_MAX_CHARS}
          value={text}
          onChange={(event) => handleTextChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
        <button
          type="button"
          className="secondary-button crf-nfs__add"
          aria-label="Adicionar NF"
          title="Adicionar NF"
          onClick={() => {
            commit(text)
            inputRef.current?.focus()
          }}
        >
          <Icon name="plus" size={18} strokeWidth={2.2} />
        </button>
      </div>
      {error ? (
        <small className="field-error" id={getFieldErrorId(id)}>
          {error}
        </small>
      ) : null}
      {chips}
      <span id={savedId} className="auto muted crf-nfs__saved">
        Fica salvo como: <strong>{savedText || '—'}</strong>
        {savedText ? ` · ${savedText.length.toLocaleString('pt-BR')} de ${CARGO_NF_LIST_MAX_CHARS.toLocaleString('pt-BR')} caracteres` : ''}
      </span>
      {hint ? (
        <span id={`${id}-hint`} className="auto">
          {hint}
        </span>
      ) : null}
      <span className="crf-nfs__live" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </div>
  )
}
