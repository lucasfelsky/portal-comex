import { useId, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { CARGO_PHOTOS_PER_ROW } from './cargoConferenceIssues'
import { describeCargoPhotoLimit } from './cargoConferencePhotos'
import CargoPhotoViewer from './CargoPhotoViewer'
import useCargoPhotoUrls from './useCargoPhotoUrls'

// S10-J1b do Relatório de Carga: fotos de avaria de UM item (mock aprovado, "Fotos e avaria deste item"). Miniaturas
// (abrem o visualizador; o botão "Remover" fica numa faixa PRÓPRIA abaixo da miniatura, só para quem edita, sem invadir a
// área de toque de abrir), "Tirar foto" (câmera do celular: `capture="environment"`) e
// "Anexar" (arquivos; várias de uma vez), progresso e erro do envio com "Tentar de novo", e o aviso do limite (5 por
// item, 30 por conferência). Apresentação: o estado vive em `useCargoPhotoUploads` (`tools`) e no estado do item.
// `variant`: 'mobile' (cartão do item, com "Tirar foto") ou 'desktop' (coluna Fotos do cartão do computador, sem câmera).
// Somente leitura (`editable` falso): só as miniaturas, sem botões.
//   tools = { processId, uploads, notice, room(rowId), addFiles(rowId, files), retry(key), cancel(key), remove(rowId, id) }

const UPLOAD_LABELS = {
  queued: 'Foto na fila para envio…',
  resizing: 'Preparando a foto…',
}

function uploadLabel(upload) {
  return UPLOAD_LABELS[upload.status] ?? `Enviando foto… ${upload.progress}%`
}

function Thumb({ prefix, number, itemLabel, status, url, editable, onOpen, onRemove, onRetry }) {
  if (status === 'error') {
    return (
      <li className={`${prefix}__thumb ${prefix}__thumb--off`}>
        <span className={`${prefix}__off`}>Foto indisponível</span>
        <button type="button" className={`secondary-button ${prefix}__retry`} onClick={onRetry}>
          Tentar de novo
        </button>
        {editable ? (
          <button type="button" className={`${prefix}__del`} aria-label={`Remover foto ${number} do ${itemLabel}`} onClick={onRemove}>
            Remover
          </button>
        ) : null}
      </li>
    )
  }
  const ready = status === 'ready' && Boolean(url)
  return (
    <li className={`${prefix}__thumb`}>
      <button
        type="button"
        className={`${prefix}__open`}
        disabled={!ready}
        aria-label={ready ? undefined : `Foto ${number} do ${itemLabel}, carregando`}
        onClick={onOpen}
      >
        {ready ? <img src={url} alt={`Foto ${number} do ${itemLabel}`} loading="lazy" /> : <span className={`${prefix}__ph`} aria-hidden="true" />}
      </button>
      {editable ? (
        <button type="button" className={`${prefix}__del`} aria-label={`Remover foto ${number} do ${itemLabel}`} onClick={onRemove}>
          Remover
        </button>
      ) : null}
    </li>
  )
}

export default function CargoConferencePhotoBlock({ tools, rowId, photos = [], number, title = '', editable, variant = 'mobile' }) {
  const prefix = variant === 'desktop' ? 'crf-photos' : 'ccf-photos'
  const isMobile = variant !== 'desktop'
  const itemLabel = `item ${number}`
  const hintId = useId()
  const cameraRef = useRef(null)
  const fileRef = useRef(null)
  const [viewer, setViewer] = useState(null)
  const { urlOf, statusOf, retry } = useCargoPhotoUrls(tools.processId, photos)

  const rowUploads = tools.uploads.filter((upload) => upload.rowId === rowId)
  const working = rowUploads.filter((upload) => upload.status !== 'error')
  const failed = rowUploads.filter((upload) => upload.status === 'error')
  const room = tools.room(rowId)
  const limitText = describeCargoPhotoLimit(room)
  const full = room.row <= 0 || room.total <= 0
  const noticeText = tools.notice?.rowId === rowId ? tools.notice.text : ''

  if (!editable && photos.length === 0) return null

  function handleChoose(event) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    tools.addFiles(rowId, files)
  }

  function remove(photoId) {
    setViewer(null)
    tools.remove(rowId, photoId)
  }

  return (
    <div className={prefix}>
      {isMobile ? (
        <div className={`${prefix}__head`}>
          <span className={`${prefix}__label`}>Fotos e avaria deste item</span>
          {editable ? <small className={`${prefix}__count`}>{`${photos.length} de ${CARGO_PHOTOS_PER_ROW} fotos`}</small> : null}
        </div>
      ) : null}

      {photos.length > 0 ? (
        <ul className={`${prefix}__thumbs`} aria-label={`Fotos do ${itemLabel}`}>
          {photos.map((photo, index) => (
            <Thumb
              key={photo.id}
              prefix={prefix}
              number={index + 1}
              itemLabel={itemLabel}
              status={statusOf(photo.id)}
              url={urlOf(photo.id)}
              editable={editable}
              onOpen={() => setViewer(index)}
              onRemove={() => remove(photo.id)}
              onRetry={() => retry(photo.id)}
            />
          ))}
        </ul>
      ) : null}

      <div className={`${prefix}__live`} aria-live="polite">
        {working.map((upload) => (
          <div className={`${prefix}__upload`} key={upload.key}>
            <span>{uploadLabel(upload)}</span>
            <progress
              max="100"
              value={upload.status === 'uploading' ? upload.progress : undefined}
              aria-label={`Envio da foto do ${itemLabel}`}
            />
            <button type="button" className={`secondary-button ${prefix}__cancel`} onClick={() => tools.cancel(upload.key)}>
              Cancelar envio
            </button>
          </div>
        ))}
        {noticeText ? <p className={`${prefix}__notice`}>{noticeText}</p> : null}
      </div>

      {failed.map((upload) => (
        <div className={`${prefix}__upload ${prefix}__upload--error`} key={upload.key}>
          <p className={`${prefix}__error`} role="alert">
            {upload.error}
          </p>
          <div className={`${prefix}__actions`}>
            {upload.retryable ? (
              <button type="button" className="secondary-button" onClick={() => tools.retry(upload.key)}>
                Tentar de novo
              </button>
            ) : null}
            <button type="button" className="secondary-button" onClick={() => tools.cancel(upload.key)}>
              {upload.retryable ? 'Descartar foto' : 'Dispensar'}
            </button>
          </div>
        </div>
      ))}

      {editable ? (
        <>
          {isMobile ? (
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              tabIndex={-1}
              aria-label={`Foto da câmera do ${itemLabel}`}
              onChange={handleChoose}
            />
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            tabIndex={-1}
            aria-label={`Arquivos de foto do ${itemLabel}`}
            onChange={handleChoose}
          />
          <div className={`${prefix}__bar`}>
            {isMobile ? (
              <button
                type="button"
                className="secondary-button"
                disabled={full}
                aria-label={`Tirar foto do ${itemLabel}`}
                aria-describedby={limitText ? hintId : undefined}
                onClick={() => cameraRef.current?.click()}
              >
                <Icon name="camera" size={16} aria-hidden="true" />
                Tirar foto
              </button>
            ) : null}
            <button
              type="button"
              className="secondary-button"
              disabled={full}
              aria-label={isMobile ? `Anexar fotos ao ${itemLabel}` : `Anexar foto ao ${itemLabel}`}
              aria-describedby={limitText ? hintId : undefined}
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="paperclip" size={16} aria-hidden="true" />
              {isMobile ? 'Anexar' : 'Anexar foto'}
            </button>
          </div>
          {limitText ? (
            <small className={`${prefix}__hint`} id={hintId}>
              {limitText}
            </small>
          ) : null}
        </>
      ) : null}

      <CargoPhotoViewer
        processId={tools.processId}
        photos={photos}
        index={viewer}
        caption={`Item ${number}${title ? ` · ${title}` : ''}`}
        onIndexChange={setViewer}
        onClose={() => setViewer(null)}
      />
    </div>
  )
}
