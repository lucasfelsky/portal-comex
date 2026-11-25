import { useState } from 'react'
import {
  applyCargoIssueStatusSuggestion,
  hasAnyCargoIssue,
  patchCargoRowIssue,
  stepCargoRowPallets,
} from './cargoConferenceIssues'
import { setCargoConferenceLabel, toggleCargoConferenceFlag } from './cargoConferenceModel'

// S10-I do Relatório de Carga: edição da conferência no formulário do computador (OK?, contador de pallets, etiquetas,
// observação por item e recebimento). Só quem pode conferir (`canConferNow`) altera; qualquer mudança limpa o aviso.
// No computador o Portal sugere "Com ressalva" sozinho quando surge a 1ª avaria com o status vazio (a pessoa pode
// trocar); `statusSuggested` guarda que a troca foi do Portal, para a nota "Sugerido pela avaria registrada.".
export default function useCargoConferenceEdit({ canConferNow, conference, setConference, setFeedback }) {
  const [statusSuggested, setStatusSuggested] = useState(false)

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
    clearSuggestion: () => setStatusSuggested(false),
  }
}
