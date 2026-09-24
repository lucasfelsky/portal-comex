import { getContainerSpecialBadges } from './containers'
import {
  getImoClassLabel,
  getItemDangerousGoodsLabel,
  hasDangerousGoods,
  isLegacyProcessDangerousGoods,
} from './operationalOptions'
import { canShowProcessName } from './processLabels'
import { getEffectiveLicenses } from './licenses'
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
import { getChannelToneClass } from './processStatusView'

// F17.2a (D-11/D-7/D-8): leitura dos 22 campos novos no detalhe do
// processo. F17.2b (D-6): leitura de `licenses[]` (`ProcessLicensesDetails`).
// F17.3a (D-12): leitura de chegada com data/CE/terminal/free time
// (`ProcessArrivalDetails`/`ProcessFreeTimeDetails`).
// F17.3b (D-14): card "DUIMP" completo (`ProcessCustomsDetails`).
// Regra de import (D-11/D-12/D-14): so' `./containers`, `./operationalOptions`,
// `./processLabels` (so' `canShowProcessName`), `./licenses`,
// `../../utils/dateFormat` (so' `formatDateTime`), `./arrivalCustoms`,
// `./processCategories`, `./processStatusView` (so' `getChannelToneClass`).
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

// F17.2b (D-6): card "Anuências" - so' quando ha' anuencia efetiva (leitura
// visivel a todos os aprovados, anuencia nao identifica o processo).
export function ProcessLicensesDetails({ process }) {
  const licenses = getEffectiveLicenses(process)

  if (licenses.length === 0) return null

  return (
    <div className="detail-card">
      <span className="detail-label">Anuências</span>
      <ul className="detail-stack detail-stack--compact">
        {licenses.map((license) => (
          <li key={license.id}>
            <p>
              {[license.agency, license.lpcoNumber ? `LPCO ${license.lpcoNumber}` : null, license.status]
                .filter(Boolean)
                .join(' · ')}
              {license.status === 'Indeferida' ? (
                <>
                  {' '}
                  <span className="inline-badge inline-badge--danger">Indeferida</span>
                </>
              ) : null}
            </p>
            {license.inspectionScheduledAt ? (
              <p>Vistoria agendada: {formatDateTime(license.inspectionScheduledAt)}</p>
            ) : null}
            {license.deferredAt ? <p>Deferida em: {formatDeferredAt(license.deferredAt)}</p> : null}
            {license.notes ? <p>{license.notes}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ProcessIdentificationDetails({ process, canSeeName }) {
  const showSupplier = canShowProcessName(process, canSeeName) && process?.supplierName
  const hasContent =
    showSupplier || process?.originLocation || process?.incoterm || process?.forwarderName

  if (!hasContent) return null

  return (
    <div className="detail-card">
      <span className="detail-label">Identificação</span>
      <div className="detail-stack detail-stack--compact">
        {showSupplier ? <p>Fornecedor: {process.supplierName}</p> : null}
        {process?.originLocation ? <p>Origem: {process.originLocation}</p> : null}
        {process?.incoterm ? <p>Incoterm: {process.incoterm}</p> : null}
        {process?.forwarderName ? <p>Agente de carga: {process.forwarderName}</p> : null}
      </div>
    </div>
  )
}

export function ProcessCargoTransitDetails({ process }) {
  const containers = Array.isArray(process?.containers) ? process.containers : []
  const specialBadges = getContainerSpecialBadges(containers)
  const hasWeights =
    process?.grossWeightKg > 0 ||
    process?.volumeM3 > 0 ||
    process?.chargeableWeightKg > 0 ||
    process?.packagesQuantity > 0
  const hasTransit =
    process?.shippedAt ||
    process?.vesselName ||
    process?.voyage ||
    process?.flightNumber ||
    process?.masterBl ||
    process?.houseBl ||
    process?.mawb ||
    process?.hawb

  return (
    <>
      {containers.length > 0 ? (
        <div className="detail-card">
          <div className="card-heading process-detail-card-heading">
            <span className="detail-label">Contêineres</span>
            {specialBadges.map((badge) => (
              <span key={badge} className="inline-badge inline-badge--warn">
                {badge}
              </span>
            ))}
          </div>
          <ul className="detail-stack detail-stack--compact">
            {containers.map((container) => (
              <li key={container.id}>
                {[container.number || 'Sem número', container.seal || 'sem lacre', container.type || 'sem tipo']
                  .join(' · ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasWeights ? (
        <div className="detail-card detail-card--split">
          {process?.grossWeightKg > 0 ? (
            <div>
              <span className="detail-label">Peso bruto</span>
              <p>{process.grossWeightKg} kg</p>
            </div>
          ) : null}
          {process?.volumeM3 > 0 ? (
            <div>
              <span className="detail-label">Cubagem</span>
              <p>{process.volumeM3} m³</p>
            </div>
          ) : null}
          {process?.chargeableWeightKg > 0 ? (
            <div>
              <span className="detail-label">Peso taxado</span>
              <p>{process.chargeableWeightKg} kg</p>
            </div>
          ) : null}
          {process?.packagesQuantity > 0 ? (
            <div>
              <span className="detail-label">Volumes</span>
              <p>{process.packagesQuantity}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {hasDangerousGoods(process) ? (
        <div className="detail-card">
          <span className="detail-label">Carga perigosa</span>
          <div className="detail-stack detail-stack--compact">
            {(Array.isArray(process?.items) ? process.items : [])
              .filter((item) => item?.dangerousGoods === true)
              .map((item) => (
                <p key={item.id}>
                  {item.commercialName || 'Item sem nome'}: {getItemDangerousGoodsLabel(item)}
                </p>
              ))}
            {isLegacyProcessDangerousGoods(process) ? (
              <p>
                Cadastro antigo do processo:{' '}
                {[
                  process?.unNumber ? `ONU ${process.unNumber}` : null,
                  process?.imoClass ? `Classe ${getImoClassLabel(process.imoClass)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'sem número ONU/classe registrados'}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasTransit ? (
        <div className="detail-card">
          <span className="detail-label">Embarque e trânsito</span>
          <div className="detail-stack detail-stack--compact">
            {process?.shippedAt ? <p>Data de embarque: {formatDate(process.shippedAt)}</p> : null}
            {process?.vesselName ? <p>Navio: {process.vesselName}</p> : null}
            {process?.voyage ? <p>Viagem: {process.voyage}</p> : null}
            {process?.flightNumber ? <p>Voo: {process.flightNumber}</p> : null}
            {process?.masterBl ? <p>MBL: {process.masterBl}</p> : null}
            {process?.houseBl ? <p>HBL: {process.houseBl}</p> : null}
            {process?.mawb ? <p>MAWB: {process.mawb}</p> : null}
            {process?.hawb ? <p>HAWB: {process.hawb}</p> : null}
          </div>
        </div>
      ) : null}

      {process?.transshipment ? (
        <div className="detail-card">
          <span className="detail-label">Transbordo</span>
          <p>
            {process?.transshipmentPort ? `Sim — ${process.transshipmentPort}` : 'Sim'}
            {process?.transshipmentEtd ? ` · ETD ${formatDate(process.transshipmentEtd)}` : ''}
          </p>
        </div>
      ) : null}
    </>
  )
}

// F17.3a (D-12): card "Chegada" - atracacao/chegada com data (aprox. quando
// migrada), CE/terminal, DTA (aereo) e presenca de carga com data. So'
// renderiza se ha algum dado (visivel a todos os aprovados).
export function ProcessArrivalDetails({ process }) {
  const isMaritime = isMaritimeCategory(process?.category)
  const isAir = isAirCategory(process?.category)
  if (!isMaritime && !isAir) return null

  const hasArrival = hasArrivalSignal(process)
  const hasPresence = hasCargoPresenceSignal(process)
  const arrivalField = isMaritime ? 'berthedAt' : 'arrivedAt'
  const arrivalValue = isMaritime ? process?.berthedAt : process?.arrivedAt
  const isApprox = isApproxDate(process, arrivalField)

  const hasDtaContent =
    isAir && (process?.dtaStatus || process?.dtaLoadingScheduledAt || process?.dtaArrivalAtItajai)

  const hasContent =
    hasArrival || process?.ceMercante || process?.ceHouse || process?.terminalName || hasDtaContent

  if (!hasContent) return null

  return (
    <div className="detail-card">
      <span className="detail-label">Chegada</span>
      <div className="detail-stack detail-stack--compact">
        {hasArrival ? (
          <p>
            {isMaritime ? 'Atracação:' : 'Chegada:'}{' '}
            {hasDateValue(arrivalValue)
              ? `${formatDateTime(arrivalValue)}${isApprox ? ' (aprox.)' : ''}`
              : 'Confirmada (sem data)'}
          </p>
        ) : null}
        {process?.ceMercante ? <p>CE Mercante: {process.ceMercante}</p> : null}
        {process?.ceHouse ? <p>CE house: {process.ceHouse}</p> : null}
        {process?.terminalName ? <p>Terminal / armazém: {process.terminalName}</p> : null}
        {isAir && process?.dtaStatus ? <p>DTA: {process.dtaStatus}</p> : null}
        {isAir && process?.dtaLoadingScheduledAt ? (
          <p>Carregamento DTA: {formatDateTime(process.dtaLoadingScheduledAt)}</p>
        ) : null}
        {isAir && process?.dtaArrivalAtItajai ? (
          <p>Chegada prevista em Itajaí: {formatDateTime(process.dtaArrivalAtItajai)}</p>
        ) : null}
        {hasArrival ? (
          <p>
            Presença de carga:{' '}
            {hasPresence
              ? hasDateValue(process?.cargoPresenceInformedAt)
                ? formatDateTime(process.cargoPresenceInformedAt)
                : 'Informada (sem data)'
              : 'Pendente'}
          </p>
        ) : null}
      </div>
    </div>
  )
}

// F17.3a (D-12): card "Free time" (FCL/CONSOLIDADO) - prazo de devolucao do
// vazio (A1: conta da presenca de carga).
export function ProcessFreeTimeDetails({ process }) {
  const status = getFreeTimeStatus(process)
  if (!status || status.state === 'not-informed') return null

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

  return (
    <div className="detail-card">
      <span className="detail-label">Free time</span>
      <div className="detail-stack detail-stack--compact">
        {toneClass ? (
          <p><span className={`inline-badge ${toneClass}`}>{content}</span></p>
        ) : (
          <p>{content}</p>
        )}
        {process?.demurrageDailyRateUsd != null ? (
          <p>
            Diária de demurrage:{' '}
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(
              process.demurrageDailyRateUsd
            )}
          </p>
        ) : null}
      </div>
    </div>
  )
}

// F17.3b (D-14): card "DUIMP" (numero, registro, parametrizacao, canal,
// conferencia, exigencia/procedimento especial, desembaraco). So' renderiza
// se maritimo/aereo e ha algum dado preenchido. Visivel a todos os
// aprovados (nenhum campo identifica o processo; mascara de nome intocada).
export function ProcessCustomsDetails({ process }) {
  const isMaritime = isMaritimeCategory(process?.category)
  const isAir = isAirCategory(process?.category)
  if (!isMaritime && !isAir) return null

  const hasContent =
    process?.duimpStatus ||
    process?.duimpNumber ||
    process?.duimpRegisteredAt ||
    process?.parameterizedAt ||
    process?.clearanceCompletedAt

  if (!hasContent) return null

  const channel = process?.parameterizationChannel
  const isCinza = channel === 'Cinza'
  const isInspectionChannel = CUSTOMS_INSPECTION_CHANNELS.includes(channel)

  return (
    <div className={`detail-card ${getChannelToneClass(channel)}`.trim()}>
      <span className="detail-label">DUIMP</span>
      <div className="detail-stack detail-stack--compact">
        {process?.duimpStatus ? <p>Status: {process.duimpStatus}</p> : null}
        {process?.duimpNumber ? <p>Nº da DUIMP: {process.duimpNumber}</p> : null}
        {isLegacyDuimpRegisteredWithoutDate(process) ? (
          <p>Registro: sem data (registro antigo)</p>
        ) : process?.duimpRegisteredAt ? (
          <p>Registro: {formatDateTime(process.duimpRegisteredAt)}</p>
        ) : null}
        {isLegacyParameterizedWithoutDate(process) ? (
          <p>Parametrização: sem data (registro antigo)</p>
        ) : process?.parameterizedAt ? (
          <p>Parametrização: {formatDateTime(process.parameterizedAt)}</p>
        ) : null}
        {channel ? <p>Canal da parametrização: {channel}</p> : null}
        {isInspectionChannel && process?.customsInspectionScheduledAt ? (
          <p>Conferência agendada para: {formatDateTime(process.customsInspectionScheduledAt)}</p>
        ) : null}
        {process?.customsRequirement && !isCinza ? (
          <p>Exigência: {process?.customsRequirementNotes || 'Sim'}</p>
        ) : null}
        {isCinza && process?.customsRequirementNotes ? (
          <p>Procedimento especial: {process.customsRequirementNotes}</p>
        ) : null}
        {process?.clearanceCompletedAt ? (
          <p>Desembaraço concluído em: {formatDateTime(process.clearanceCompletedAt)}</p>
        ) : null}
      </div>
    </div>
  )
}
