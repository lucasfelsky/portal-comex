import {
  CONTAINER_TYPE_OPTIONS,
  getContainerSpecialBadges,
  isContainerReturnPlanned,
} from './containers'
import {
  getImoClassLabel,
  getItemDangerousGoodsLabel,
  hasDangerousGoods,
  hasFlammableGoods,
  isLegacyProcessDangerousGoods,
} from './operationalOptions'
import { canShowProcessName } from './processLabels'
import { getProcessPurchaseOrders } from './purchaseOrders'
import ErpHint from '../erp/ErpHint'
import { getEffectiveLicenses, isLicenseDeferred, isLicenseRejected } from './licenses'
import { formatDateTime } from '../../utils/dateFormat'
import {
  isApproxDate,
  hasArrivalSignal,
  hasCargoPresenceSignal,
  hasDateValue,
  getFreeTimeStatus,
  CUSTOMS_INSPECTION_CHANNELS,
  isLegacyDuimpRegisteredWithoutDate,
  isLegacyParameterizedWithoutDate,
} from './arrivalCustoms'
import { isMaritimeCategory, isAirCategory } from './processCategories'
import { hasReceiptDivergence } from './receiptDivergence'
import VesselTrackingButton from './VesselTrackingButton'
import { getVesselTrackingTarget } from './vesselTracking'
import { formatContainerCount, formatPalletCount } from '../../utils/cargoUnits'

// F17.2a (D-11/D-7/D-8): leitura dos 22 campos novos no detalhe do
// processo. F17.2b (D-6): leitura de `licenses[]` (`ProcessLicensesDetails`).
// F17.3a (D-12): leitura de chegada com data/CE/terminal/free time
// (`ProcessArrivalDetails`/`ProcessFreeTimeDetails`).
// F17.3b (D-14): card "DUIMP" completo (`ProcessCustomsDetails`).
// F17.4b (B-4/B-7): card "Divergência no recebimento"
// (`ProcessReceiptDivergenceDetails`) + "Devolvido em dd/mm/aaaa" na
// tabela de contêineres.
// UX-6b-3 (D6/D7): blocos numerados 1-5 (`DetailBlock`/`DetailList`/
// `DetailRow`), tabela de contêineres (`ProcessCargoDetails`) e bloco
// "Embarque e trânsito" (`ProcessTransitDetails`) — substituem
// `ProcessCargoTransitDetails`.
// Regra de import (D-11/D-12/D-14/UX-6b-3): so' `./containers` (inclusive
// `CONTAINER_TYPE_OPTIONS`), `./operationalOptions`, `./processLabels`
// (so' `canShowProcessName`), `./licenses` (inclusive `isLicenseDeferred`/
// `isLicenseRejected`), `../../utils/dateFormat` (so' `formatDateTime`), `../../utils/cargoUnits` (puro),
// `./arrivalCustoms`, `./processCategories`, `./receiptDivergence` (so'
// `hasReceiptDivergence`), `./VesselTrackingButton` (+ `./vesselTracking`, puro,
// sem imports), `./purchaseOrders` (puro; so' `getProcessPurchaseOrders`) e
// `../erp/ErpHint` (PR 3: aviso "ERP" do admin; so' importa `react`). A funcao de tom de canal de `./processStatusView`
// NAO e' mais importada aqui: a DUIMP virou neutra (canal e' badge, nao
// card colorido) — a funcao continua exportada la' pro Dashboard.
//
// Blocos vazios (SPEC 2026-09-28): `showEmptyPlaceholder` + `DetailBlockPlaceholder`
// renderizam um aviso no lugar do bloco ausente; visivel so' no desktop via CSS.
//
// D-3: `shippedAt` e' data pura (`YYYY-MM-DD`) - formatador local, NUNCA
// `toISOString()`/`new Date(value)` direto num `Intl.DateTimeFormat` (bug de
// fuso: meia-noite UTC vira o dia anterior em BRT).
function formatDate(value) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

// F17.2b (D-6): mesmo padrao de `formatDate`, mas pra `deferredAt`
// (`YYYY-MM-DD` puro) - NUNCA `new Date(value)` direto (fuso).
function formatDeferredAt(value) {
  return formatDate(value)
}

// UX-6b-3 (D6): primitivas presentacionais dos blocos numerados 1-5. Sem
// arquivo novo (D12) — vivem aqui porque `ProcessDetailView.jsx` tambem as
// usa (bloco 5 "Coleta", montado no pai).
export function DetailBlock({ step, title, badges, tone, wide, className, children }) {
  const classes = [
    'detail-card',
    'detail-block',
    wide ? 'detail-block--wide' : null,
    tone ? `detail-block--${tone}` : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={classes}>
      <div className="detail-block__head">
        {step ? (
          <span className="detail-block__step" aria-hidden="true">
            {step}
          </span>
        ) : null}
        <h3 className="detail-block__title">{title}</h3>
        {badges}
      </div>
      {children}
    </section>
  )
}

export function DetailBlockPlaceholder({ title, wide, className, message }) {
  return (
    <DetailBlock title={title} wide={wide} className={[className, 'detail-block--placeholder'].filter(Boolean).join(' ')}>
      <p className="field-hint">{message}</p>
    </DetailBlock>
  )
}

export function DetailList({ children }) {
  return <dl className="detail-dl">{children}</dl>
}

// `hint` (PR 3, so' admin): aviso "ERP" depois do valor.
export function DetailRow({ label, children, hint }) {
  return (
    <div className="detail-dl__row">
      <dt>{label}</dt>
      <dd>
        {children}
        {hint ? <ErpHint hint={hint} /> : null}
      </dd>
    </div>
  )
}

// PR 3 (D-P3-1): linha de campo VAZIO no Portal so' existe quando ha' aviso do
// ERP. O nucleo decide o `kind`; a view decide a linha: o aviso `portal_sem_dado`
// so' vale quando TODO campo do Portal a que ele se refere esta' vazio aqui. Se
// a view tem valor e o nucleo diz vazio (ex.: POs legadas em string), sem aviso.
// -> o proprio hint ou null.
export function getErpEmptyRowHint(hint, process) {
  if (!hint || hint.kind !== 'portal_sem_dado') return null
  const fields = Array.isArray(hint.portalFields) ? hint.portalFields : []
  if (fields.length === 0) return null
  if (fields.includes('purchaseOrders')) {
    return getProcessPurchaseOrders(process).length === 0 ? hint : null
  }
  return fields.every((name) => String(process?.[name] ?? '').trim() === '') ? hint : null
}

// Aviso de uma linha que ja existe (mostra o valor ou o `-` de vazio): o
// divergente vale sempre; o `portal_sem_dado` so' com o campo vazio de fato.
export function getErpRowHint(hint, process) {
  if (!hint) return null
  return hint.kind === 'divergente' ? hint : getErpEmptyRowHint(hint, process)
}

// UX-6b-3 (D6): predicados puros de "tem conteudo" — extraidos dos proprios
// componentes de leitura, e reusados pelo pai (`ProcessDetailView.jsx`) pra
// decidir a numeracao (Chegada `step=3` OU Free time `step=3` se Chegada nao
// renderiza; Aduana `step=4` OU Anuências `step=4` se Aduana nao renderiza).
export function hasArrivalDetails(process) {
  const isMaritime = isMaritimeCategory(process?.category)
  const isAir = isAirCategory(process?.category)
  if (!isMaritime && !isAir) return false

  const hasArrival = hasArrivalSignal(process)
  const hasDtaContent =
    isAir && (process?.dtaStatus || process?.dtaLoadingScheduledAt || process?.dtaArrivalAtItajai)

  return Boolean(hasArrival || process?.ceMercante || process?.ceHouse || process?.terminalName || hasDtaContent)
}

// `erpHints` (PR 3, opcional): com aviso de DUIMP vazia no Portal o bloco passa
// a existir (so' admin chega aqui com hints). Sem o 2o parametro, o
// comportamento e' o de sempre.
export function hasCustomsDetails(process, erpHints) {
  const isMaritime = isMaritimeCategory(process?.category)
  const isAir = isAirCategory(process?.category)
  if (!isMaritime && !isAir) return false

  return Boolean(
    process?.duimpStatus ||
      process?.duimpNumber ||
      process?.duimpRegisteredAt ||
      process?.parameterizedAt ||
      process?.clearanceCompletedAt ||
      getErpEmptyRowHint(erpHints?.fields?.duimpNumber, process) ||
      getErpEmptyRowHint(erpHints?.fields?.duimpRegisteredAt, process)
  )
}

// F17.2b (D-6): bloco "Anuências" - so' quando ha' anuencia efetiva (leitura
// visivel a todos os aprovados, anuencia nao identifica o processo).
export function ProcessLicensesDetails({ process, step, showEmptyPlaceholder = false }) {
  const licenses = getEffectiveLicenses(process)

  if (licenses.length === 0) {
    return showEmptyPlaceholder ? (
      <DetailBlockPlaceholder
        title="Anuências"
        wide
        className="process-block--licenses"
        message="Nenhuma anuência registrada."
      />
    ) : null
  }

  const deferidasCount = licenses.filter((license) => isLicenseDeferred(license?.status)).length
  const hasRejected = licenses.some((license) => isLicenseRejected(license?.status))
  const allDeferred = licenses.every((license) => isLicenseDeferred(license?.status))
  const summaryTone = hasRejected ? 'inline-badge--danger' : allDeferred ? 'inline-badge--ok' : 'inline-badge--warn'
  const summaryBadge = (
    <span className={`inline-badge ${summaryTone}`}>{`${deferidasCount} de ${licenses.length} deferidas`}</span>
  )

  return (
    <DetailBlock step={step} title="Anuências" wide className="process-block--licenses" badges={summaryBadge}>
      <div className="detail-stack detail-stack--compact">
        {licenses.map((license) => {
          const statusTone = isLicenseRejected(license?.status)
            ? 'inline-badge--danger'
            : isLicenseDeferred(license?.status)
              ? 'inline-badge--ok'
              : ''
          return (
            <div className="detail-block__row" key={license.id}>
              <p>
                <strong>{license.agency}</strong>
                {license.lpcoNumber ? ` LPCO ${license.lpcoNumber}` : ''}{' '}
                <span className={`inline-badge ${statusTone}`.trim()}>{license.status}</span>
              </p>
              {license.inspectionScheduledAt ? (
                <p>Vistoria agendada: {formatDateTime(license.inspectionScheduledAt)}</p>
              ) : null}
              {license.deferredAt ? <p>Deferida em: {formatDeferredAt(license.deferredAt)}</p> : null}
              {license.notes ? <p>{license.notes}</p> : null}
            </div>
          )
        })}
      </div>
    </DetailBlock>
  )
}

// O aviso fica DENTRO do valor (span): a linha e' um <p>, entao o chip e o
// balao so' podem ser <span>.
function IdentRow({ label, children, hint }) {
  return (
    <p className="detail-ident__row">
      <span className="detail-ident__label">
        {label}
        <span className="detail-ident__sep">:</span>
      </span>{' '}
      <span className="detail-ident__value">
        {children}
        {hint ? <ErpHint hint={hint} /> : null}
      </span>
    </p>
  )
}

const EMPTY_ROW_VALUE = '—'

// `erpHints` (PR 3, opcional, so' admin): avisos do ERP. As linhas de campo
// vazio (`—`) so' existem quando ha' aviso; sem aviso o DOM e' o de sempre.
export function ProcessIdentificationDetails({ process, canSeeName, erpHints }) {
  const fields = erpHints?.fields
  const canShowName = canShowProcessName(process, canSeeName)
  const isConsolidated = process?.category === 'CONSOLIDADO'
  const showSupplier = canShowName && !isConsolidated && process?.supplierName
  const emptySupplierHint =
    !showSupplier && canShowName && !isConsolidated ? getErpEmptyRowHint(fields?.supplier, process) : null
  const emptyOriginHint = !process?.originLocation ? getErpEmptyRowHint(fields?.origin, process) : null
  const emptyIncotermHint = !process?.incoterm ? getErpEmptyRowHint(fields?.incoterm, process) : null
  const hasContent =
    showSupplier ||
    process?.originLocation ||
    process?.incoterm ||
    process?.forwarderName ||
    emptySupplierHint ||
    emptyOriginHint ||
    emptyIncotermHint

  if (!hasContent) return null

  return (
    <div className="detail-card process-general-card process-general-card--ident">
      <span className="detail-label">Identificação</span>
      <div className="detail-stack detail-stack--compact detail-ident">
        {showSupplier ? (
          <IdentRow label="Fornecedor" hint={getErpRowHint(fields?.supplier, process)}>
            {process.supplierName}
          </IdentRow>
        ) : emptySupplierHint ? (
          <IdentRow label="Fornecedor" hint={emptySupplierHint}>
            {EMPTY_ROW_VALUE}
          </IdentRow>
        ) : null}
        {process?.originLocation ? (
          <IdentRow label="Origem" hint={getErpRowHint(fields?.origin, process)}>
            {process.originLocation}
          </IdentRow>
        ) : emptyOriginHint ? (
          <IdentRow label="Origem" hint={emptyOriginHint}>
            {EMPTY_ROW_VALUE}
          </IdentRow>
        ) : null}
        {process?.incoterm ? (
          <IdentRow label="Incoterm" hint={getErpRowHint(fields?.incoterm, process)}>
            {process.incoterm}
          </IdentRow>
        ) : emptyIncotermHint ? (
          <IdentRow label="Incoterm" hint={emptyIncotermHint}>
            {EMPTY_ROW_VALUE}
          </IdentRow>
        ) : null}
        {process?.forwarderName ? <IdentRow label="Agente de carga">{process.forwarderName}</IdentRow> : null}
      </div>
    </div>
  )
}

// UX-6b-3 (D7.1): bloco "Carga" (step 1, sempre renderiza — pallets sempre
// aparece hoje). Tabela de contêineres (Contêiner | Tipo | Lacre | Devolução
// do vazio) + pesos/cubagem/volumes/pallets + "Contêineres" (legado, so'
// quando `containers[]` esta vazio e a categoria mostra quantidade) + linha
// IMO por item perigoso (mais o legado do processo).
// F18b-2 (E9): `containerWashIds` e' prop opcional (array de `container.id`
// com relatorio de lavacao enviado, lido de `documentIndex` pelo pai). Sem
// a prop, o render fica identico ao atual.
export function ProcessCargoDetails({ process, showContainerQuantity, containerWashIds }) {
  const containers = Array.isArray(process?.containers) ? process.containers : []
  const specialBadges = getContainerSpecialBadges(containers)
  const isDangerous = hasDangerousGoods(process)
  const isFlammable = hasFlammableGoods(process)

  const badges = (
    <>
      {specialBadges.map((badge) => (
        <span key={badge} className="inline-badge inline-badge--warn">
          {badge}
        </span>
      ))}
      {isDangerous ? <span className="inline-badge inline-badge--danger">Carga perigosa</span> : null}
      {isFlammable ? <span className="inline-badge inline-badge--danger">Carga inflamável</span> : null}
    </>
  )

  const dangerousItems = (Array.isArray(process?.items) ? process.items : []).filter(
    (item) => item?.dangerousGoods === true
  )

  return (
    <DetailBlock step={1} title="Carga" wide className="process-block--cargo" badges={badges}>
      {containers.length > 0 ? (
        <div className="detail-table__scroll">
          <table className="detail-table" aria-label="Contêineres">
            <thead>
              <tr>
                <th scope="col">Contêiner</th>
                <th scope="col">Tipo</th>
                <th scope="col">Lacre</th>
                <th scope="col">Devolução do vazio</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((container) => (
                <tr key={container.id}>
                  <td data-label="Contêiner">{container.number || 'Sem número'}</td>
                  <td data-label="Tipo">
                    {CONTAINER_TYPE_OPTIONS.find((option) => option.value === container.type)?.label ??
                      container.type ??
                      '—'}
                  </td>
                  <td data-label="Lacre">{container.seal || '—'}</td>
                  <td data-label="Devolução do vazio">
                    {container.returnedAt ? (
                      <span className="detail-table__badges">
                        {isContainerReturnPlanned(container) ? (
                          <span className="inline-badge">{`Devolução prevista para ${formatDate(container.returnedAt)}`}</span>
                        ) : (
                          <span className="inline-badge inline-badge--ok">{`Devolvido em ${formatDate(container.returnedAt)}`}</span>
                        )}
                        {Array.isArray(containerWashIds) && !isContainerReturnPlanned(container) ? (
                          containerWashIds.includes(container.id) ? (
                            <span className="inline-badge inline-badge--ok">Lavação enviada</span>
                          ) : (
                            <span className="inline-badge inline-badge--warn">Lavação pendente</span>
                          )
                        ) : null}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <DetailList>
        {/* 2026-10-01 (Lucas): contador de conteineres no card, contando a tabela. */}
        {containers.length > 0 ? (
          <DetailRow label="Contêineres">{formatContainerCount(containers.length)}</DetailRow>
        ) : null}
        {process?.grossWeightKg > 0 ? <DetailRow label="Peso bruto">{`${process.grossWeightKg} kg`}</DetailRow> : null}
        {process?.volumeM3 > 0 ? <DetailRow label="Cubagem">{`${process.volumeM3} m³`}</DetailRow> : null}
        {process?.chargeableWeightKg > 0 ? (
          <DetailRow label="Peso taxado">{`${process.chargeableWeightKg} kg`}</DetailRow>
        ) : null}
        {process?.packagesQuantity > 0 ? <DetailRow label="Volumes">{process.packagesQuantity}</DetailRow> : null}
        <DetailRow label="Pallets">{formatPalletCount(process?.palletQuantity)}</DetailRow>
        {containers.length === 0 && showContainerQuantity ? (
          <DetailRow label="Contêineres">{formatContainerCount(process?.containerQuantity)}</DetailRow>
        ) : null}
        {dangerousItems.map((item) => (
          <DetailRow key={item.id} label="IMO">
            {`${item.commercialName || 'Item sem nome'}: ${getItemDangerousGoodsLabel(item)}`}
          </DetailRow>
        ))}
        {isLegacyProcessDangerousGoods(process) ? (
          <DetailRow label="IMO">
            {`Cadastro antigo do processo: ${
              [
                process?.unNumber ? `ONU ${process.unNumber}` : null,
                process?.imoClass ? `Classe ${getImoClassLabel(process.imoClass)}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'sem número ONU/classe registrados'
            }`}
          </DetailRow>
        ) : null}
      </DetailList>
    </DetailBlock>
  )
}

// UX-6b-3 (D7.2): bloco "Embarque e trânsito" (step 2, so' quando ha' sinal
// de embarque ou transbordo).
// BL/AWB (PR 3): o aviso vai na 1a linha PREENCHIDA do par do diff; com o par
// vazio, a linha nova leva o rotulo do 1o campo (MBL ou MAWB).
const BL_ROW_LABELS = { masterBl: 'MBL', houseBl: 'HBL', mawb: 'MAWB', hawb: 'HAWB' }

export function ProcessTransitDetails({ process, showEmptyPlaceholder = false, erpHints }) {
  const trackingTarget = getVesselTrackingTarget(process)
  const fields = erpHints?.fields
  const hasTransit =
    trackingTarget ||
    process?.shippedAt ||
    process?.vesselName ||
    process?.voyage ||
    process?.flightNumber ||
    process?.masterBl ||
    process?.houseBl ||
    process?.mawb ||
    process?.hawb

  // Avisos do ERP (so' admin): linha nova (`—`) de Navio e de MBL/MAWB vazios e
  // aviso nas linhas que ja existem. Sem aviso, nada muda.
  const emptyVesselHint = getErpEmptyRowHint(fields?.vessel, process)
  const emptyBlHint = getErpEmptyRowHint(fields?.bl, process)
  const vesselHint = fields?.vessel?.kind === 'divergente' ? fields.vessel : null
  const blHint = fields?.bl?.kind === 'divergente' ? fields.bl : null
  const blPortalFields = Array.isArray(fields?.bl?.portalFields) ? fields.bl.portalFields : []
  const blFirstFilled = blPortalFields.find((name) => String(process?.[name] ?? '').trim() !== '')
  const blEmptyLabel = BL_ROW_LABELS[blPortalFields[0]]
  // Divergente de ETD sem `etd` (so' `shippedAt`): o aviso vai na Data de embarque.
  const shippedHint = fields?.etd?.kind === 'divergente' && !process?.etd && process?.shippedAt ? fields.etd : null
  // Divergente de navio sem `vesselName`: a linha Viagem leva o aviso.
  const voyageHint = vesselHint && !process?.vesselName && process?.voyage ? vesselHint : null
  const vesselRowHint = vesselHint && process?.vesselName ? vesselHint : null
  const hasErpRows = Boolean(emptyVesselHint || (emptyBlHint && blEmptyLabel))
  const blRowHint = (field) => (blHint && blFirstFilled === field ? blHint : null)

  if (!hasTransit && !process?.transshipment && !hasErpRows) {
    return showEmptyPlaceholder ? (
      <DetailBlockPlaceholder
        title="Embarque e trânsito"
        wide
        className="process-block--transit"
        message="Embarque ainda não registrado."
      />
    ) : null
  }

  return (
    <DetailBlock step={2} title="Embarque e trânsito" wide className="process-block--transit">
      <DetailList>
        {process?.shippedAt ? (
          <DetailRow label="Data de embarque" hint={shippedHint}>
            {formatDate(process.shippedAt)}
          </DetailRow>
        ) : null}
        {process?.vesselName ? (
          <DetailRow label="Navio" hint={vesselRowHint}>
            {process.vesselName}
          </DetailRow>
        ) : emptyVesselHint ? (
          <DetailRow label="Navio" hint={emptyVesselHint}>
            {EMPTY_ROW_VALUE}
          </DetailRow>
        ) : null}
        {process?.voyage ? (
          <DetailRow label="Viagem" hint={voyageHint}>
            {process.voyage}
          </DetailRow>
        ) : null}
        {trackingTarget?.imo ? <DetailRow label="IMO do navio">{trackingTarget.imo}</DetailRow> : null}
        {process?.flightNumber ? <DetailRow label="Voo">{process.flightNumber}</DetailRow> : null}
        {process?.masterBl ? (
          <DetailRow label="MBL" hint={blRowHint('masterBl')}>
            {process.masterBl}
          </DetailRow>
        ) : emptyBlHint && blEmptyLabel === 'MBL' ? (
          <DetailRow label="MBL" hint={emptyBlHint}>
            {EMPTY_ROW_VALUE}
          </DetailRow>
        ) : null}
        {process?.houseBl ? (
          <DetailRow label="HBL" hint={blRowHint('houseBl')}>
            {process.houseBl}
          </DetailRow>
        ) : null}
        {process?.mawb ? (
          <DetailRow label="MAWB" hint={blRowHint('mawb')}>
            {process.mawb}
          </DetailRow>
        ) : emptyBlHint && blEmptyLabel === 'MAWB' ? (
          <DetailRow label="MAWB" hint={emptyBlHint}>
            {EMPTY_ROW_VALUE}
          </DetailRow>
        ) : null}
        {process?.hawb ? (
          <DetailRow label="HAWB" hint={blRowHint('hawb')}>
            {process.hawb}
          </DetailRow>
        ) : null}
        {process?.transshipment ? (
          <DetailRow label="Transbordo">
            {`${process?.transshipmentPort ? `Sim — ${process.transshipmentPort}` : 'Sim'}${process?.transshipmentEtd ? ` · ETD ${formatDate(process.transshipmentEtd)}` : ''}`}
          </DetailRow>
        ) : null}
      </DetailList>
      {trackingTarget ? (
        <div className="detail-block__actions process-transit__actions">
          <VesselTrackingButton process={process} />
        </div>
      ) : null}
    </DetailBlock>
  )
}

// F17.3a (D-12): bloco "Chegada" - atracacao/chegada com data (aprox. quando
// migrada), CE/terminal, DTA (aereo) e presenca de carga com data. So'
// renderiza se ha algum dado (visivel a todos os aprovados).
export function ProcessArrivalDetails({ process, step, showEmptyPlaceholder = false }) {
  const isMaritime = isMaritimeCategory(process?.category)
  const isAir = isAirCategory(process?.category)

  if (!hasArrivalDetails(process)) {
    return showEmptyPlaceholder && (isMaritime || isAir) ? (
      <DetailBlockPlaceholder
        title="Chegada"
        className="process-block--arrival"
        message="Chegada ainda não registrada."
      />
    ) : null
  }

  const hasArrival = hasArrivalSignal(process)
  const hasPresence = hasCargoPresenceSignal(process)
  const arrivalField = isMaritime ? 'berthedAt' : 'arrivedAt'
  const arrivalValue = isMaritime ? process?.berthedAt : process?.arrivedAt
  const isApprox = isApproxDate(process, arrivalField)

  return (
    <DetailBlock step={step} title="Chegada" className="process-block--arrival">
      <DetailList>
        {hasArrival ? (
          <DetailRow label={isMaritime ? 'Atracação' : 'Chegada'}>
            {hasDateValue(arrivalValue)
              ? `${formatDateTime(arrivalValue)}${isApprox ? ' (aprox.)' : ''}`
              : 'Confirmada (sem data)'}
          </DetailRow>
        ) : null}
        {process?.ceMercante ? <DetailRow label="CE Mercante">{process.ceMercante}</DetailRow> : null}
        {process?.ceHouse ? <DetailRow label="CE house">{process.ceHouse}</DetailRow> : null}
        {process?.terminalName ? <DetailRow label="Terminal / armazém">{process.terminalName}</DetailRow> : null}
        {isAir && process?.dtaStatus ? <DetailRow label="DTA">{process.dtaStatus}</DetailRow> : null}
        {isAir && process?.dtaLoadingScheduledAt ? (
          <DetailRow label="Carregamento DTA">{formatDateTime(process.dtaLoadingScheduledAt)}</DetailRow>
        ) : null}
        {isAir && process?.dtaArrivalAtItajai ? (
          <DetailRow label="Chegada prevista em Itajaí">{formatDateTime(process.dtaArrivalAtItajai)}</DetailRow>
        ) : null}
        {hasArrival ? (
          <DetailRow label="Presença de carga">
            {hasPresence
              ? hasDateValue(process?.cargoPresenceInformedAt)
                ? formatDateTime(process.cargoPresenceInformedAt)
                : 'Informada (sem data)'
              : 'Pendente'}
          </DetailRow>
        ) : null}
      </DetailList>
    </DetailBlock>
  )
}

// F17.3a (D-12): bloco "Free time" (FCL/CONSOLIDADO) - prazo de devolucao do
// vazio (A1: conta da presenca de carga). UX-6b-3 (F2): vencido e' o UNICO
// bloco que muda de cor (`tone="danger"`).
export function ProcessFreeTimeDetails({ process, step, showEmptyPlaceholder = false }) {
  const status = getFreeTimeStatus(process)
  if (!status) return null
  if (status.state === 'not-informed') {
    return showEmptyPlaceholder ? (
      <DetailBlockPlaceholder
        title="Free time"
        wide
        className="process-block--free-time"
        message="Free time não informado."
      />
    ) : null
  }

  function formatDeadline(value) {
    if (!value) return ''
    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
  }

  let content = null
  let toneClass = ''

  if (status.state === 'waiting-presence') {
    content = `${process.freeTimeDays} dias · inicia na presença de carga`
  } else if (status.state === 'presence-without-date') {
    content = `${process.freeTimeDays} dias · informe a data da presença de carga para calcular o prazo`
  } else if (status.state === 'closed') {
    content = 'Vazios devolvidos'
  } else {
    const deadlineLabel = formatDeadline(status.deadlineKey)
    if (status.state === 'running') {
      content = `Devolução do vazio até ${deadlineLabel} · faltam ${status.daysRemaining} dia(s)`
      toneClass = status.daysRemaining <= 5 ? 'inline-badge--warn' : ''
    } else if (status.state === 'due-today') {
      content = `Devolução do vazio até ${deadlineLabel} · vence hoje`
      toneClass = 'inline-badge--warn'
    } else if (status.state === 'overdue') {
      content = `Devolução do vazio até ${deadlineLabel} · vencido há ${Math.abs(status.daysRemaining)} dia(s)`
      toneClass = 'inline-badge--danger'
    }
  }

  const badge = toneClass ? <span className={`inline-badge ${toneClass}`}>{content}</span> : null

  return (
    <DetailBlock step={step} title="Free time" wide className="process-block--free-time" badges={badge} tone={status.state === 'overdue' ? 'danger' : undefined}>
      <DetailList>
        {!badge ? <DetailRow label="Situação">{content}</DetailRow> : null}
        {process?.demurrageDailyRateUsd != null ? (
          <DetailRow label="Diária de demurrage">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(
              process.demurrageDailyRateUsd
            )}
          </DetailRow>
        ) : null}
      </DetailList>
    </DetailBlock>
  )
}

const CHANNEL_BADGE_TONE = {
  Verde: 'inline-badge--ok',
  Amarelo: 'inline-badge--warn',
  Vermelho: 'inline-badge--danger',
}

// F17.3b (D-14): bloco "Aduana (DUIMP)" (numero, registro, parametrizacao,
// conferencia, exigencia/procedimento especial, desembaraco). UX-6b-3 (D7.4):
// DUIMP NEUTRA — o canal vira badge no cabecalho (nao mais card colorido).
// So' renderiza se maritimo/aereo e ha algum dado preenchido. Visivel a
// todos os aprovados (nenhum campo identifica o processo; mascara de nome
// intocada).
export function ProcessCustomsDetails({ process, step, showEmptyPlaceholder = false, erpHints }) {
  // `hasCustomsDetails(process, erpHints)` e' o unico predicado (o pai o usa para
  // a numeracao das Anuências): com aviso de DUIMP vazia o bloco passa a existir.
  if (!hasCustomsDetails(process, erpHints)) {
    return showEmptyPlaceholder && (isMaritimeCategory(process?.category) || isAirCategory(process?.category)) ? (
      <DetailBlockPlaceholder
        title="Aduana (DUIMP)"
        className="process-block--customs"
        message="DUIMP ainda não registrada."
      />
    ) : null
  }

  const channel = process?.parameterizationChannel
  const isCinza = channel === 'Cinza'
  const isInspectionChannel = CUSTOMS_INSPECTION_CHANNELS.includes(channel)
  const channelBadge = channel ? (
    <span className={`inline-badge ${CHANNEL_BADGE_TONE[channel] ?? ''}`.trim()}>{`Canal ${channel}`}</span>
  ) : null
  const fields = erpHints?.fields
  const emptyNumberHint = !process?.duimpNumber ? getErpEmptyRowHint(fields?.duimpNumber, process) : null
  const registeredHint = getErpRowHint(fields?.duimpRegisteredAt, process)

  return (
    <DetailBlock step={step} title="Aduana (DUIMP)" className="process-block--customs" badges={channelBadge}>
      <DetailList>
        {process?.duimpStatus ? <DetailRow label="Status">{process.duimpStatus}</DetailRow> : null}
        {process?.duimpNumber ? (
          <DetailRow label="Nº da DUIMP" hint={getErpRowHint(fields?.duimpNumber, process)}>
            {process.duimpNumber}
          </DetailRow>
        ) : emptyNumberHint ? (
          <DetailRow label="Nº da DUIMP" hint={emptyNumberHint}>
            {EMPTY_ROW_VALUE}
          </DetailRow>
        ) : null}
        {isLegacyDuimpRegisteredWithoutDate(process) ? (
          <DetailRow label="Registro" hint={registeredHint}>
            sem data (registro antigo)
          </DetailRow>
        ) : process?.duimpRegisteredAt ? (
          <DetailRow label="Registro" hint={registeredHint}>
            {formatDateTime(process.duimpRegisteredAt)}
          </DetailRow>
        ) : registeredHint ? (
          <DetailRow label="Registro" hint={registeredHint}>
            {EMPTY_ROW_VALUE}
          </DetailRow>
        ) : null}
        {isLegacyParameterizedWithoutDate(process) ? (
          <DetailRow label="Parametrização">sem data (registro antigo)</DetailRow>
        ) : process?.parameterizedAt ? (
          <DetailRow label="Parametrização">{formatDateTime(process.parameterizedAt)}</DetailRow>
        ) : null}
        {isInspectionChannel && process?.customsInspectionScheduledAt ? (
          <DetailRow label="Conferência agendada para">
            {formatDateTime(process.customsInspectionScheduledAt)}
          </DetailRow>
        ) : null}
        {process?.customsRequirement && !isCinza ? (
          <DetailRow label="Exigência">{process?.customsRequirementNotes || 'Sim'}</DetailRow>
        ) : null}
        {isCinza && process?.customsRequirementNotes ? (
          <DetailRow label="Procedimento especial">{process.customsRequirementNotes}</DetailRow>
        ) : null}
        {process?.clearanceCompletedAt ? (
          <DetailRow label="Desembaraço concluído em">{formatDateTime(process.clearanceCompletedAt)}</DetailRow>
        ) : null}
      </DetailList>
    </DetailBlock>
  )
}

// F17.4b (B-4): bloco "Divergência no recebimento" - visivel a todo aprovado
// que ve o detalhe (mesma regra das observacoes pos-recebimento; nenhum
// campo identifica o processo).
export function ProcessReceiptDivergenceDetails({ process }) {
  if (!hasReceiptDivergence(process)) return null

  return (
    <DetailBlock title="Divergência no recebimento" className="process-block--divergence">
      <p>
        <span className="inline-badge inline-badge--danger">
          {process?.receiptDivergenceType || 'Tipo não informado'}
        </span>
      </p>
      {process?.receiptDivergenceNotes ? <p>{process.receiptDivergenceNotes}</p> : null}
    </DetailBlock>
  )
}
