import { useEffect, useRef, useState } from 'react'
import { useSwipe } from '../../hooks/useSwipe'
import Spinner from '../../components/Spinner'
import SelectField from '../../components/SelectField'
import Icon from '../../components/Icon'
import CollectionWindowsEditor from './CollectionWindowsEditor'
import {
  getDisplayedCollectionStatus,
  getDisplayedProcessStatus,
  isCollectionScheduledOrBeyondStatus,
  postCollectionStatusOptions,
  normalizeComparableText,
} from './processStatus'
import { getStatusTagClass } from './processStatusView'
import { deriveProcessStatus, isCollectionReleased } from './deriveProcessStatus'
import { hasCargoPresenceSignal, FREE_TIME_CATEGORIES } from './arrivalCustoms'
import EmptyReturnFields from './EmptyReturnFields'
import { getAutomaticEstimatedDeliveryDate } from '../../utils/deliveryForecast'
import { getCollectionWindows } from '../../utils/collectionWindows'
import { INCOTERM_OPTIONS } from './operationalOptions'
import { getProcessFieldDomId, getProcessFieldStep } from './processDraftValidation'
import { getFieldA11yProps, getFieldErrorId, focusField } from '../../utils/fieldErrors'
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
// passos.
//
// UX-6b-1: 6 PASSOS FIXOS (Identificação / Embarque / Carga / Chegada e
// liberação / Coleta / Itens), na mesma ordem em create e em edit — a
// numeração não muda mais entre modais (o antigo passo "Fluxo operacional"
// condicional saiu). O cabeçalho ganhou o badge de status derivado (mesma
// fonte de sempre: `deriveProcessStatus`/`getStatusTagClass`/
// `getDisplayedProcessStatus`). Os campos continuam os mesmos — só
// reagrupados/reordenados; nenhuma condição de exibição mudou.
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
  fieldErrors = {},
  focusRequest = null,
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

      <div className="form-grid form-grid--3">
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
        ) : null}
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

      <div className="form-grid">
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

      <label className="field">
        <span>Incoterm</span>
        <SelectField
          className="text-input"
          value={draft.incoterm}
          onChange={(event) => onDraftChange('incoterm', event.target.value)}
          {...getFieldA11yProps('process-field-incoterm', fieldErrors.incoterm)}
        >
          <option value="">Selecione o Incoterm</option>
          {INCOTERM_OPTIONS.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </SelectField>
        {fieldErrors.incoterm ? (
          <small className="field-error" id={getFieldErrorId('process-field-incoterm')} aria-hidden="true">
            {fieldErrors.incoterm}
          </small>
        ) : null}
      </label>

      {draft.category === 'CONSOLIDADO' ? (
        <PurchaseOrdersEditor
          value={draft.purchaseOrders}
          onChange={(value) => onDraftChange('purchaseOrders', value)}
          disabled={isSaving}
          errors={fieldErrors}
        />
      ) : null}
    </>
  )

  // F17.2d-1 (D-1/D-2, Q5): "Embarque confirmado" - SEM campo novo, deriva
  // de `hasText(shippedAt)`. Marcar/desmarcar copia/zera `shippedAt` a
  // partir do ETD (`shipmentConfirmation.js`).
  const renderShipmentStep = () => (
    <>
      <div className="form-group">
        <h4 className="form-group__title">Datas</h4>
        <div className="form-grid">
          <div className="field">
            <label className="field">
              <span>ETD</span>
              <input
                className="text-input"
                type="date"
                value={draft.etd}
                onChange={(event) => onDraftChange('etd', event.target.value)}
                {...getFieldA11yProps('process-field-etd', fieldErrors.etd)}
              />
              {fieldErrors.etd ? (
                <small className="field-error" id={getFieldErrorId('process-field-etd')} aria-hidden="true">
                  {fieldErrors.etd}
                </small>
              ) : null}
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
          <div className="field">
            <label className="field">
              <span>ETA</span>
              <input
                className="text-input"
                type="date"
                value={draft.eta}
                onChange={(event) => onDraftChange('eta', event.target.value)}
                {...getFieldA11yProps('process-field-eta', fieldErrors.eta)}
              />
              {fieldErrors.eta ? (
                <small className="field-error" id={getFieldErrorId('process-field-eta')} aria-hidden="true">
                  {fieldErrors.eta}
                </small>
              ) : null}
            </label>
            {viewMode === 'edit' && draft.etaOriginal ? (
              <small className="field-hint">ETA original: {formatDate(draft.etaOriginal)}</small>
            ) : null}
          </div>
        </div>
      </div>

      <ProcessTransitFields draft={draft} onDraftChange={onDraftChange} errors={fieldErrors} />
    </>
  )

  // F17.2a (D-3): status derivado - o select manual pre-chegada acabou.
  // `shippedAt` (passo "Embarque") e' quem faz o status avancar a partir de
  // "Aguardando Embarque".
  const derivedProcessStatus = deriveProcessStatus(draft)

  const renderCargoStep = () => (
    <>
      <ProcessCargoFields
        draft={draft}
        onDraftChange={onDraftChange}
        disabled={isSaving}
        errors={fieldErrors}
      />

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

  // D4: previsao manual de entrega no armazem - os 2 cards de leitura viram
  // o hint "Opcional. Vazio = previsão automática (dd/mm/aaaa)." (a data
  // aplicada e' o proprio valor do input quando preenchido).
  const renderManualForecastField = () => (
    <>
      <label className="field">
        <span>Previsão manual de entrega no armazém</span>
        <input
          className="text-input"
          type="date"
          value={draft.warehouseDeliveryDateOverride}
          onChange={(event) =>
            onDraftChange('warehouseDeliveryDateOverride', event.target.value)
          }
          {...getFieldA11yProps(
            'process-field-warehouseDeliveryDateOverride',
            fieldErrors.warehouseDeliveryDateOverride
          )}
        />
        {fieldErrors.warehouseDeliveryDateOverride ? (
          <small
            className="field-error"
            id={getFieldErrorId('process-field-warehouseDeliveryDateOverride')}
            aria-hidden="true"
          >
            {fieldErrors.warehouseDeliveryDateOverride}
          </small>
        ) : null}
        <small className="field-hint">
          {`Opcional. Vazio = previsão automática (${getAutomaticEstimatedDeliveryLabel(draft)}).`}
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
    </>
  )

  // F17.3a (D-10): "Chegada" (atracacao/chegada com data, CE/terminal/free
  // time, presenca de carga) extraida pra `ProcessArrivalFields`; DUIMP/
  // canal/desembaraco extraidos pra `ProcessCustomsFields`; anuencias
  // (`LicensesEditor`) tambem vivem aqui (D1: `licenses` -> passo `arrival`).
  const renderArrivalStep = () => (
    <>
      {canShowMaritimeFlow || canShowAirFlow ? (
        <ProcessArrivalFields
          draft={draft}
          onDraftChange={onDraftChange}
          dtaStatusOptions={dtaStatusOptions}
          errors={fieldErrors}
          extraField={renderManualForecastField()}
        />
      ) : (
        <div className="form-group">
          <h4 className="form-group__title">Previsão de entrega</h4>
          {renderManualForecastField()}
        </div>
      )}

      {(canShowMaritimeFlow || canShowAirFlow) && hasCargoPresenceSignal(draft) ? (
        <ProcessCustomsFields
          draft={draft}
          onDraftChange={onDraftChange}
          channelOptions={channelOptions}
          errors={fieldErrors}
        />
      ) : null}

      <div className="form-group">
        <h4 className="form-group__title">Anuências</h4>
        <LicensesEditor
          value={draft.licenses}
          onChange={(value) => onDraftChange('licenses', value)}
          disabled={isSaving}
          errors={fieldErrors}
        />
      </div>
    </>
  )

  const canShowFlow = canShowMaritimeFlow || canShowAirFlow
  const showCollectionSelect = canShowFlow && isCollectionReleased(draft)
  const showCollectionWindows =
    canShowFlow &&
    (shouldEditCollectionSchedule(draft.collectionStatus) ||
      isCdEnRouteStatusForFilter(draft.collectionStatus))
  const showCollectionReadOnly =
    canShowFlow &&
    Boolean(draft.collectionStatus) &&
    keepsCollectionSchedule(draft.collectionStatus) &&
    !shouldEditCollectionSchedule(draft.collectionStatus)
  const showCarrier = isCollectionScheduledOrBeyondStatus(draft.collectionStatus)
  const showEmptyReturn =
    FREE_TIME_CATEGORIES.includes(draft.category) &&
    derivedProcessStatus === 'Carga recebida' &&
    (draft.containers ?? []).length > 0
  const hasCollectionContent =
    showCollectionSelect || showCollectionWindows || showCollectionReadOnly || showCarrier || showEmptyReturn

  const renderCollectionStep = () => (
    <>
      {showCollectionSelect ? (
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
      {showCollectionWindows ? (
        <CollectionWindowsEditor
          value={draft.collectionWindows}
          category={draft.category}
          containers={draft.containers}
          onChange={(nextWindows) => onDraftChange('collectionWindows', nextWindows)}
          disabled={isSaving}
          errors={fieldErrors}
        />
      ) : null}
      {showCollectionReadOnly ? (
        <div className="detail-card">
          <span className="detail-label">Coleta</span>
          <p>{getDisplayedCollectionStatus(draft.collectionStatus)}</p>
        </div>
      ) : null}

      {showCarrier ? (
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

      {showEmptyReturn ? (
        <EmptyReturnFields
          containers={draft.containers}
          onChange={(value) => onDraftChange('containers', value)}
          disabled={isSaving}
          errors={fieldErrors}
        />
      ) : null}

      {!hasCollectionContent ? (
        <p className="field-hint">
          Os dados de coleta aparecem aqui depois da liberação da carga.
        </p>
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
                  {...getFieldA11yProps(
                    `process-field-items-${item.id}-quantity`,
                    fieldErrors[`items.${item.id}.quantity`]
                  )}
                />
                {fieldErrors[`items.${item.id}.quantity`] ? (
                  <small
                    className="field-error"
                    id={getFieldErrorId(`process-field-items-${item.id}-quantity`)}
                    aria-hidden="true"
                  >
                    {fieldErrors[`items.${item.id}.quantity`]}
                  </small>
                ) : null}
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

  // D1: 6 passos fixos - a numeração não muda entre create/edit.
  const steps = [
    { key: 'ident', label: 'Identificação', render: renderIdentificationStep },
    { key: 'shipment', label: 'Embarque', render: renderShipmentStep },
    { key: 'cargo', label: 'Carga', render: renderCargoStep },
    { key: 'arrival', label: 'Chegada e liberação', render: renderArrivalStep },
    { key: 'collection', label: 'Coleta', render: renderCollectionStep },
    { key: 'items', label: 'Itens', render: renderItemsStep },
  ]

  const [step, setStep] = useState(0)

  // Reabrir o form (criar/editar outro processo) reinicia no primeiro passo.
  useEffect(() => {
    setStep(0)
  }, [viewMode, draft?.id])

  const currentStep = Math.min(step, steps.length - 1)
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === steps.length - 1

  // UX-3b (D5): ao clicar em salvar com erro, o page manda `focusRequest`
  // (key do 1o campo invalido + nonce). Se o passo do campo ja' e' o atual
  // (ou o campo nao tem passo conhecido nos `steps`), foca direto - nao ha'
  // render pra esperar. Senao, muda de passo e guarda a key pendente - o
  // segundo efeito (depende de `currentStep`) foca DEPOIS que o passo novo
  // renderizou.
  const pendingFocusRef = useRef(null)

  useEffect(() => {
    if (!focusRequest?.nonce) return
    const targetStepKey = getProcessFieldStep(focusRequest.key)
    const stepIndex = steps.findIndex((stepDef) => stepDef.key === targetStepKey)

    if (stepIndex === -1 || stepIndex === currentStep) {
      focusField(getProcessFieldDomId(focusRequest.key), 'process-form-error-summary')
      return
    }

    // Guarda a key JUNTO com o indice do passo alvo - o efeito abaixo so'
    // executa o focusField quando `currentStep` alcancar esse indice (o
    // `setStep` so' aplica no PROXIMO render; focar no mesmo tick acharia o
    // passo antigo ainda renderizado e cairia erroneamente no resumo).
    pendingFocusRef.current = { key: focusRequest.key, stepIndex }
    setStep(stepIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.nonce])

  useEffect(() => {
    const pending = pendingFocusRef.current
    if (!pending || pending.stepIndex !== currentStep) return
    focusField(getProcessFieldDomId(pending.key), 'process-form-error-summary')
    pendingFocusRef.current = null
  }, [currentStep])

  const stepHasError = (stepKey) =>
    Object.keys(fieldErrors).some((key) => getProcessFieldStep(key) === stepKey)

  const errorCount = Object.keys(fieldErrors).length

  // F15.3: swipe-back (borda esquerda) volta um passo do wizard; no primeiro
  // passo sai pra lista — espelha o botão "Voltar". Touch-only.
  useSwipe({
    onSwipeRight: () =>
      isFirstStep ? onSetViewModeList() : setStep(Math.max(currentStep - 1, 0)),
  })

  // UX-6b-1 (D8): rola o chip ativo pro centro visivel da row, sem afetar o
  // scroll vertical da pagina (por isso NAO usa `scrollIntoView`). No jsdom
  // `scrollWidth`/`clientWidth` sao 0, entao o efeito vira no-op.
  const stepsRowRef = useRef(null)

  useEffect(() => {
    const row = stepsRowRef.current
    if (!row) return
    if (row.scrollWidth <= row.clientWidth) return

    const active = row.querySelector('[aria-current="step"]')
    if (!active) return

    row.scrollLeft = active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2
  }, [currentStep])

  return (
    <article className="list-card view-push process-form" style={{ marginTop: '16px' }}>
      <div className="card-heading process-form__header">
        <button
          type="button"
          className="ghost-button"
          onClick={onSetViewModeList}
          aria-label="Voltar para lista"
        >
          <Icon name="chevron-left" /> Voltar
        </button>
        <h3>{viewMode === 'create' ? 'Criar processo' : 'Editar processo'}</h3>
        <span className="inline-badge">{draft.category || 'Sem categoria'}</span>
        <span className={getStatusTagClass(derivedProcessStatus)}>
          {getDisplayedProcessStatus(derivedProcessStatus, draft.category)}
        </span>
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

        <div className="tab-row wizard-steps" aria-label="Etapas do cadastro" ref={stepsRowRef}>
          {steps.map((stepDef, index) => {
            const hasError = stepHasError(stepDef.key)
            return (
              <button
                key={stepDef.key}
                type="button"
                aria-current={index === currentStep ? 'step' : undefined}
                aria-label={hasError ? `${stepDef.label}, contém erro` : undefined}
                className={`tab-button${index === currentStep ? ' tab-button--active' : ''}`}
                onClick={() => setStep(index)}
              >
                <span className="wizard-step__num" aria-hidden="true">
                  {index < currentStep ? '✓' : index + 1}
                </span>
                {stepDef.label}
                {hasError ? <span className="wizard-step__error-dot" aria-hidden="true" /> : null}
              </button>
            )
          })}
        </div>
      </div>

      <div className="detail-stack wizard-panel" onClickCapture={onClickCapture}>
        {steps[currentStep].render()}
      </div>

      {errorCount > 0 ? (
        <p id="process-form-error-summary" className="field-error" role="alert" tabIndex={-1}>
          {errorCount === 1
            ? 'Corrija 1 campo destacado antes de salvar.'
            : `Corrija ${errorCount} campos destacados antes de salvar.`}
        </p>
      ) : null}

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
