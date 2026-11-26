import { useRef } from 'react'
import Modal from '../../components/Modal'
import useCargoPhotoUrls from './useCargoPhotoUrls'

// S10-J1b do Relatório de Carga: ampliar a foto de avaria. Abre em `Modal` (portal no body: nada de `position: fixed`
// dentro do `.page-fade`). Foto reduzida a 1.600 px vinda da function de download; "Foto 2 de 3 · Item 1 · POLIOL",
// Anterior/Próxima (também pelas setas ← e →) e Fechar (foco inicial). `index` nulo = fechado.

export default function CargoPhotoViewer({ processId, photos, index, caption, onIndexChange, onClose }) {
  const closeRef = useRef(null)
  const open = index !== null && index !== undefined && Boolean(photos?.[index])
  const current = open ? photos[index] : null
  const { urlOf, statusOf, retry } = useCargoPhotoUrls(processId, current ? [current] : [], { size: 'full' })
  const total = photos?.length ?? 0
  const status = current ? statusOf(current.id) : 'loading'
  const url = current ? urlOf(current.id) : ''
  const position = `Foto ${index + 1} de ${total}${caption ? ` · ${caption}` : ''}`

  function go(delta) {
    const next = index + delta
    if (next < 0 || next >= total) return
    onIndexChange(next)
    // Chegou na primeira/última: Anterior/Próxima vira desabilitado; o foco vai para Fechar para as setas seguirem valendo.
    if (next === 0 || next === total - 1) closeRef.current?.focus()
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      go(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      go(1)
    }
  }

  return (
    <Modal open={open} onClose={onClose} bare wide ariaLabel="Foto da avaria" className="cph-viewer" initialFocusRef={closeRef}>
      {open ? (
        <div className="cph-viewer__body" onKeyDown={handleKeyDown}>
          <div className="cph-viewer__head">
            <h2 className="cph-viewer__caption" aria-live="polite">
              {position}
            </h2>
            <button type="button" className="secondary-button" ref={closeRef} onClick={onClose}>
              Fechar
            </button>
          </div>
          <div className="cph-viewer__stage">
            {status === 'ready' && url ? (
              <img className="cph-viewer__img" src={url} alt={position} />
            ) : status === 'error' ? (
              <div className="cph-viewer__msg" role="alert">
                <span>Foto indisponível.</span>
                <button type="button" className="secondary-button" onClick={() => retry(current.id)}>
                  Tentar de novo
                </button>
              </div>
            ) : (
              <p className="cph-viewer__msg" role="status">
                Carregando foto…
              </p>
            )}
          </div>
          <div className="cph-viewer__nav">
            <button type="button" className="secondary-button" disabled={index <= 0} onClick={() => go(-1)}>
              Anterior
            </button>
            <button type="button" className="secondary-button" disabled={index >= total - 1} onClick={() => go(1)}>
              Próxima
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
