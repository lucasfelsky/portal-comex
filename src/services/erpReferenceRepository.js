// PR 3 ("Importar do DBCorp"): referencia do ERP no Firestore. Grava o recorte de
// cada embarque casado (sem dado financeiro) em `erpProcessHints/{id do
// processo}`, o meta da importacao em `erpSnapshots/{id}` e o ponteiro
// `erpSnapshots/latest`, tudo em lotes; le a referencia vigente de uma vez.
// Server-only (sem seed local) e SOMENTE admin (rules). Este servico nunca grava
// no documento do processo: so' as 2 colecoes da referencia e 1 evento de audit.
import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore/lite'
import {
  ERP_HINT_LIMITS,
  ERP_PROCESS_HINTS_COLLECTION,
  ERP_REFERENCE_LATEST_ID,
  ERP_SNAPSHOTS_COLLECTION,
  buildErpReferencePayload,
  clipText,
  estimateErpHintBytes,
  planErpReferenceBatches,
} from '../features/erp/erpReference'
import { auth, firestore, isFirebaseConfigured } from '../lib/firebase'
import { createAuditEvent } from './auditRepository'

const NOT_CONFIGURED_MESSAGE = 'Firebase não configurado: a referência do ERP só é salva no servidor.'

// Padrao do repo: o ator vai como TEXTO (nunca o objeto `profile`, que carrega
// e-mail, area e notas): a coleção `audits` e' imutavel.
function resolveActorName(actor) {
  const found = [actor?.name, actor?.email].find((value) => typeof value === 'string' && value.trim() !== '')
  return clipText(found ?? 'Sistema', ERP_HINT_LIMITS.maxName)
}

function pluralProcesses(count) {
  return `${count} ${count === 1 ? 'processo' : 'processos'}`
}

// Audit nunca derruba a gravacao (a referencia ja esta salva ou o erro real e' outro).
async function tryAudit(event) {
  try {
    await createAuditEvent(event)
  } catch (error) {
    console.warn('Não foi possível registrar a auditoria da referência do ERP.', error)
  }
}

// Hints gravados com este snapshotId (query de campo unico: indice automatico).
function readSnapshotHints(snapshotId) {
  return getDocs(query(collection(firestore, ERP_PROCESS_HINTS_COLLECTION), where('snapshotId', '==', snapshotId)))
}

// result: retorno de `runErpReconciliation` (nao bloqueado). actor: `profile`.
// -> { snapshotId, counts, skipped, reference: { snapshot, hintsByProcessId } }
// Falha no 1o lote nao grava nada (nem audita). Falha num lote posterior deixa os
// anteriores gravados (o `latest` nao muda, entao os avisos desses processos
// somem ate a proxima importacao completa) e registra a gravacao parcial. Com
// varios lotes, confere ao final se todos os hints ainda sao deste snapshot (uma
// importacao concorrente sobrescreve os mesmos docs) e rejeita se nao forem.
export async function saveErpReferenceSnapshot(result, actor) {
  if (!isFirebaseConfigured || !firestore) {
    throw new Error(NOT_CONFIGURED_MESSAGE)
  }
  const payload = buildErpReferencePayload(result)
  const uid = auth?.currentUser?.uid
  if (!uid) {
    throw new Error('Usuário não autenticado: não foi possível salvar a referência do ERP.')
  }

  const actorName = resolveActorName(actor)
  const fileName = clipText(payload.sourceInfo.fileName, ERP_HINT_LIMITS.maxFileName)
  const snapshotRef = doc(collection(firestore, ERP_SNAPSHOTS_COLLECTION))
  const snapshotId = snapshotRef.id
  const latestRef = doc(firestore, ERP_SNAPSHOTS_COLLECTION, ERP_REFERENCE_LATEST_ID)
  const plan = planErpReferenceBatches(payload.hints.map(estimateErpHintBytes))

  for (let batchIndex = 0; batchIndex < plan.length; batchIndex += 1) {
    const step = plan[batchIndex]
    const batch = writeBatch(firestore)
    if (step.hasMeta) {
      batch.set(snapshotRef, {
        snapshotId,
        createdAt: serverTimestamp(),
        createdById: uid,
        createdByName: actorName,
        sourceInfo: { ...payload.sourceInfo, fileName },
        counts: payload.counts,
      })
    }
    for (const hintIndex of step.hintIndexes) {
      const hint = payload.hints[hintIndex]
      batch.set(doc(firestore, ERP_PROCESS_HINTS_COLLECTION, hint.processId), {
        snapshotId,
        savedAt: serverTimestamp(),
        savedById: uid,
        matchRule: hint.matchRule,
        shipment: hint.shipment,
      })
    }
    // O ponteiro vai por ultimo: so' passa a valer quando tudo foi gravado.
    if (step.hasLatest) {
      batch.set(latestRef, {
        snapshotId,
        updatedAt: serverTimestamp(),
        updatedById: uid,
        updatedByName: actorName,
        fileName,
        hints: payload.hints.length,
      })
    }
    try {
      await batch.commit()
    } catch (error) {
      if (batchIndex > 0) {
        await tryAudit({
          action: 'Referência do ERP: gravação parcial',
          actor: actorName,
          target: `${snapshotId}: ${batchIndex} de ${plan.length} lotes gravados`,
        })
      }
      throw error
    }
  }

  // Janela de corrida so' existe com mais de 1 lote (1 lote e' atomico). Falha na
  // conferencia nao derruba o save: a leitura da referencia confere de novo.
  if (plan.length > 1) {
    let found = payload.hints.length
    try {
      found = (await readSnapshotHints(snapshotId)).docs.length
    } catch (verifyError) {
      console.warn('Não foi possível conferir a referência do ERP gravada.', verifyError)
    }
    if (found !== payload.hints.length) {
      await tryAudit({
        action: 'Referência do ERP: gravação incompleta',
        actor: actorName,
        target: `${snapshotId}: ${found} de ${pluralProcesses(payload.hints.length)}`,
      })
      throw new Error(
        `A referência do ERP ficou incompleta (${found} de ${pluralProcesses(payload.hints.length)}): outra importação gravou ao mesmo tempo. Importe a planilha de novo.`
      )
    }
  }

  await tryAudit({
    action: 'Referência do ERP importada',
    actor: actorName,
    target: `${snapshotId}: ${pluralProcesses(payload.hints.length)}`,
  })

  // `serverTimestamp` nao e' conhecido no cliente: a hora do import e' a local.
  const hintsByProcessId = {}
  for (const hint of payload.hints) {
    hintsByProcessId[hint.processId] = { snapshotId, matchRule: hint.matchRule, shipment: hint.shipment }
  }
  return {
    snapshotId,
    counts: payload.counts,
    skipped: payload.skipped,
    reference: {
      snapshot: { snapshotId, updatedAtMs: Date.now(), updatedByName: actorName, fileName },
      hintsByProcessId,
    },
  }
}

// Referencia vigente: `latest` + os hints do mesmo snapshot (2 leituras).
// -> { snapshot: { snapshotId, updatedAtMs, updatedByName, fileName, incomplete? }, hintsByProcessId } | null
// `latest.hints` e' quantos hints a importacao gravou. Se os docs do snapshot
// forem outro numero (importacoes concorrentes em varios lotes sobrescrevem os
// mesmos hints) ou o campo faltar, a referencia vem como incompleta: sem hints e
// com `snapshot.incomplete` = true, para o modal pedir nova importacao.
export async function loadErpReference() {
  if (!isFirebaseConfigured || !firestore) return null

  const latestSnapshot = await getDoc(doc(firestore, ERP_SNAPSHOTS_COLLECTION, ERP_REFERENCE_LATEST_ID))
  if (!latestSnapshot.exists()) return null
  const latest = latestSnapshot.data()
  const snapshotId = typeof latest?.snapshotId === 'string' ? latest.snapshotId : ''
  if (snapshotId === '') return null

  const hintsSnapshot = await readSnapshotHints(snapshotId)
  const snapshot = {
    snapshotId,
    updatedAtMs: typeof latest.updatedAt?.toMillis === 'function' ? latest.updatedAt.toMillis() : null,
    updatedByName: typeof latest.updatedByName === 'string' ? latest.updatedByName : '',
    fileName: typeof latest.fileName === 'string' ? latest.fileName : '',
  }
  if (!Number.isInteger(latest.hints) || latest.hints !== hintsSnapshot.docs.length) {
    console.warn(
      `Referência do ERP incompleta: ${hintsSnapshot.docs.length} de ${latest.hints ?? '?'} hints. Importe a planilha de novo.`
    )
    return { snapshot: { ...snapshot, incomplete: true }, hintsByProcessId: {} }
  }
  const hintsByProcessId = {}
  for (const item of hintsSnapshot.docs) {
    const data = item.data()
    hintsByProcessId[item.id] = { snapshotId: data.snapshotId, matchRule: data.matchRule, shipment: data.shipment }
  }
  return { snapshot, hintsByProcessId }
}
