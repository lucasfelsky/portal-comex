import { doc, getDoc, setDoc } from 'firebase/firestore/lite'
import { firestore, isFirebaseConfigured } from '../lib/firebase'
import {
  buildCargoReportRecipientsPayload,
  isValidCargoReportRecipientEmail,
  normalizeCargoReportRecipientsConfig,
} from '../features/admin/cargoReportRecipients'
import { createAuditEvent } from './auditRepository'

// Destinatários do aviso "Relatório de Carga": `config/cargoReportRecipients` = `{ tecnico, faturamento }`.
// O trigger notifyCargoReportUploaded lê o mesmo doc via Admin SDK; aqui só o admin lê/grava (rules).
const STORAGE_KEY = 'sq-comex-cargo-report-recipients'
const COLLECTION_ID = 'config'
const DOCUMENT_ID = 'cargoReportRecipients'

function readLocalRecipients() {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (!stored) return undefined

  try {
    return JSON.parse(stored)
  } catch {
    return undefined
  }
}

function writeLocalRecipients(lists) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lists))
}

// Normaliza o doc bruto e separa o que a regra estrita de gravação não aceitaria
// (`invalidEntries`): o backend ainda USA esses itens, então a UI os mostra marcados em vez de apagar em silêncio.
function buildResult(rawData, exists) {
  const { tecnico, faturamento, ignoredNonCorporate } = normalizeCargoReportRecipientsConfig(rawData)
  const invalidEntries = [...tecnico, ...faturamento].filter(
    (email) => !isValidCargoReportRecipientEmail(email)
  )

  return { exists, tecnico, faturamento, ignoredNonCorporate, invalidEntries }
}

export async function getCargoReportRecipients() {
  if (!isFirebaseConfigured || !firestore) {
    const localData = readLocalRecipients()
    return buildResult(localData, localData !== undefined)
  }

  const snapshot = await getDoc(doc(firestore, COLLECTION_ID, DOCUMENT_ID))

  return buildResult(snapshot.exists() ? snapshot.data() : undefined, snapshot.exists())
}

export async function saveCargoReportRecipients(lists, actor = null) {
  const payload = buildCargoReportRecipientsPayload(lists)

  if (!isFirebaseConfigured || !firestore) {
    writeLocalRecipients(payload)
  } else {
    // Sem `merge`: substitui o doc inteiro (só os 2 campos), como a regra exige.
    await setDoc(doc(firestore, COLLECTION_ID, DOCUMENT_ID), payload)
  }

  // Auditoria é melhor-esforço: o doc já foi gravado, falha aqui não vira erro de save na tela.
  try {
    await createAuditEvent({
      action: 'Destinatários do Relatório de Carga atualizados',
      actor: actor?.name ?? actor?.email ?? 'Sistema',
      target: `Técnico: ${payload.tecnico.length} · Faturamento: ${payload.faturamento.length}`,
    })
  } catch {
    // ignorado de propósito
  }

  return payload
}
