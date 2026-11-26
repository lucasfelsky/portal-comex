import { useEffect, useRef, useState } from 'react'
import { deleteOwnCargoConferencePhotoFiles } from '../../services/cargoConferencePhotosRepository'
import {
  applyCargoIssueStatusSuggestion,
  hasAnyCargoIssue,
  patchCargoRowIssue,
  readCargoRowIssue,
  stepCargoRowPallets,
} from './cargoConferenceIssues'
import { addCargoPhoto, listUnsavedCargoPhotos, removeCargoPhoto } from './cargoConferencePhotos'
import { setCargoConferenceLabel, toggleCargoConferenceFlag } from './cargoConferenceModel'
import useCargoPhotoUploads from './useCargoPhotoUploads'

// S10-I do Relatório de Carga: edição da conferência no formulário do computador (OK?, contador de pallets, etiquetas,
// observação por item e recebimento). Só quem pode conferir (`canConferNow`) altera; qualquer mudança limpa o aviso.
// No computador o Portal sugere "Com ressalva" sozinho quando surge a 1ª avaria com o status vazio (a pessoa pode
// trocar); `statusSuggested` guarda que a troca foi do Portal, para a nota "Sugerido pela avaria registrada.".
// S10-J1b: fotos de avaria (fila de envio, foto no item, remover, descartar): a foto enviada fica "não salva" até o Salvar.
export default function useCargoConferenceEdit({
  processId,
  uid,
  canConferNow,
  conference,
  savedConference,
  setConference,
  setFeedback,
}) {
  const [statusSuggested, setStatusSuggested] = useState(false)
  const conferenceRef = useRef(conference)
  useEffect(() => {
    conferenceRef.current = conference
  })

  function edit(updater) {
    if (!canConferNow) return
    setConference(updater)
    setFeedback(null)
  }

  function setIssue(rowId, changes) {
    if (!canConferNow) return
    const result = applyCargoIssueStatusSuggestion(conference, patchCargoRowIssue(conference, rowId, changes))
    setConference(result.conference)
    if (result.suggested) setStatusSuggested(true)
    setFeedback(null)
  }

  // Foto que terminou de subir: entra no item (a conferência mais recente, pois o envio termina bem depois do toque).
  function addPhoto(rowId, photo) {
    if (!canConferNow) return
    const result = applyCargoIssueStatusSuggestion(
      conferenceRef.current,
      addCargoPhoto(conferenceRef.current, rowId, photo)
    )
    conferenceRef.current = result.conference
    setConference(result.conference)
    if (result.suggested) setStatusSuggested(true)
    setFeedback(null)
  }

  const photoUploads = useCargoPhotoUploads({ processId, uid, conference, enabled: canConferNow, onUploaded: addPhoto })

  // Tira a foto do item (vale no Salvar). Foto minha ainda não salva: apaga o arquivo agora (melhor esforço).
  function removePhoto(rowId, photoId) {
    if (!canConferNow) return
    const photo = readCargoRowIssue(conference, rowId).photos.find((item) => item?.id === photoId)
    edit((current) => removeCargoPhoto(current, rowId, photoId))
    if (photo && listUnsavedCargoPhotos(conference, savedConference).some((item) => item.id === photoId)) {
      deleteOwnCargoConferencePhotoFiles(processId, [photo], { uid }).catch(() => {})
    }
  }

  // "Descartar alterações": cancela os envios e apaga do Storage as fotos minhas enviadas e não salvas.
  function discardPhotos() {
    const unsaved = listUnsavedCargoPhotos(conference, savedConference)
    photoUploads.cancelAll()
    if (unsaved.length > 0) deleteOwnCargoConferencePhotoFiles(processId, unsaved, { uid }).catch(() => {})
  }

  // Ao abrir o diálogo de fechar: avaria registrada com o status ainda vazio já vem sugerida.
  function suggestStatusForClose() {
    if (!canConferNow || conference.receiptStatus !== '' || !hasAnyCargoIssue(conference)) return
    setConference((current) => ({ ...current, receiptStatus: 'com_ressalva' }))
    setStatusSuggested(true)
  }

  return {
    statusSuggested,
    toggleOk: (rowId) => edit((current) => toggleCargoConferenceFlag(current, 'okByRowId', rowId)),
    stepPallets: (rowId, delta) => edit((current) => stepCargoRowPallets(current, rowId, delta)),
    setIssue,
    changeLabel: (rowId, field, value) => edit((current) => setCargoConferenceLabel(current, rowId, field, value)),
    patchConference: (patch) => edit((current) => ({ ...current, ...patch })),
    suggestStatusForClose,
    photoTools: { processId, ...photoUploads, remove: removePhoto },
    isUploading: photoUploads.isUploading,
    discardPhotos,
    clearSuggestion: () => setStatusSuggested(false),
  }
}
