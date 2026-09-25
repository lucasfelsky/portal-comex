import { useEffect, useState } from 'react'
import { useSwipe } from '../../hooks/useSwipe'
import Spinner from '../../components/Spinner'
import SelectField from '../../components/SelectField'
import CollectionWindowsEditor from './CollectionWindowsEditor'
import {
  getDisplayedCollectionStatus,
  getDisplayedProcessStatus,
  isCollectionScheduledOrBeyondStatus,
  postCollectionStatusOptions,
  normalizeComparableText,
} from './processStatus'
import { getStatusTagClass } from './processStatusView'
import { isMaritimeCategory, isAirCategory } from './processCategories'
import { deriveProcessStatus, isCollectionReleased } from './deriveProcessStatus'
import { hasCargoPresenceSignal, FREE_TIME_CATEGORIES } from './arrivalCustoms'
import EmptyReturnFields from './EmptyReturnFields'
import {
  getAutomaticEstimatedDeliveryDate,
  getEstimatedDeliveryDate,
} from '../../utils/deliveryForecast'
import { getCollectionWindows } from '../../utils/collectionWindows'
import { INCOTERM_OPTIONS } from './operationalOptions'
import ProcessCargoFields from './ProcessCargoFields'
import ProcessTransitFields from './ProcessTransitFields'
import ProcessArrivalFields from './ProcessArrivalFields'
import ProcessCustomsFields from './ProcessCustomsFields'
import ProcessItemDangerousGoodsFields from './ProcessItemDangerousGoodsFields'
import LicensesEditor from './LicensesEditor'
import PurchaseOrdersEditor from './PurchaseOrdersEditor'
import { getProcessPurchaseOrders, getPurchaseOrderNumbers } from './purchaseOrders'
import {
  hasShipmentDateDivergence,
  isFutureShipment,
  isShipmentConfirmed,
} from './shipmentConfirmation'

// F10.5 (backlog 2026-07-12): tela de criação/edição do processo
// (viewMode 'create' || 'edit'), extraída do ProcessesPage. Presentacional
// — lê o `draft` (via prop) e chama callbacks (`onDraftChange` para cada
// campo, `onSave`, `onSetViewModeList`). As opções dos selects vêm por
// props — o page é quem conhece os services.
//
// C11 (auditoria mobile F14): o formulário virou um WIZARD DE ETAPAS com
// indicador de progresso, em vez de um scroll único e longo (péssimo no
// touch). Os campos são exatamente os mesmos de antes — só reagrupados em
// passos (Identificação / Datas e previsão / Status e carga / Fluxo
// operacional / Itens). O passo "Fluxo operacional" só aparece quando há
// algo a mostrar (os fluxos pós-atracação/pós-chegada - F17.2b: as
// anuências saíram daqui, ver "Status e carga"/`LicensesEditor`). Os chips
// de passo são clicáveis (pular direto — útil no edit), e o botão Salvar
// fica sempre disponível (não prende o usuário no
// fim do wizard). O estado do passo é interno; o page não precisa saber.
export default function ProcessForm({
  viewMode,
  draft,
  isSaving,
  isImportingItems,
  canShowMaritimeFlow,
  canShowAirFlow,
  itemsFileInputRef,
  channelOptions,
  collectionStatusOptions,
  dtaStatusOptions,
  processCategoryOptions,
  onDraftChange,
  onSetViewModeList,
  onSave,
  onImportItemsFile,
  onAddItem,
  onItemChange,
  onRemoveItem,
  onClickCapture,
}) {
  const formatDate = (value) => {
    if (!value) return '-'
    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
  }

  // Previsão de entrega no armazém: automática (ETA + dias úteis por
  // categoria / coleta / rolling customs) e a "aplicada" (override manual
  // vence). Usa getEstimatedDeliveryDate/getAutomatic... — não repetir só
  // o ETA (era a regressão do F10 que ainda vivia aqui).
  const getAutomaticEstimatedDeliveryLabel = (process) =>
    formatDate(getAutomaticEstimatedDeliveryDate(process))
  const getEstimatedDeliveryLabel = (process) => formatDate(getEstimatedDeliveryDate(process))

  const keepsCollectionSchedule = (status) => {
    const normalizedStatus = normalizeComparableText(status)
    return (
      normalizedStatus === 'coleta agendada' ||
      normalizedStatus === 'veiculo no cd para descarga' ||
      postCollectionStatusOptions.some(
        (item) => normalizeComparableText(item) === normalizedStatus
      ) ||
      normalizedStatus === 'carga a caminho do cd' ||
      normalizedStatus === 'carga recebida'
    )
  }

  const shouldEditCollectionSchedule = (status) =>
    status === 'Coleta Agendada' || normalizeComparableText(status) === 'carga a caminho do cd'

  const isCdEnRouteStatusForFilter = (value) =>
    normalizeComparableText(value) === 'carga a caminho do cd'

  const canUsePostCollectionStatuses = (process) =>
    Boolean(getCollectionWindows(process).length && keepsCollectionSchedule(process?.collectionStatus))

  const getCollectionStatusOptions = (process) => {
    if (canUsePostCollectionStatuses(process)) return collectionStatusOptions
    return collectionStatusOptions.filter(
      (item) =>
        !postCollectionStatusOptions.includes(item) &&
        normalizeComparableText(item) !== 'carga a caminho do cd'
    )
  }

  // ---- Conteúdo de cada passo (JSX idêntico ao form antigo, reagrupado) ----

  const renderIdentificationStep = () => (
    <>
      <label className="field">
        <span>Nome do processo</span>
        <input
          className="text-input"
          type="text"
          value={draft.name}
          onChange={(event) => onDraftChange('name', event.target.value)}
          placeholder="Ex.: Importação Atlas"
        />
      </label>

      <div className="detail-card detail-card--split">
        <label className="field">
          <span>Categoria</span>
          <SelectField
            className="text-input"
            value={draft.category}
            onChange={(event) => onDraftChange('category', event.target.value)}
          >
            {processCategoryOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </SelectField>
        </label>
        <label className="field">
          <span>Destino</span>
          <input
            className="text-input"
            type="text"
            value={draft.destination}
            onChange={(event) => onDraftChange('destination', event.target.value)}
            placeholder="Porto ou aeroporto de destino"
          />
        </label>
      </div>

      {draft.category !== 'CONSOLIDADO' ? (
        <label className="field">
          <span>Código do processo</span>
          <input
            className="text-input"
            type="text"
            value={draft.processNumber}
            onChange={(event) => onDraftChange('processNumber', event.target.value)}
            placeholder="Número do processo"
          />
        </label>
      ) : (
        <PurchaseOrdersEditor
          value={draft.purchaseOrders}
          onChange={(value) => onDraftChange('purchaseOrders', value)}
          disabled={isSaving}
        />
      )}

      <div className="detail-card detail-card--split">
        {draft.category !== 'CONSOLIDADO' ? (
          <label className="field">
            <span>Fornecedor</span>
            <input
              className="text-input"
              type="text"
              value={draft.supplierName}
              onChange={(event) => onDraftChange('supplierName', event.target.value)}
            />
          </label>
        ) : null}
        <label className="field">
          <span>Origem</span>
          <input
            className="text-input"
            type="text"
            value={draft.originLocation}
            onChange={(event) => onDraftChange('originLocation', event.target.value)}
          />
        </label>
      </div>

      <div className="detail-card detail-card--split">
        <label className="field">
          <span>Incoterm</span>
          <SelectField
            className="text-input"
            value={draft.incoterm}
            onChange={(event) => onDraftChange('incoterm', event.target.value)}
          >
            <option value="">Selecione o Incoterm</option>
            {INCOTERM_OPTIONS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </SelectField>
        </label>
        <label className="field">
          <span>Agente de carga</span>
          <input
            className="text-input"
            type="text"
            value={draft.forwarderName}
            onChange={(event) => onDraftChange('forwarderName', event.target.value)}
          />
        </label>
      </div>
    </>
  )

  // F17.2d-1 (D-1/D-2, Q5): "Embarque confirmado" - SEM campo novo, deriva
  // de `hasText(shippedAt)`. Marcar/desmarcar copia/zera `shippedAt` a
  // partir do ETD (`shipmentConfirmation.js`).
  const renderDatesStep = () => (
    <>
      <div className="detail-card detail-card--split">
        <div className="field">
          <label className="field">
            <span>ETD</span>
            <input
              className="text-input"
              type="date"
              value={draft.etd}
              onChange={(event) => onDraftChange('etd', event.target.value)}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={isShipmentConfirmed(draft)}
              disabled={!draft.etd && !isShipmentConfirmed(draft)}
              onChange={(event) => onDraftChange('shipmentConfirmed', event.target.checked)}
            />
            <span>Embarque confirmado</span>
          </label>
          {!draft.etd && !isShipmentConfirmed(draft) ? (
            <small className="field-hint">Informe o ETD para confirmar o embarque.</small>
          ) : null}
          {isFutureShipment(draft) ? (
            <small className="field-hint">
              <span className="inline-badge inline-badge--warn">
                Embarque confirmado com ETD no futuro.
              </span>
            </small>
          ) : null}
          {hasShipmentDateDivergence(draft) ? (
            <small className="field-hint">
              Embarque registrado em {formatDate(draft.shippedAt)} (diferente do ETD).{' '}
              <button
                type="button"
                className="ghost-button"
                onClick={() => onDraftChange('etd', draft.shippedAt)}
              >
                Usar esta data como ETD
              </button>
            </small>
          ) : null}
        </div>
        <label className="field">
          <span>ETA</span>
          <input
            className="text-input"
            type="date"
            value={draft.eta}
            onChange={(event) => onDraftChange('eta', event.target.value)}
          />
        </label>
      </div>

      <div className="detail-card detail-card--split">
        <div>
          <span className="detail-label">Previsão automática no armazém</span>
          <p>{getAutomaticEstimatedDeliveryLabel(draft)}</p>
        </div>
        <div>
          <span className="detail-label">Previsão aplicada</span>
          <p>{getEstimatedDeliveryLabel(draft)}</p>
        </div>
      </div>

      <label className="field">
        <span>Previsão manual de entrega no armazém</span>
        <input
          className="text-input"
          type="date"
          value={draft.warehouseDeliveryDateOverride}
          onChange={(event) =>
            onDraftChange('warehouseDeliveryDateOverride', event.target.value)
          }
        />
        <small className="field-hint">
          Campo opcional. Se vazio, o sistema usa a previsão automática.
        </small>
      </label>
      {draft.warehouseDeliveryDateOverride ? (
        <div className="action-row">
          <button
            type="button"
            className="ghost-button"
            onClick={() => onDraftChange('warehouseDeliveryDateOverride', '')}
          >
            Remover previsão manual
          </button>
        </div>
      ) : null}

      {viewMode === 'edit' && draft.etaOriginal ? (
        <div className="detail-card">
          <span className="detail-label">ETA original</span>
          <p>{formatDate(draft.etaOriginal)}</p>
        </div>
      ) : null}
    </>
  )

  // F17.2a (D-3): status derivado - o select manual pre-chegada acabou.
  // `shippedAt` (passo "Embarque e trânsito") e' quem faz o status avancar
  // a partir de "Aguardando Embarque".
  const derivedProcessStatus = deriveProcessStatus(draft)

  const renderStatusStep = () => (
    <>
      <div className="detail-card detail-card--soft">
        <span className="detail-label">Status do processo (automático)</span>
        <span className={getStatusTagClass(derivedProcessStatus)}>
          {getDisplayedProcessStatus(derivedProcessStatus, draft.category)}
        </span>
        <small className="field-hint">
          Marque "Embarque confirmado" no passo Datas e previsão para o status avançar.
        </small>
      </div>

      <ProcessCargoFields draft={draft} onDraftChange={onDraftChange} disabled={isSaving} />

      <LicensesEditor
        value={draft.licenses}
        onChange={(value) => onDraftChange('licenses', value)}
        disabled={isSaving}
      />

      <label className="field">
        <span>Quantidade de pallets</span>
        <input
          className="text-input"
          type="number"
          min="0"
          value={draft.palletQuantity}
          onChange={(event) => onDraftChange('palletQuantity', event.target.value)}
        />
      </label>

      <label className="field">
        <span>Observações do processo</span>
        <textarea
          className="text-input text-area"
          value={draft.processNotes}
          onChange={(event) => onDraftChange('processNotes', event.target.value)}
          placeholder="Informações operacionais relevantes do processo."
        />
      </label>
    </>
  )

  const renderTransitStep = () => (
    <ProcessTransitFields draft={draft} onDraftChange={onDraftChange} />
  )

  // F17.3a (D-10): "Chegada" (atracacao/chegada com data, CE/terminal/free
  // time, presenca de carga) extraida pra `ProcessArrivalFields`; DUIMP/
  // canal/desembaraco extraidos pra `ProcessCustomsFields` (JSX movido, sem
  // mudanca de comportamento). Bloco de coleta ficava DUPLICADO
  // (maritimo/aereo) - agora aparece uma unica vez.
  const renderFlowStep = () => (
    <>
      {canShowMaritimeFlow || canShowAirFlow ? (
        <ProcessArrivalFields
          draft={draft}
          onDraftChange={onDraftChange}
          dtaStatusOptions={dtaStatusOptions}
        />
      ) : null}

      {(canShowMaritimeFlow || canShowAirFlow) && hasCargoPresenceSignal(draft) ? (
        <ProcessCustomsFields
          draft={draft}
          onDraftChange={onDraftChange}
          channelOptions={channelOptions}
        />
      ) : null}

      {(canShowMaritimeFlow || canShowAirFlow) && isCollectionReleased(draft) ? (
        <label className="field">
          <span>Coleta</span>
          <SelectField
            className="text-input"
            value={draft.collectionStatus}
            onChange={(event) => onDraftChange('collectionStatus', event.target.value)}
          >
            <option value="">Selecione o status</option>
            {getCollectionStatusOptions(draft).map((item) => (
              <option key={item} value={item}>{getDisplayedCollectionStatus(item)}</option>
            ))}
          </SelectField>
        </label>
      ) : null}
      {(canShowMaritimeFlow || canShowAirFlow) &&
      (shouldEditCollectionSchedule(draft.collectionStatus) || isCdEnRouteStatusForFilter(draft.collectionStatus)) ? (
        <CollectionWindowsEditor
          value={draft.collectionWindows}
          category={draft.category}
          containers={draft.containers}
          onChange={(nextWindows) => onDraftChange('collectionWindows', nextWindows)}
          disabled={isSaving}
        />
      ) : null}
      {(canShowMaritimeFlow || canShowAirFlow) &&
      draft.collectionStatus &&
      keepsCollectionSchedule(draft.collectionStatus) &&
      !shouldEditCollectionSchedule(draft.collectionStatus) ? (
        <div className="detail-card">
          <span className="detail-label">Coleta</span>
          <p>{getDisplayedCollectionStatus(draft.collectionStatus)}</p>
        </div>
      ) : null}

      {isCollectionScheduledOrBeyondStatus(draft.collectionStatus) ? (
        <div className="detail-card">
          <label className="field">
            <span>Transportadora</span>
            <input
              className="text-input"
              type="text"
              value={draft.carrierName}
              onChange={(event) => onDraftChange('carrierName', event.target.value)}
            />
          </label>
        </div>
      ) : null}

      {FREE_TIME_CATEGORIES.includes(draft.category) &&
      derivedProcessStatus === 'Carga recebida' &&
      (draft.containers ?? []).length > 0 ? (
        <EmptyReturnFields
          containers={draft.containers}
          onChange={(value) => onDraftChange('containers', value)}
          disabled={isSaving}
        />
      ) : null}
    </>
  )

  const consolidatedPurchaseOrders = getPurchaseOrderNumbers(getProcessPurchaseOrders(draft))

  const renderItemsStep = () => (
    <div className="detail-card">
      <div className="card-heading process-detail-card-heading">
        <div>
          <span className="detail-label">Itens do processo</span>
          <p>Nome comercial e quantidade vinculados ao processo. A importação aceita planilhas Excel com colunas de nome e quantidade.</p>
        </div>
        <div className="admin-toolbar">
          <input
            ref={itemsFileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onImportItemsFile}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="ghost-button"
            onClick={() => itemsFileInputRef.current?.click()}
            disabled={isImportingItems}
          >
            {isImportingItems ? 'Importando planilha...' : 'Importar planilha'}
          </button>
          <button type="button" className="ghost-button" onClick={onAddItem}>Adicionar item</button>
        </div>
      </div>

      <div className="process-items-editor">
        {(draft.items ?? []).map((item) => (
          <div key={item.id} className="detail-card detail-card--split">
            <label className="field">
              <span>Nome comercial</span>
              <input
                className="text-input"
                type="text"
                value={item.commercialName}
                onChange={(event) => onItemChange(item.id, 'commercialName', event.target.value)}
                placeholder="Ex.: Resina Atlas"
              />
            </label>
            <div className="process-item-editor__actions">
              <label className="field">
                <span>Quantidade</span>
                <input
                  className="text-input"
                  type="number"
                  min="0"
                  value={item.quantity}
                  onChange={(event) => onItemChange(item.id, 'quantity', event.target.value)}
                />
              </label>
              <button type="button" className="ghost-button" onClick={() => onRemoveItem(item.id)}>
                Remover item
              </button>
            </div>
            {draft.category === 'CONSOLIDADO' ? (
              <label className="field">
                <span>PO</span>
                {consolidatedPurchaseOrders.length > 0 ? (
                  <SelectField
                    className="text-input"
                    value={item.poNumber ?? ''}
                    onChange={(event) => onItemChange(item.id, 'poNumber', event.target.value)}
                  >
                    <option value="">Selecione a PO</option>
                    {consolidatedPurchaseOrders.map((po) => (
                      <option key={po} value={po}>{po}</option>
                    ))}
                  </SelectField>
                ) : (
                  <small className="field-hint">Cadastre as POs no passo Identificação.</small>
                )}
              </label>
            ) : null}
            <ProcessItemDangerousGoodsFields
              item={item}
              onChange={(field, value) => onItemChange(item.id, field, value)}
            />
          </div>
        ))}
      </div>
    </div>
  )

  // O passo "Fluxo operacional" só existe quando há conteúdo condicional a
  // mostrar (senão o passo ficaria vazio).
  const showFlowStep =
    (viewMode === 'edit' && isMaritimeCategory(draft.category)) ||
    canShowMaritimeFlow ||
    canShowAirFlow

  const steps = [
    { key: 'ident', label: 'Identificação', render: renderIdentificationStep },
    { key: 'dates', label: 'Datas e previsão', render: renderDatesStep },
    { key: 'status', label: 'Status e carga', render: renderStatusStep },
    { key: 'transit', label: 'Embarque e trânsito', render: renderTransitStep },
    ...(showFlowStep ? [{ key: 'flow', label: 'Fluxo operacional', render: renderFlowStep }] : []),
    { key: 'items', label: 'Itens', render: renderItemsStep },
  ]

  const [step, setStep] = useState(0)

  // Reabrir o form (criar/editar outro processo) reinicia no primeiro passo.
  useEffect(() => {
    setStep(0)
  }, [viewMode, draft?.id])

  // Se a lista de passos encurtar (ex.: trocar categoria remove o passo de
  // fluxo), mantém o índice dentro dos limites.
  const currentStep = Math.min(step, steps.length - 1)
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === steps.length - 1

  // F15.3: swipe-back (borda esquerda) volta um passo do wizard; no primeiro
  // passo sai pra lista — espelha o botão "Voltar". Touch-only.
  useSwipe({
    onSwipeRight: () =>
      isFirstStep ? onSetViewModeList() : setStep(Math.max(currentStep - 1, 0)),
  })

  return (
    <article className="list-card view-push" style={{ marginTop: '16px' }}>
      <div className="card-heading">
        <div>
          <h3>{viewMode === 'create' ? 'Criar processo' : 'Editar processo'}</h3>
        </div>
        <div className="admin-toolbar">
          <span className="inline-badge">{draft.category || 'Sem categoria'}</span>
          <button type="button" className="ghost-button" onClick={onSetViewModeList}>
            Voltar para lista
          </button>
        </div>
      </div>

      <div className="wizard-header">
        <div className="wizard-progress" aria-hidden="true">
          <div
            className="wizard-progress__bar"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
        <p className="wizard-progress__label">
          Passo {currentStep + 1} de {steps.length}: <strong>{steps[currentStep].label}</strong>
        </p>

        <div className="tab-row wizard-steps" aria-label="Etapas do cadastro">
          {steps.map((stepDef, index) => (
            <button
              key={stepDef.key}
              type="button"
              aria-current={index === currentStep ? 'step' : undefined}
              className={`tab-button${index === currentStep ? ' tab-button--active' : ''}`}
              onClick={() => setStep(index)}
            >
              {stepDef.label}
            </button>
          ))}
        </div>
      </div>

      <div className="detail-stack wizard-panel" onClickCapture={onClickCapture}>
        {steps[currentStep].render()}
      </div>

      <div className="wizard-nav">
        <button
          type="button"
          className="ghost-button"
          onClick={() => setStep(Math.max(currentStep - 1, 0))}
          disabled={isFirstStep}
        >
          Voltar
        </button>
        {!isLastStep ? (
          <button
            type="button"
            className="ghost-button"
            onClick={() => setStep(Math.min(currentStep + 1, steps.length - 1))}
          >
            Avançar
          </button>
        ) : null}
        <button type="button" className="primary-button" onClick={onSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Spinner size={14} label="Salvando" /> Salvando...
            </>
          ) : viewMode === 'create' ? (
            'Criar processo'
          ) : (
            'Salvar alterações'
          )}
        </button>
      </div>
    </article>
  )
}
