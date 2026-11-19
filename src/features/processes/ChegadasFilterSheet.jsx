// Folha de filtros de Chegadas no mobile (remake, F4): bottom sheet com
// Categoria, Modal, Faixa de ETA, Etapa operacional e o switch "Só favoritos".
// Na aba Arquivadas (`archived`) so' Modal e "Só favoritos" aparecem: os demais
// nao afetam aquela lista. O RODAPE e' fixo dentro da folha (F7): "Limpar",
// "Ver N processos" e a acao secundaria "Exportar N processos" ficam sempre a
// vista e o conteudo (categoria, modal, ETA, etapa, favoritos) rola acima dele.
// O Exportar baixa a lista VISIVEL (a aplicada, nao o rascunho) e FECHA a folha
// antes de disparar (o toast de resultado nao cobre "Limpar"/"Ver N").
// Os filtros ficam num RASCUNHO local: o botao "Ver N processos" aplica tudo de
// uma vez (N e' calculado pelo pai com o rascunho); Esc, scrim e arrastar o
// grab fecham sem aplicar. Renderizada por Portal em document.body (evita o
// stacking context do PageFade). `.m-bsheet`/`.m-scrim` so' aparecem em <=720px
// (base `display: none` em styles.css).
//
// Acessibilidade: role="dialog" + aria-modal + aria-labelledby; foco preso e
// devolvido ao botao que abriu pelo useFocusTrap (Esc fecha); o grab e' um
// botao "Fechar filtros" (teclado e leitor de tela). O arrasto so' vale no grab
// (touch-action: none), entao a rolagem interna da folha nunca e' capturada.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../../components/Icon'
import Spinner from '../../components/Spinner'
import { useFocusTrap } from '../../hooks/useFocusTrap'

// Mesma duracao da transicao de `.m-bsheet` (mobile-redesign.css).
const EXIT_MS = 500
const DRAG_CLOSE_PX = 90
const DRAG_TAP_PX = 4

const DEFAULT_SHEET_FILTERS = {
  category: 'Todos',
  modal: 'all',
  etaStart: '',
  etaEnd: '',
  operation: 'Todos',
  favoritesOnly: false,
}

const MODAL_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'sea', label: 'Marítimo' },
  { value: 'air', label: 'Aéreo' },
]

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    Boolean(window.matchMedia('(prefers-reduced-motion: reduce)')?.matches)
  )
}

function ChipGroup({ labelId, options, value, onChange }) {
  return (
    <div className="m-chips m-chips--wrap" role="group" aria-labelledby={labelId}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="m-chip"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export default function ChegadasFilterSheet({
  initialFilters,
  categoryOptions,
  operationOptions,
  countFor,
  archived = false,
  exportCount = 0,
  isExporting = false,
  onExport,
  onApply,
  onClose,
}) {
  const sheetRef = useRef(null)
  const dragRef = useRef(null)
  const suppressClickRef = useRef(false)
  const closeTimerRef = useRef(0)
  const leavingRef = useRef(false)
  const onCloseRef = useRef(onClose)
  const [draft, setDraft] = useState(() => ({ ...DEFAULT_SHEET_FILTERS, ...initialFilters }))
  const [isOn, setIsOn] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)
  const titleId = useId()
  const categoryLabelId = useId()
  const modalLabelId = useId()
  const etaLabelId = useId()
  const operationLabelId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Entrada: monta fora da tela e so' no 2o frame ganha `--on` (a transicao
  // precisa de um estado inicial pintado).
  useEffect(() => {
    let inner = 0
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setIsOn(true))
    })
    return () => {
      window.cancelAnimationFrame(outer)
      window.cancelAnimationFrame(inner)
    }
  }, [])

  // O fundo nao rola enquanto a folha esta aberta.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), [])

  // `afterClose` roda DEPOIS de `onClose` (a folha ja saiu): usado pelo Exportar
  // para o toast so' aparecer com a folha fechada.
  const closeWith = useCallback((afterClose) => {
    if (leavingRef.current) return
    leavingRef.current = true
    setIsLeaving(true)
    setIsOn(false)
    const finish = () => {
      onCloseRef.current?.()
      // Um tick depois: a folha ja' foi desmontada quando o callback roda.
      if (afterClose) window.setTimeout(afterClose, 0)
    }
    if (prefersReducedMotion()) {
      finish()
      return
    }
    closeTimerRef.current = window.setTimeout(finish, EXIT_MS)
  }, [])

  const requestClose = useCallback(() => closeWith(), [closeWith])

  // Foco preso na folha enquanto aberta; Esc fecha; ao sair o foco volta para
  // quem abriu. `isLeaving` desliga a armadilha ja' na saida (a folha ainda
  // desliza por 500ms), entao o foco volta na hora.
  useFocusTrap(!isLeaving, requestClose, sheetRef)

  const count = useMemo(() => countFor(draft), [countFor, draft])
  // Rascunho diferente do que esta aplicado na lista: o export so' enxerga o aplicado.
  const appliedFilters = { ...DEFAULT_SHEET_FILTERS, ...initialFilters }
  const isDraftDirty = Object.keys(DEFAULT_SHEET_FILTERS).some((key) => draft[key] !== appliedFilters[key])

  const patch = (changes) => setDraft((current) => ({ ...current, ...changes }))

  function handleApply() {
    onApply(draft)
    requestClose()
  }

  // Exportar: fecha a folha e so' entao dispara (a lista exportada e' a que estava
  // visivel no clique: `onExport` ja' a capturou nesta renderizacao).
  function handleExport() {
    if (!onExport) return
    closeWith(() => onExport())
  }

  // Arrastar o grab: a folha acompanha o dedo sem transicao; > 90px fecha, senao
  // volta. Posicao via ref (sem re-render por pixel).
  function handleGrabPointerDown(event) {
    dragRef.current = { y: event.clientY, moved: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    if (sheetRef.current) sheetRef.current.style.transition = 'none'
  }

  function handleGrabPointerMove(event) {
    const drag = dragRef.current
    if (!drag || !sheetRef.current) return
    const delta = Math.max(0, event.clientY - drag.y)
    if (delta > DRAG_TAP_PX) drag.moved = true
    sheetRef.current.style.transform = `translateY(${delta}px)`
  }

  function handleGrabPointerEnd(event) {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    const delta = event.clientY - drag.y
    if (drag.moved) suppressClickRef.current = true
    if (sheetRef.current) {
      sheetRef.current.style.transition = ''
      sheetRef.current.style.transform = ''
    }
    if (delta > DRAG_CLOSE_PX) requestClose()
  }

  function handleGrabClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    requestClose()
  }

  const countLabel = `Ver ${count} ${count === 1 ? 'processo' : 'processos'}`
  const exportLabel = `Exportar ${exportCount} ${exportCount === 1 ? 'processo' : 'processos'}`
  const exportHint = `${exportLabel}: baixar em Excel a lista visível (busca e filtros aplicados)${
    isDraftDirty ? '. Filtros ainda não aplicados não entram' : ''
  }`

  // "Limpar": em Arquivadas so' zera os dois filtros que a aba mostra; os outros
  // (da lista de ativas) ficam como estao em vez de serem zerados as cegas.
  function handleReset() {
    setDraft((current) =>
      archived
        ? {
            ...current,
            modal: DEFAULT_SHEET_FILTERS.modal,
            favoritesOnly: DEFAULT_SHEET_FILTERS.favoritesOnly,
          }
        : { ...DEFAULT_SHEET_FILTERS }
    )
  }

  return createPortal(
    <>
      <div
        className={`m-scrim${isOn ? ' m-scrim--on' : ''}`}
        onClick={requestClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        className={`m-bsheet${isOn ? ' m-bsheet--on' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-hidden={isLeaving ? 'true' : undefined}
        tabIndex={-1}
      >
        <button
          type="button"
          className="m-bsheet__grab"
          aria-label="Fechar filtros"
          onPointerDown={handleGrabPointerDown}
          onPointerMove={handleGrabPointerMove}
          onPointerUp={handleGrabPointerEnd}
          onPointerCancel={handleGrabPointerEnd}
          onClick={handleGrabClick}
        >
          <span aria-hidden="true" />
        </button>
        <h3 id={titleId} className="m-bsheet__title">
          Filtros
        </h3>

        <div className="m-bsheet__body">
          {archived ? null : (
            <div>
              <div className="m-lbl" id={categoryLabelId}>
                Categoria
              </div>
              <ChipGroup
                labelId={categoryLabelId}
                options={[
                  { value: 'Todos', label: 'Todas' },
                  ...categoryOptions.map((item) => ({ value: item, label: item })),
                ]}
                value={draft.category}
                onChange={(category) => patch({ category })}
              />
            </div>
          )}

          <div>
            <div className="m-lbl" id={modalLabelId}>
              Modal
            </div>
            <ChipGroup
              labelId={modalLabelId}
              options={MODAL_OPTIONS}
              value={draft.modal}
              onChange={(modal) => patch({ modal })}
            />
          </div>

          {archived ? null : (
            <>
              <div>
                <div className="m-lbl" id={etaLabelId}>
                  Faixa de ETA
                </div>
                <div className="m-bsheet__dates" role="group" aria-labelledby={etaLabelId}>
                  <input
                    className="text-input"
                    type="date"
                    value={draft.etaStart}
                    onChange={(event) => patch({ etaStart: event.target.value })}
                    aria-label="ETA de"
                  />
                  <input
                    className="text-input"
                    type="date"
                    value={draft.etaEnd}
                    min={draft.etaStart || undefined}
                    onChange={(event) => patch({ etaEnd: event.target.value })}
                    aria-label="ETA até"
                  />
                </div>
              </div>

              <div>
                <div className="m-lbl" id={operationLabelId}>
                  Etapa operacional
                </div>
                <ChipGroup
                  labelId={operationLabelId}
                  options={[{ value: 'Todos', label: 'Todas' }, ...operationOptions.map((item) => ({ value: item, label: item }))]}
                  value={draft.operation}
                  onChange={(operation) => patch({ operation })}
                />
              </div>
            </>
          )}

          <div className="m-group">
            <button
              type="button"
              className="m-rowi"
              role="switch"
              aria-checked={draft.favoritesOnly}
              onClick={() => patch({ favoritesOnly: !draft.favoritesOnly })}
            >
              <span className="m-rowi__lead" aria-hidden="true">
                <Icon name="star" size={18} />
              </span>
              <span className="m-rowi__label">Só favoritos</span>
              <span className="m-switch" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="m-bsheet__foot">
          <button
            type="button"
            className="m-ghost m-ghost--block"
            onClick={handleReset}
          >
            Limpar
          </button>
          <button type="button" className="m-btn-mint m-btn-mint--block" onClick={handleApply}>
            {countLabel}
          </button>
          {onExport ? (
            <button
              type="button"
              className="m-ghost m-ghost--block m-bsheet__export"
              aria-label={exportHint}
              title={exportHint}
              disabled={exportCount === 0 || isExporting}
              onClick={handleExport}
            >
              {isExporting ? <Spinner size={14} /> : <Icon name="download" size={16} />}
              {exportLabel}
            </button>
          ) : null}
          {/* Em toque nao ha hover: o aviso do title/aria-label precisa de texto
              visivel quando o rascunho difere do que esta aplicado. */}
          {onExport && isDraftDirty ? (
            <p className="m-bsheet__export-note">Exporta a lista atual; filtros ainda não aplicados não entram.</p>
          ) : null}
        </div>
      </div>
    </>,
    document.body
  )
}
