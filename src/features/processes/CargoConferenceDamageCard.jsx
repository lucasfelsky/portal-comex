import { useEffect, useId, useMemo, useState } from 'react'
import { isFirebaseConfigured } from '../../lib/firebase'
import CargoConferencePhotoBlock from './CargoConferencePhotoBlock'
import { RECEIPT_STATUS_OPTIONS } from './cargoReportFormModel'
import { formatCargoDateBr } from './cargoReportSheet'
import { canViewProcessDocuments } from './processDocuments'

// S10-J2b do Relatório de Carga: cartão "Avarias da conferência" na aba Documentos. Lê o espelho
// `processes/{id}/cargoReport/damage` (gravado pelo servidor no fechamento da conferência) e mostra os itens com avaria,
// com as fotos pelo mesmo bloco de miniaturas e visualizador da conferência (somente leitura). Só existe quando há avaria:
// sem espelho, sem itens ou sem permissão de leitura o cartão não aparece (nem esqueleto de carregamento).
// Quem lê: admin, logística, Técnico e Faturamento (a rule de `cargoReport/damage` é a mesma).

const SILENT_ERROR_CODES = new Set(['permission-denied', 'not-found'])
// Só erro de leitura do Firestore (tem `code`) vira alerta; sem `code` (falha do próprio carregamento do módulo) o cartão
// fica fora, como o painel já faz com o estado das áreas do Relatório de carga.
function isReadFailure(error) {
  return typeof error?.code === 'string' && !SILENT_ERROR_CODES.has(error.code)
}
const LOAD_ERROR_TEXT = 'Não foi possível carregar as avarias da conferência.'
const EMPTY_STATE = { processId: '', damage: null, failed: false }

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

// Mesma frase do aviso: só quando o COMEX informou o total de pallets.
function describePallets(pallets) {
  if (!Number.isInteger(pallets?.expected) || !Number.isInteger(pallets?.counted)) return ''
  const state = pallets.counted === pallets.expected ? 'confere' : 'divergente'
  return `Pallets: ${plural(pallets.counted, 'contado', 'contados')} de ${plural(pallets.expected, 'informado', 'informados')} pelo COMEX (${state}).`
}

function describeReceipt(value) {
  return RECEIPT_STATUS_OPTIONS.find((option) => option.value !== '' && option.value === value)?.label ?? ''
}

function readText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

// Itens do espelho prontos para a tela: o que não é item, ou foto sem `id` de texto, é descartado.
function readItems(damage) {
  const items = Array.isArray(damage?.items) ? damage.items : []
  return items
    .filter((item) => item && typeof item === 'object')
    .map((item, position) => {
      const index = Number.isInteger(item.index) ? item.index : position + 1
      const label = readText(item.label)
      return {
        rowId: typeof item.rowId === 'string' && item.rowId ? item.rowId : `item-${index}`,
        index,
        label: label === `Item ${index}` ? '' : label,
        code: readText(item.code),
        note: typeof item.note === 'string' ? item.note : '',
        photos: (Array.isArray(item.photos) ? item.photos : []).filter((photo) => typeof photo?.id === 'string' && photo.id),
      }
    })
}

function describeNote(item) {
  if (readText(item.note)) return item.note
  return item.photos.length > 0 ? '(sem observação)' : 'Avaria registrada, sem observação'
}

export default function CargoConferenceDamageCard({ processId, role, reloadToken = 0 }) {
  const headingId = useId()
  const [state, setState] = useState(EMPTY_STATE)
  const [attempt, setAttempt] = useState(0)
  const allowed = Boolean(processId) && isFirebaseConfigured && canViewProcessDocuments(role)
  const current = state.processId === processId ? state : EMPTY_STATE
  const items = useMemo(() => readItems(current.damage), [current.damage])
  const tools = useMemo(() => ({ processId, uploads: [], notice: null, room: () => ({ row: 1, total: 1 }) }), [processId])

  useEffect(() => {
    if (!allowed) return undefined
    let isMounted = true

    async function load() {
      try {
        const { getCargoConferenceDamage } = await import('../../services/cargoReportRepository')
        const damage = await getCargoConferenceDamage(processId)
        if (isMounted) setState({ processId, damage, failed: false })
      } catch (error) {
        if (isMounted) setState({ processId, damage: null, failed: isReadFailure(error) })
      }
    }

    load()
    return () => {
      isMounted = false
    }
  }, [allowed, processId, reloadToken, attempt])

  if (!allowed) return null

  if (current.failed) {
    return (
      <section className="documents-section cdc">
        <div className="cdc__body">
          <p role="alert">{LOAD_ERROR_TEXT}</p>
          <button type="button" className="secondary-button" onClick={() => setAttempt((count) => count + 1)}>
            Tentar de novo
          </button>
        </div>
      </section>
    )
  }

  if (items.length === 0) return null

  const photoTotal = items.reduce((sum, item) => sum + item.photos.length, 0)
  const dateText = formatCargoDateBr(current.damage?.closedDate)
  const closedByName = readText(current.damage?.closedByName)
  const subtitle = `${dateText ? `Conferência fechada em ${dateText}` : 'Conferência fechada'}${closedByName ? ` por ${closedByName}` : ''}`
  const summary = `${plural(items.length, 'item', 'itens')} com avaria${photoTotal > 0 ? ` · ${plural(photoTotal, 'foto', 'fotos')}` : ''}`
  const palletsLine = describePallets(current.damage?.pallets)
  const receipt = describeReceipt(current.damage?.receiptStatus)

  return (
    <section className="documents-section cdc" aria-labelledby={headingId}>
      <div className="documents-section__header">
        <div>
          <h3 className="documents-section__title" id={headingId}>
            Avarias da conferência
          </h3>
          <p className="documents-section__subtitle">{subtitle}</p>
        </div>
      </div>
      <div className="cdc__body">
        <p className="cdc__summary">{summary}</p>
        {palletsLine ? <p className="cdc__summary">{palletsLine}</p> : null}
        {receipt ? <p className="cdc__summary">{`Recebimento: ${receipt}.`}</p> : null}
        <ul className="cdc__list">
          {items.map((item) => (
            <li className="cdc__item" key={item.rowId}>
              <p className="cdc__title">
                <strong>{`Item ${item.index}`}</strong>
                {item.label ? ` · ${item.label}` : ''}
                {item.code ? ` · Código ${item.code}` : ''}
              </p>
              <p className="cdc__note">{describeNote(item)}</p>
              <CargoConferencePhotoBlock
                tools={tools}
                rowId={item.rowId}
                photos={item.photos}
                number={item.index}
                title={item.label}
                editable={false}
                variant="desktop"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
