import ErpHint from '../erp/ErpHint'
import { erpOrderKey } from '../erp/erpReference'
import { getEstimatedDeliveryKey, formatDate, getDestinationLabel, hasUpdatedEta } from './processListShared'
import { formatShortDate } from './WeeklyArrivalsCard'
import { canShowProcessName } from './processLabels'
import { getHouseBl } from './houseBl'
import { canSeePurchaseOrderDetails, formatPurchaseOrderLine } from './purchaseOrders'
import { isAirCategory } from './processCategories'
import { getErpEmptyRowHint, getErpRowHint } from './ProcessOperationalDetails'

// Refino visual F4c — aba "Detalhes gerais" (Processo.dc.html), arvore DESKTOP.
// Presentacional: o ProcessDetailView calcula os avisos do ERP e as POs e passa
// por props. Cada campo/bloco da arvore legada continua aqui (Dados pendentes,
// POs consolidadas, destino, identificacao, ETD/ETA, ETA original, previsao de
// entrega, itens vinculados); a faixa de pendencias e os 4 cartoes de resumo
// seguem o mock.

const EMPTY = '—'

function short(value) {
  const text = formatShortDate(value)
  return text === '-' ? '' : text
}

function formatQuantity(value) {
  const number = Number(value)
  return Number.isFinite(number) && value !== '' && value != null ? number.toLocaleString('pt-BR') : String(value ?? '')
}

function SummaryCard({ label, tone, value, mono, valueTone, hint, children }) {
  return (
    <div className={`pdv-stat${tone ? ` pdv-stat--${tone}` : ''}`}>
      <span className="pdv-stat__label">{label}</span>
      <span className={`pdv-stat__value${mono ? ' pdv-stat__value--mono' : ''}${valueTone ? ` pdv-stat__value--${valueTone}` : ''}`}>
        {value}
        {children}
      </span>
      {hint ? <span className="pdv-stat__hint">{hint}</span> : null}
    </div>
  )
}

const CHANNEL_TONE = { Verde: 'success', Amarelo: 'warning', Vermelho: 'danger', Cinza: 'neutral' }

function IdentRow({ label, hint, children }) {
  return (
    <div className="pdv-kv">
      <dt>{label}</dt>
      <dd>
        {children}
        {hint ? <ErpHint hint={hint} /> : null}
      </dd>
    </div>
  )
}

function buildIdentRows({ process, canSeeName, erpHints }) {
  const fields = erpHints?.fields
  const canShowName = canShowProcessName(process, canSeeName)
  const isConsolidated = process?.category === 'CONSOLIDADO'
  const isAir = isAirCategory(process?.category)
  const showSupplier = canShowName && !isConsolidated && process?.supplierName
  const emptySupplierHint = !showSupplier && canShowName && !isConsolidated ? getErpEmptyRowHint(fields?.supplier, process) : null
  const emptyOriginHint = !process?.originLocation ? getErpEmptyRowHint(fields?.origin, process) : null
  const emptyIncotermHint = !process?.incoterm ? getErpEmptyRowHint(fields?.incoterm, process) : null
  const houseBl = getHouseBl(process)
  const vesselLine = isAir ? process?.flightNumber : [process?.vesselName, process?.voyage].filter(Boolean).join(' · ')
  const blValue = isAir ? process?.mawb : houseBl

  const rows = []
  if (showSupplier) {
    rows.push({ key: 'supplier', label: 'Fornecedor', value: process.supplierName, hint: getErpRowHint(fields?.supplier, process) })
  } else if (emptySupplierHint) {
    rows.push({ key: 'supplier', label: 'Fornecedor', value: EMPTY, hint: emptySupplierHint })
  }
  if (process?.originLocation) {
    rows.push({ key: 'origin', label: 'Origem', value: process.originLocation, hint: getErpRowHint(fields?.origin, process) })
  } else if (emptyOriginHint) {
    rows.push({ key: 'origin', label: 'Origem', value: EMPTY, hint: emptyOriginHint })
  }
  if (process?.incoterm) {
    rows.push({ key: 'incoterm', label: 'Incoterm', value: process.incoterm, hint: getErpRowHint(fields?.incoterm, process) })
  } else if (emptyIncotermHint) {
    rows.push({ key: 'incoterm', label: 'Incoterm', value: EMPTY, hint: emptyIncotermHint })
  }
  if (vesselLine) rows.push({ key: 'vessel', label: isAir ? 'Voo' : 'Navio · Viagem', value: vesselLine })
  if (blValue) rows.push({ key: 'bl', label: isAir ? 'MAWB' : 'House BL', value: blValue })
  if (process?.forwarderName) rows.push({ key: 'forwarder', label: 'Agente de carga', value: process.forwarderName })
  return rows
}

export default function ProcessGeneralDesktop({
  process,
  canSeeName,
  isAdmin,
  pendingFields,
  erpHints,
  consolidatedOrders,
  poSetHint,
  emptyPoSetHint,
  etdHint,
  onEditMode,
  onOpenItems,
}) {
  const isConsolidated = process.category === 'CONSOLIDADO'
  const etaUpdated = hasUpdatedEta(process)
  const deliveryKey = getEstimatedDeliveryKey(process)
  const channel = process.parameterizationChannel
  const items = Array.isArray(process.items) ? process.items : []
  const linkedItemsCount = items.length
  const identRows = buildIdentRows({ process, canSeeName, erpHints })
  const pendingFocusKey = pendingFields.map((field) => field.field).find((key) => typeof key === 'string' && key) ?? undefined
  // Canal: a dica "Aguardando parametrizacao da DUIMP" so para quem ja ve a DUIMP
  // antes da atracacao (admin/logistica); os demais veem uma dica neutra.
  const channelHint = channel
    ? 'Canal de parametrização da DUIMP.'
    : isAdmin || canSeeName
      ? 'Aguardando parametrização da DUIMP.'
      : 'Canal ainda não definido.'

  return (
    <>
      {isAdmin && pendingFields.length > 0 ? (
        <div className="pdv-pending" role="note">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M12 3 2 20h20zM12 10v4M12 17h.01" />
          </svg>
          <strong className="pdv-pending__title">Dados pendentes ({pendingFields.length})</strong>
          <ul className="pdv-pending__list">
            {pendingFields.map((field) => (
              <li key={field.id}>{field.label}</li>
            ))}
          </ul>
          {onEditMode ? (
            <button type="button" className="pdv-pending__action" onClick={() => onEditMode(pendingFocusKey)}>
              Completar agora
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="pdv-summary">
        <SummaryCard
          label={getDestinationLabel(process.category)}
          value={process.destination || '-'}
          hint={process.terminalName ? `Terminal: ${process.terminalName}` : null}
        >
          <ErpHint hint={getErpRowHint(erpHints.fields.destination, process)} />
        </SummaryCard>
        <SummaryCard
          label={etaUpdated ? 'ETD / ETA atualizada' : 'ETD / ETA'}
          tone={etaUpdated ? 'info' : undefined}
          mono
          value={
            <>
              <span title={formatDate(process.etd)}>{short(process.etd) || EMPTY}</span>
              {' · '}
              <span title={formatDate(process.eta)}>{short(process.eta) || EMPTY}</span>
            </>
          }
          hint={etaUpdated ? `ETA original: ${short(process.etaOriginal) || EMPTY}` : null}
        >
          <ErpHint hint={etdHint} />
          <ErpHint hint={getErpRowHint(erpHints.fields.eta, process)} />
        </SummaryCard>
        <SummaryCard
          label="Previsão de entrega no armazém"
          mono
          value={<span title={formatDate(deliveryKey)}>{short(deliveryKey) || EMPTY}</span>}
          hint={
            process.warehouseDeliveryDateOverride
              ? 'Data definida manualmente por um admin.'
              : 'Data calculada automaticamente pelo sistema.'
          }
        />
        <SummaryCard label="Canal" value={channel || EMPTY} valueTone={CHANNEL_TONE[channel]} hint={channelHint} />
      </div>

      {isConsolidated && consolidatedOrders.length > 0 ? (
        <div className="pdv-section pdv-section--pos">
          <h3 className="pdv-section__title">
            POs consolidadas
            <ErpHint hint={poSetHint} />
          </h3>
          <ul className="pdv-pos">
            {consolidatedOrders.map((order) => (
              <li key={order.po}>
                {formatPurchaseOrderLine(order, canSeePurchaseOrderDetails(canSeeName))}
                <ErpHint hint={erpHints.po[erpOrderKey(order.po)]} />
              </li>
            ))}
          </ul>
        </div>
      ) : emptyPoSetHint ? (
        <div className="pdv-section pdv-section--pos">
          <h3 className="pdv-section__title">
            POs consolidadas
            <ErpHint hint={emptyPoSetHint} />
          </h3>
          <p className="pdv-pos-empty">{EMPTY}</p>
        </div>
      ) : null}

      <div className="pdv-pair">
        <div className="pdv-section">
          <h3 className="pdv-section__title">Identificação</h3>
          {identRows.length > 0 ? (
            <dl className="pdv-kv-grid pdv-kv-grid--two">
              {identRows.map((row) => (
                <IdentRow key={row.key} label={row.label} hint={row.hint}>
                  {row.value}
                </IdentRow>
              ))}
            </dl>
          ) : (
            <p className="pdv-empty">Dados de identificação ainda não informados.</p>
          )}
        </div>

        <div className="pdv-section pdv-section--items">
          <div className="pdv-section__head">
            <h3 className="pdv-section__title">Itens vinculados</h3>
            <span className="pdv-section__sub">
              <span className="process-linked-items__count">
                {linkedItemsCount === 1 ? '1 item' : `${linkedItemsCount} itens`}
              </span>
              <span className="process-linked-items__suffix">
                {linkedItemsCount === 1 ? ' cadastrado' : ' cadastrados'} para este processo.
              </span>
            </span>
          </div>
          {linkedItemsCount > 0 ? (
            <ul className="pdv-preview">
              {items.slice(0, 2).map((item, index) => (
                <li key={item.id ?? index}>
                  <span className="pdv-preview__name">{item.commercialName || 'Item sem nome'}</span>
                  <span className="pdv-preview__qty">{formatQuantity(item.quantity)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <button type="button" className="secondary-button pdv-btn pdv-btn--start" onClick={onOpenItems}>
            Ver itens do processo
          </button>
        </div>
      </div>
    </>
  )
}
