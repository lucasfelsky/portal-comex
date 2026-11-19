import { useEffect, useMemo, useRef, useState } from 'react'
import Skeleton from '../../components/Skeleton'
import SelectField from '../../components/SelectField'
import FilterChip from '../../components/FilterChip'
import Icon from '../../components/Icon'
import Spinner from '../../components/Spinner'
import MobileHeroSlot from '../../components/MobileHeroSlot'
import { useSwipeReveal } from '../../hooks/useSwipeReveal'
import useActivationPop from '../../hooks/useActivationPop'
import { getProcessTitle, getProcessSubtitle } from './processLabels'
import { getStatusTagClass } from './processStatusView'
import {
  isProcessStatusFinalized,
  shouldHideProcessCardSchedule,
  shouldHideProcessStatusBadge,
} from './processStatus'
import { isAirCategory, isMaritimeCategory, shouldShowContainerQuantity } from './processCategories'
import { formatContainerCount, formatPalletCount } from '../../utils/cargoUnits'
import useMediaQuery from '../../hooks/useMediaQuery'
import ProcessListDesktop from './ProcessListDesktop'
import ProcessMobileCard from './ProcessMobileCard'
import ChegadasFilterSheet from './ChegadasFilterSheet'
import { getProcessStage, PROCESS_STAGES } from './processStage'
import {
  buildProcessAlerts,
  formatDate,
  getDestinationLabel,
  getEstimatedDeliveryLabel,
  hasUpdatedEta,
} from './processListShared'

// Refino F4b: >= 1041px a lista renderiza a arvore propria de Chegadas.dc.html
// (ProcessListDesktop); tablet e mobile seguem nesta arvore legada.
const DESKTOP_QUERY = '(min-width: 1041px)'

// Remake mobile (F4): chips de etapa (derivam de getProcessStage: <= 1 = Em
// transito, 2 = Atracacao, 3 = Liberacao; "Entrega" so' aparece em Todas) e as
// opcoes de "Etapa operacional" da folha de filtros (as mesmas do SelectField).
const STAGE_CHIPS = [
  { key: 'all', label: 'Todas' },
  { key: 'transit', label: 'Em trânsito' },
  { key: 'berth', label: 'Atracação' },
  { key: 'release', label: 'Liberação' },
]
const OPERATION_FILTER_OPTIONS = [
  'Pós-chegada pendente',
  'Aguardando presença de carga',
  'DTA em andamento',
  'DUIMP pendente',
  'Coleta pendente',
  'Coleta agendada',
]
const EMPTY_LIST_FILTERS = {
  searchTerm: '',
  categoryFilter: 'Todos',
  etaStartDate: '',
  etaEndDate: '',
  operationFilter: 'Todos',
}

function getStageGroup(process) {
  const { currentStage, isComplete } = getProcessStage(process)
  const stage = isComplete ? PROCESS_STAGES.length - 1 : currentStage
  if (stage <= 1) return 'transit'
  if (stage === 2) return 'berth'
  if (stage === 3) return 'release'
  return 'delivery'
}

function matchesModal(process, modal) {
  if (modal === 'all') return true
  return modal === 'air' ? isAirCategory(process.category) : isMaritimeCategory(process.category)
}

// F16.8: linha de processo com swipe-to-favoritar (mobile). Componente
// próprio (não uma função helper chamada em .map()) porque precisa de
// hook por linha (useSwipeReveal) — hooks só valem dentro de um
// componente de verdade. "Só uma linha aberta por vez" é controlado pelo
// pai (ProcessListView guarda qual item.id está com o swipe revelado).
function ProcessRow({
  item,
  index = 0,
  isAdmin,
  canSeeName,
  isSelected,
  isMobile,
  isSwipeOpen,
  onSwipeOpenChange,
  onSelectProcess,
  isFavorite,
  onToggleFavorite,
  onArchiveProcess,
  isArchivedRow = false,
}) {
  // Arquivado automatico (recebido ha 7+ dias) nao tem "Restaurar": a leitura o arquivaria de novo.
  const canArchive = isAdmin && typeof onArchiveProcess === 'function' && !item.autoArchived
  // Estrela de favorito: entra com mola (scale 0 -> 1) so ao ativar.
  const favoriteStarPop = useActivationPop(Boolean(isFavorite))
  const actionCount = (onToggleFavorite ? 1 : 0) + (canArchive ? 1 : 0)
  const swipe = useSwipeReveal({
    actionCount,
    isOpen: isSwipeOpen,
    onOpenChange: onSwipeOpenChange,
    disabled: !isMobile,
  })
  const hideSchedule = shouldHideProcessCardSchedule(item)
  // UX-6a (item 1, D7): ordem de severidade em buildProcessAlerts (D-E:
  // pendencias so aparecem pro admin). No mobile so' os 2 primeiros ficam
  // visiveis + "+N"; no desktop legado TODOS continuam visiveis (CSS-only via
  // .inline-badge--overflow/--more).
  const alerts = buildProcessAlerts(item, isAdmin)

  // Acoes do swipe so' ficam visiveis enquanto a linha esta aberta/arrastando
  // (evita 1px da cor da acao vazando na borda em repouso).
  const isRevealing = isSwipeOpen || swipe.isDragging || swipe.translateX !== 0

  // Acoes reveladas pelo swipe: as mesmas na linha (tablet/desktop) e no cartao
  // mobile do remake (ProcessMobileCard).
  const swipeActions = (
    <div className="process-swipe-row__actions" aria-hidden={!isSwipeOpen}>
      {onToggleFavorite ? (
        <button
          type="button"
          className="process-swipe-row__action process-swipe-row__action--favorite"
          tabIndex={isSwipeOpen ? 0 : -1}
          onClick={() => {
            onToggleFavorite(item.id)
            onSwipeOpenChange(false)
          }}
        >
          <Icon name={isFavorite ? 'star-filled' : 'star'} size={18} aria-hidden="true" />
          <span>{isFavorite ? 'Desfavoritar' : 'Favoritar'}</span>
        </button>
      ) : null}
      {canArchive ? (
        <button
          type="button"
          className={`process-swipe-row__action${isArchivedRow ? ' process-swipe-row__action--restore' : ' process-swipe-row__action--archive'}`}
          tabIndex={isSwipeOpen ? 0 : -1}
          onClick={() => {
            onArchiveProcess(item.id, !isArchivedRow)
            onSwipeOpenChange(false)
          }}
        >
          <Icon name={isArchivedRow ? 'restore' : 'archive'} size={18} aria-hidden="true" />
          <span>{isArchivedRow ? 'Restaurar' : 'Arquivar'}</span>
        </button>
      ) : null}
    </div>
  )

  // Remake mobile (<=720px): cartao em vez da linha cinza. Tablet e desktop
  // seguem com a linha abaixo, sem alteracao.
  if (isMobile) {
    return (
      <ProcessMobileCard
        item={item}
        index={index}
        canSeeName={canSeeName}
        isSelected={isSelected}
        isFavorite={isFavorite}
        isRevealing={isRevealing}
        isArchivedRow={isArchivedRow}
        hideSchedule={hideSchedule}
        alerts={alerts}
        swipe={swipe}
        swipeActions={swipeActions}
        favoriteStarPop={favoriteStarPop}
        onSelectProcess={onSelectProcess}
        onToggleFavorite={onToggleFavorite}
      />
    )
  }

  return (
    <div className={`process-swipe-row${isRevealing ? ' process-swipe-row--revealing' : ''}`}>
      {swipeActions}
      <div
        role="button"
        tabIndex={0}
        className={`process-item process-item--button process-swipe-row__content${isSelected ? ' process-item--selected' : ''}`}
        style={
          isMobile
            ? { transform: `translateX(${swipe.translateX}px)`, transition: swipe.isDragging ? 'none' : undefined }
            : undefined
        }
        onClick={swipe.guardClick(() => onSelectProcess(item.id))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            swipe.guardClick(() => onSelectProcess(item.id))()
          }
        }}
        {...swipe.handlers}
      >
        {/* F15.2: leading icon por categoria + resumo condensado +
            chevron — só aparecem no mobile (≤720px); no desktop o
            CSS os esconde e o layout atual permanece intacto. */}
        <span
          className={`process-item__leading${isAirCategory(item.category) ? ' process-item__leading--air' : ''}`}
          aria-hidden="true"
        >
          <Icon name={isAirCategory(item.category) ? 'plane' : 'ship'} size={20} />
        </span>
        <div className="process-item__main">
          <strong>{getProcessTitle(item, canSeeName)}</strong>
          {getProcessSubtitle(item, canSeeName) ? <p>{getProcessSubtitle(item, canSeeName)}</p> : null}
          <div className="process-item__line">{item.category}</div>
          <div className="process-item__line">
            {getDestinationLabel(item.category)}: {item.destination || '-'}
          </div>
          <div
            className={`process-item__summary${hasUpdatedEta(item) ? ' process-item__summary--eta-updated' : ''}`}
          >
            {[
              // dd/mm basta no resumo — o ano é ruído numa linha condensada
              hideSchedule || !item.eta ? null : `ETA ${formatDate(item.eta).slice(0, 5)}`,
              item.destination || null,
              shouldShowContainerQuantity(item.category) && item.containerQuantity > 0
                ? formatContainerCount(item.containerQuantity)
                : item.palletQuantity > 0
                  ? formatPalletCount(item.palletQuantity)
                  : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <div className="process-item__chips">
            {shouldHideProcessStatusBadge(item) ? null : (
              <span className={getStatusTagClass(item.processStatus)}>
                {item.processStatus}
              </span>
            )}
            {shouldShowContainerQuantity(item.category) && item.containerQuantity > 0 ? (
              <span className="inline-badge">
                {formatContainerCount(item.containerQuantity)}
              </span>
            ) : null}
            {item.palletQuantity > 0 ? (
              <span className="inline-badge">
                {formatPalletCount(item.palletQuantity)}
              </span>
            ) : null}
            {alerts.map((alert, index) => (
              <span
                key={`${alert.label}-${index}`}
                className={`inline-badge inline-badge--${alert.tone}${index >= 2 ? ' inline-badge--overflow' : ''}`}
              >
                {alert.label}
              </span>
            ))}
            {alerts.length > 2 ? (
              <span
                className="inline-badge inline-badge--more"
                title={`${alerts.length - 2} alerta(s) a mais`}
              >
                +{alerts.length - 2}
              </span>
            ) : null}
          </div>
        </div>
        <div className="process-item__aside">
          {!hideSchedule ? (
            <div className="process-item__meta">
              <span>ETD: {formatDate(item.etd)}</span>
              <span className={hasUpdatedEta(item) ? 'eta-meta-highlight' : ''}>
                ETA: {formatDate(item.eta)}
              </span>
              <span>Previsão de entrega: {getEstimatedDeliveryLabel(item)}</span>
            </div>
          ) : null}
          <div className="process-item__inline-actions" onClick={(e) => e.stopPropagation()}>
            {onToggleFavorite ? (
              <button
                type="button"
                className="action-icon-button"
                aria-label={isFavorite ? 'Desfavoritar processo' : 'Favoritar processo'}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleFavorite(item.id)
                }}
              >
                <Icon
                  name={isFavorite ? 'star-filled' : 'star'}
                  size={20}
                  className={favoriteStarPop ? 'favorite-star--pop' : undefined}
                />
              </button>
            ) : null}
            {canArchive ? (
              <button
                type="button"
                className="action-icon-button"
                aria-label={isArchivedRow ? 'Restaurar processo' : 'Arquivar processo'}
                onClick={(e) => {
                  e.stopPropagation()
                  onArchiveProcess(item.id, !isArchivedRow)
                }}
              >
                <Icon name={isArchivedRow ? 'restore' : 'archive'} size={20} />
              </button>
            ) : null}
          </div>
        </div>
        <span className="process-item__chevron" aria-hidden="true">
          <Icon name="chevron" size={18} />
        </span>
      </div>
    </div>
  )
}

// F10.6 (backlog 2026-07-12): tela de listagem de processos (viewMode
// 'list'), extraída do ProcessesPage. Presentacional — recebe a lista
// filtrada + os filtros + flags de loading/erro por props, e chama
// callbacks (`onSelectProcess`, `onSearchTermChange`, etc.). Todo o
// estado (filtros, selectedProcessId, isLoading) e os handlers continuam
// na página. É a tela de entrada do módulo de Chegadas. Zero mudança
// visual/comportamental.
export default function ProcessListView({
  rootClassName = '',
  filteredProcesses,
  totalCount,
  isLoading,
  isExporting,
  selectedProcessId,
  isAdmin,
  canViewArchivedProp = false,
  canSeeName,
  searchTerm,
  categoryFilter,
  etaStartDate,
  etaEndDate,
  operationFilter,
  hasActiveFilters,
  processCategoryOptions,
  onSearchTermChange,
  onCategoryFilterChange,
  onEtaStartDateChange,
  onEtaEndDateChange,
  onOperationFilterChange,
  onClearAllFilters,
  onSelectProcess,
  onExport,
  onReconcileErp,
  favoriteProcessIds,
  onToggleFavorite,
  archivedProcesses = [],
  onArchiveProcess,
  onNewProcess,
  // Remake mobile (F4): reaplica os filtros da pagina (categoria, ETA, etapa
  // operacional, busca) sobre os processos ativos com valores de RASCUNHO; so'
  // alimenta a contagem "Ver N processos" da folha. Sem ele a contagem usa a
  // lista ja filtrada.
  applyListFilters,
}) {
  // F16.8: swipe-to-favoritar — só uma linha revelada por vez.
  const [openSwipeId, setOpenSwipeId] = useState(null)

  // UX-4 (A7): painel de filtros inline no mobile — recolhido por padrão,
  // reaproveita o mesmo markup do painel desktop (sem duplicar filtros).
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false)
  const activeFilterCount =
    (categoryFilter !== 'Todos' ? 1 : 0) +
    (etaStartDate || etaEndDate ? 1 : 0) +
    (operationFilter !== 'Todos' ? 1 : 0)

  // UX-4 (A7): "Arquivados (n)" no desktop, admin-only — alternância no
  // toolbar (aria-pressed), não seção no fim da lista (a lista desktop é
  // `process-list--scroll`, uma seção no fim ficaria escondida atrás de
  // dezenas de linhas).
  const [showArchived, setShowArchived] = useState(false)
  // Ver a seção Arquivados: admin e logística (somente leitura); restaurar/arquivar
  // (`canManageArchived`) segue admin-only — sem `onArchiveProcess` as linhas não têm ação.
  const canManageArchived = isAdmin && typeof onArchiveProcess === 'function'
  const canViewArchived = canManageArchived || canViewArchivedProp
  const isShowingArchived = canViewArchived && showArchived && archivedProcesses.length > 0

  // F16.4: no mobile (≤720px) a tela de Chegadas ganha a linguagem do
  // protótipo — busca em pill, segmented Todos/Marítimo/Aéreo (filtro de
  // exibição client-side, além dos filtros do painel) e seções Em
  // andamento/Concluídos. No desktop o painel de filtros completo abaixo
  // segue intocados. */
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
  )
  // Refino F4b: arvore desktop (Chegadas.dc.html). Os dois breakpoints sao
  // excludentes no navegador; `!isMobile` so protege quando um teste forca
  // matchMedia = true para todas as consultas.
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [mobileCategory, setMobileCategory] = useState('all')
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)')
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const shownProcesses =
    mobileCategory === 'all'
      ? filteredProcesses
      : filteredProcesses.filter((process) =>
          mobileCategory === 'air'
            ? isAirCategory(process.category)
            : isMaritimeCategory(process.category)
        )
  const activeProcesses = shownProcesses.filter(
    (process) => !isProcessStatusFinalized(process.processStatus)
  )
  const doneProcesses = shownProcesses.filter((process) =>
    isProcessStatusFinalized(process.processStatus)
  )

  // Remake mobile (F4). Tudo client-side sobre o que a pagina ja entrega:
  // Ativas/Arquivadas (so' admin/logistica), chips de etapa, "Modal" e "Só
  // favoritos" (estes dois moram na folha de filtros). Os filtros de categoria,
  // ETA e etapa operacional continuam sendo os da pagina (props).
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [stageChip, setStageChip] = useState('all')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const filterButtonRef = useRef(null)
  const viewingArchived = isMobile && canViewArchived && showArchived
  const favoriteIdSet = useMemo(() => new Set(favoriteProcessIds ?? []), [favoriteProcessIds])
  const passesClientFilters = (process, modal, onlyFavorites) =>
    matchesModal(process, modal) && (!onlyFavorites || favoriteIdSet.has(process.id))

  // Base dos chips: processos da aba atual depois de TODOS os filtros menos o chip.
  const mobileBase = useMemo(() => {
    if (!isMobile) return []
    return (viewingArchived ? archivedProcesses : filteredProcesses).filter((process) =>
      passesClientFilters(process, mobileCategory, favoritesOnly)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- passesClientFilters depende so' do que esta na lista
  }, [isMobile, viewingArchived, archivedProcesses, filteredProcesses, mobileCategory, favoritesOnly, favoriteIdSet])
  const stageCounts = useMemo(() => {
    const counts = { all: mobileBase.length, transit: 0, berth: 0, release: 0 }
    mobileBase.forEach((process) => {
      const group = getStageGroup(process)
      if (group in counts) counts[group] += 1
    })
    return counts
  }, [mobileBase])
  const mobileShown = useMemo(
    () => (stageChip === 'all' ? mobileBase : mobileBase.filter((process) => getStageGroup(process) === stageChip)),
    [mobileBase, stageChip]
  )
  const mobileActive = mobileShown.filter((process) => !isProcessStatusFinalized(process.processStatus))
  const mobileDone = mobileShown.filter((process) => isProcessStatusFinalized(process.processStatus))
  // "N processos ativos" do hero: em andamento, sem arquivados e sem filtro nenhum.
  // `filteredProcesses` (muda a cada tecla da busca) so' entra nas deps quando nao
  // ha `applyListFilters`; com ele o total nao depende da busca e o filtro+sort
  // de todos os processos nao roda de novo por tecla.
  const heroFallbackPool = applyListFilters ? null : filteredProcesses
  const heroActiveCount = useMemo(() => {
    if (!isMobile) return 0
    const pool = applyListFilters ? applyListFilters(EMPTY_LIST_FILTERS) : heroFallbackPool
    return pool.filter((process) => !isProcessStatusFinalized(process.processStatus)).length
  }, [isMobile, applyListFilters, heroFallbackPool])
  // Em Arquivadas so' contam os filtros que valem la: Modal e "Só favoritos"
  // (categoria, ETA, etapa operacional e busca so' afetam as ativas).
  const mobileFilterCount =
    (viewingArchived ? 0 : activeFilterCount) +
    (mobileCategory !== 'all' ? 1 : 0) +
    (favoritesOnly ? 1 : 0)
  const hasMobileFilters =
    (!viewingArchived && hasActiveFilters) || mobileCategory !== 'all' || favoritesOnly || stageChip !== 'all'
  // A troca de chip/aba/filtro remonta os cartoes e a entrada escalonada roda de novo.
  const mobileListKey = [
    viewingArchived ? 'arq' : 'ativas',
    stageChip,
    mobileCategory,
    favoritesOnly,
    categoryFilter,
    operationFilter,
    etaStartDate,
    etaEndDate,
  ].join('|')

  // "Ver N": quantos cartoes a lista mostraria com os filtros em rascunho.
  const countForDraft = (draft) => {
    const pool = viewingArchived
      ? archivedProcesses
      : applyListFilters
        ? applyListFilters({
            searchTerm,
            categoryFilter: draft.category,
            etaStartDate: draft.etaStart,
            etaEndDate: draft.etaEnd,
            operationFilter: draft.operation,
          })
        : filteredProcesses
    return pool.filter(
      (process) =>
        passesClientFilters(process, draft.modal, draft.favoritesOnly) &&
        (stageChip === 'all' || getStageGroup(process) === stageChip)
    ).length
  }
  const applySheetFilters = (draft) => {
    if (draft.category !== categoryFilter) onCategoryFilterChange(draft.category)
    if (draft.etaStart !== etaStartDate) onEtaStartDateChange(draft.etaStart)
    if (draft.etaEnd !== etaEndDate) onEtaEndDateChange(draft.etaEnd)
    if (draft.operation !== operationFilter) onOperationFilterChange(draft.operation)
    setMobileCategory(draft.modal)
    setFavoritesOnly(draft.favoritesOnly)
  }
  const clearMobileFilters = () => {
    if (viewingArchived) {
      // Em Arquivadas limpa so' o que vale la e continua na aba (os filtros das
      // ativas, ocultos aqui, ficam como estao).
      setMobileCategory('all')
      setFavoritesOnly(false)
      setStageChip('all')
      return
    }
    onClearAllFilters()
    setMobileCategory('all')
    setFavoritesOnly(false)
    setStageChip('all')
    setShowArchived(false)
  }
  const closeSheet = () => {
    setIsSheetOpen(false)
    filterButtonRef.current?.focus()
  }

  const renderProcessRow = (item, index) => (
    <ProcessRow
      key={item.id}
      item={item}
      index={index}
      isAdmin={isAdmin}
      canSeeName={canSeeName}
      isSelected={selectedProcessId === item.id}
      isMobile={isMobile}
      isSwipeOpen={openSwipeId === item.id}
      onSwipeOpenChange={(open) => setOpenSwipeId(open ? item.id : null)}
      onSelectProcess={onSelectProcess}
      isFavorite={Boolean(favoriteProcessIds?.includes(item.id))}
      onToggleFavorite={onToggleFavorite}
      onArchiveProcess={onArchiveProcess}
    />
  )

  // F16.8: linhas da seção "Arquivados" (admin) — sem ação de favoritar,
  // só "Restaurar" (isArchivedRow inverte o alvo do onArchiveProcess).
  const renderArchivedRow = (item, index) => (
    <ProcessRow
      key={item.id}
      item={item}
      index={index}
      isAdmin={isAdmin}
      canSeeName={canSeeName}
      isSelected={selectedProcessId === item.id}
      isMobile={isMobile}
      isSwipeOpen={openSwipeId === item.id}
      onSwipeOpenChange={(open) => setOpenSwipeId(open ? item.id : null)}
      onSelectProcess={onSelectProcess}
      onArchiveProcess={onArchiveProcess}
      isArchivedRow
    />
  )

  // Estado vazio do mobile (mock: "Nada por aqui" + "Limpar filtros").
  const renderMobileEmpty = () => (
    <div className="m-empty" role="status">
      <span className="m-empty__big" aria-hidden="true">
        <Icon name="search" size={26} />
      </span>
      <strong>Nada por aqui</strong>
      <p>
        {hasMobileFilters
          ? viewingArchived
            ? 'Nenhum processo arquivado corresponde aos filtros atuais.'
            : 'Nenhum processo corresponde à busca e aos filtros atuais.'
          : viewingArchived
            ? 'Nenhum processo arquivado.'
            : isAdmin
              ? 'Cadastre um novo processo para ver as chegadas aqui.'
              : 'Ainda não há processos para exibir.'}
      </p>
      {hasMobileFilters ? (
        <button type="button" className="m-ghost" onClick={clearMobileFilters}>
          Limpar filtros
        </button>
      ) : null}
    </div>
  )

  if (isDesktop && !isMobile) {
    return (
      <ProcessListDesktop
        rootClassName={rootClassName}
        filteredProcesses={filteredProcesses}
        totalCount={totalCount}
        isLoading={isLoading}
        isExporting={isExporting}
        selectedProcessId={selectedProcessId}
        isAdmin={isAdmin}
        canSeeName={canSeeName}
        searchTerm={searchTerm}
        categoryFilter={categoryFilter}
        etaStartDate={etaStartDate}
        etaEndDate={etaEndDate}
        operationFilter={operationFilter}
        hasActiveFilters={hasActiveFilters}
        processCategoryOptions={processCategoryOptions}
        onSearchTermChange={onSearchTermChange}
        onCategoryFilterChange={onCategoryFilterChange}
        onEtaStartDateChange={onEtaStartDateChange}
        onEtaEndDateChange={onEtaEndDateChange}
        onOperationFilterChange={onOperationFilterChange}
        onClearAllFilters={onClearAllFilters}
        onSelectProcess={onSelectProcess}
        onExport={onExport}
        onReconcileErp={onReconcileErp}
        favoriteProcessIds={favoriteProcessIds}
        onToggleFavorite={onToggleFavorite}
        archivedProcesses={archivedProcesses}
        onArchiveProcess={onArchiveProcess}
        onNewProcess={onNewProcess}
        canViewArchived={canViewArchived}
        isShowingArchived={isShowingArchived}
        onToggleArchived={() => setShowArchived((v) => !v)}
      />
    )
  }

  return (
    <article
      className={`list-card process-list-card${rootClassName ? ` ${rootClassName}` : ''}`}
      style={{ marginTop: '8px' }}
    >
      {/* Remake mobile: "N processos ativos" + "Novo" moram no hero navy. */}
      {isMobile ? (
        <MobileHeroSlot>
          <div className="m-hero-row">
            <p className="m-hero-sub">
              {isLoading
                ? 'Carregando processos…'
                : `${heroActiveCount} ${heroActiveCount === 1 ? 'processo ativo' : 'processos ativos'}`}
            </p>
            {isAdmin && onNewProcess ? (
              <button
                type="button"
                className="m-btn-mint"
                title="Cadastrar um novo processo"
                aria-label="Novo processo"
                onClick={onNewProcess}
              >
                <Icon name="plus" size={16} strokeWidth={2.4} />
                Novo
              </button>
            ) : null}
          </div>
        </MobileHeroSlot>
      ) : null}
      <div
        className={`card-heading${isMobile && !(isAdmin && onReconcileErp) ? ' card-heading--m-empty' : ''}`}
      >
        <div>
          <h3>Chegadas</h3>
        </div>
        <div className="admin-toolbar">
          {isAdmin && onNewProcess && !isMobile ? (
            <button
              type="button"
              className="primary-button primary-button--compact"
              title="Cadastrar um novo processo"
              onClick={onNewProcess}
            >
              Novo processo
            </button>
          ) : null}
          <div className="secondary-row">
            {isAdmin && onReconcileErp ? (
              <button
                type="button"
                className="ghost-button ghost-button--secondary erp-reconcile-trigger"
                disabled={isLoading}
                title="Anexar a planilha do DBCorp: concilia com os processos e salva como referência do ERP"
                onClick={onReconcileErp}
              >
                Importar do DBCorp
              </button>
            ) : null}
            {/* Mobile: "Exportar N processos" mora no rodape da folha de filtros. */}
            {isMobile ? null : (
              <button
                type="button"
                className="ghost-button ghost-button--secondary"
                disabled={filteredProcesses.length === 0 || isExporting}
                title="Baixar as linhas visíveis (filtros aplicados) em Excel"
                onClick={onExport}
              >
                {isExporting ? <Spinner size={14} /> : <Icon name="download" size={16} />} Exportar ({filteredProcesses.length})
              </button>
            )}
            {canViewArchived && archivedProcesses.length > 0 ? (
              <button
                type="button"
                className="ghost-button process-list__archived-toggle"
                aria-pressed={isShowingArchived}
                onClick={() => setShowArchived((v) => !v)}
              >
                Arquivados ({archivedProcesses.length})
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* F16.4: busca pill + segmented — mobile-only (CSS). No desktop segue
          o painel de filtros completo abaixo. */}
      <div className="chegadas-mobilebar">
        {isMobile ? (
          <>
            <div className="m-fbar__row">
              <label className="chegadas-search">
                <Icon name="search" size={18} aria-hidden="true" />
                <input
                  type="search"
                  value={viewingArchived ? '' : searchTerm}
                  onChange={(event) => onSearchTermChange(event.target.value)}
                  placeholder={viewingArchived ? 'Buscar nas ativas' : 'Processo, PO, produto ou contêiner'}
                  aria-label="Buscar processo"
                  autoComplete="off"
                  disabled={viewingArchived}
                />
              </label>
              <button
                ref={filterButtonRef}
                type="button"
                className="m-fbtn"
                aria-label={mobileFilterCount > 0 ? `Filtros (${mobileFilterCount})` : 'Filtros'}
                aria-haspopup="dialog"
                aria-expanded={isSheetOpen}
                onClick={() => setIsSheetOpen(true)}
              >
                <Icon name="sliders" size={18} />
                {mobileFilterCount > 0 ? (
                  <span key={mobileFilterCount} className="m-fbtn__n" aria-hidden="true">
                    {mobileFilterCount}
                  </span>
                ) : null}
              </button>
            </div>
            {canViewArchived ? (
              <div className="chegadas-segmented" role="group" aria-label="Exibir processos">
                {[
                  { archived: false, label: 'Ativas' },
                  { archived: true, label: 'Arquivadas' },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={showArchived === option.archived}
                    className={`chegadas-segmented__item${showArchived === option.archived ? ' chegadas-segmented__item--on' : ''}`}
                    onClick={() => setShowArchived(option.archived)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="m-chips" role="group" aria-label="Etapa do processo">
              {STAGE_CHIPS.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className="m-chip"
                  aria-pressed={stageChip === chip.key}
                  aria-label={`${chip.label} (${stageCounts[chip.key]})`}
                  onClick={() => setStageChip(chip.key)}
                >
                  {chip.label}
                  <span className="m-chip__c" aria-hidden="true">
                    {stageCounts[chip.key]}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <label className="chegadas-search">
              <Icon name="search" size={16} aria-hidden="true" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => onSearchTermChange(event.target.value)}
                placeholder="Buscar processo, PO, produto, contêiner…"
                aria-label="Buscar processo"
              />
            </label>
            <div className="chegadas-mobilebar__row">
              <div className="chegadas-segmented" aria-label="Filtrar por modal">
                {[
                  { key: 'all', label: 'Todos' },
                  { key: 'sea', label: 'Marítimo' },
                  { key: 'air', label: 'Aéreo' },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={mobileCategory === option.key}
                    className={`chegadas-segmented__item${mobileCategory === option.key ? ' chegadas-segmented__item--on' : ''}`}
                    onClick={() => setMobileCategory(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="ghost-button chegadas-filters-toggle"
                aria-expanded={isFilterPanelOpen}
                aria-controls="chegadas-filters-panel"
                onClick={() => setIsFilterPanelOpen((v) => !v)}
              >
                {activeFilterCount > 0 ? `Filtros (${activeFilterCount})` : 'Filtros'}
              </button>
            </div>
          </>
        )}
      </div>

      {!isMobile ? (
        <>
          <div
            id="chegadas-filters-panel"
            className={`process-filters process-filters--panel${isFilterPanelOpen ? ' process-filters--panel--open' : ''}`}
          >
            <label className="field">
              <span>Buscar processo</span>
              <input
                className="text-input process-filters__search"
                type="text"
                value={searchTerm}
                onChange={(event) => onSearchTermChange(event.target.value)}
                placeholder="Nome, item, contêiner, destino, categoria, PO, ETA, ETD, status ou ID"
              />
            </label>
            <label className="field field--compact">
              <span>Categoria</span>
              <SelectField
                className="text-input"
                value={categoryFilter}
                onChange={(event) => onCategoryFilterChange(event.target.value)}
              >
                <option value="Todos">Todas</option>
                {processCategoryOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </SelectField>
            </label>
            <div className="field">
              <span>Período de ETA</span>
              <div className="process-date-range">
                <input
                  className="text-input"
                  type="date"
                  value={etaStartDate}
                  onChange={(event) => onEtaStartDateChange(event.target.value)}
                  aria-label="ETA de"
                />
                <input
                  className="text-input"
                  type="date"
                  value={etaEndDate}
                  min={etaStartDate || undefined}
                  onChange={(event) => onEtaEndDateChange(event.target.value)}
                  aria-label="ETA até"
                />
              </div>
            </div>
            <label className="field">
              <span>Etapa operacional</span>
              <SelectField
                className="text-input"
                value={operationFilter}
                onChange={(event) => onOperationFilterChange(event.target.value)}
              >
                <option value="Todos">Todas</option>
                <option value="Pós-chegada pendente">Pós-chegada pendente</option>
                <option value="Aguardando presença de carga">Aguardando presença de carga</option>
                <option value="DTA em andamento">DTA em andamento</option>
                <option value="DUIMP pendente">DUIMP pendente</option>
                <option value="Coleta pendente">Coleta pendente</option>
                <option value="Coleta agendada">Coleta agendada</option>
                {isAdmin ? <option value="Dados pendentes">Dados pendentes</option> : null}
              </SelectField>
            </label>
          </div>

          {hasActiveFilters ? (
            <div className="filter-chips-row" role="list" aria-label="Filtros ativos">
              <span className="filter-chips-row__label">Filtros:</span>
              {searchTerm ? (
                <FilterChip
                  label={`Busca: "${searchTerm}"`}
                  onRemove={() => onSearchTermChange('')}
                  variant="primary"
                />
              ) : null}
              {categoryFilter !== 'Todos' ? (
                <FilterChip
                  label={`Categoria: ${categoryFilter}`}
                  onRemove={() => onCategoryFilterChange('Todos')}
                />
              ) : null}
              {etaStartDate || etaEndDate ? (
                <FilterChip
                  label={`ETA: ${etaStartDate || 'inicio'} ate ${etaEndDate || 'fim'}`}
                  onRemove={() => {
                    onEtaStartDateChange('')
                    onEtaEndDateChange('')
                  }}
                  variant="info"
                />
              ) : null}
              {operationFilter !== 'Todos' ? (
                <FilterChip
                  label={`Etapa: ${operationFilter}`}
                  onRemove={() => onOperationFilterChange('Todos')}
                  variant="info"
                />
              ) : null}
              <button
                type="button"
                className="filter-chips-row__clear"
                onClick={onClearAllFilters}
              >
                Limpar todos
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {/* Quando o carregamento termina o conteudo entra por fade de 200 ms
          (classe skeleton-reveal; troca skeleton -> conteudo sem pulo). */}
      <div className={`process-list process-list--scroll${isLoading ? '' : ' skeleton-reveal'}`}>
        {isLoading ? (
          <>
            {/* Skeleton antigo: continua no tablet/mobile (CSS esconde no desktop). */}
            <div className="process-list-skeletons skeleton-legacy">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="process-item process-item--skeleton">
                  <div className="process-item__main">
                    <Skeleton variant="title" width="60%" />
                    <Skeleton variant="text" width="40%" />
                  </div>
                  <div className="process-item__meta">
                    <Skeleton variant="text" width="80px" height="22px" radius="999px" />
                    <Skeleton variant="text" width="100px" height="22px" radius="999px" />
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop: skeleton no formato real do card (Componentes.dc.html). */}
            <div className="process-list-skeletons process-list-skeletons--card" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="process-card-skeleton">
                  <Skeleton.ProcessCard />
                </div>
              ))}
            </div>
          </>
        ) : isMobile ? (
          mobileShown.length === 0 ? (
            renderMobileEmpty()
          ) : viewingArchived ? (
            <>
              <div className="process-list__section-label">Arquivados</div>
              <div className="process-list__group" key={mobileListKey}>
                {mobileShown.map(renderArchivedRow)}
              </div>
            </>
          ) : (
            // Mobile: eyebrows Em andamento / Concluídos acima dos cartoes.
            <>
              {mobileActive.length > 0 ? (
                <>
                  <div className="process-list__section-label">Em andamento</div>
                  <div className="process-list__group" key={`${mobileListKey}|a`}>
                    {mobileActive.map(renderProcessRow)}
                  </div>
                </>
              ) : null}
              {mobileDone.length > 0 ? (
                <>
                  <div className="process-list__section-label">Concluídos</div>
                  <div className="process-list__group" key={`${mobileListKey}|d`}>
                    {mobileDone.map(renderProcessRow)}
                  </div>
                </>
              ) : null}
            </>
          )
        ) : isShowingArchived ? (
          <>
            <div className="process-list__section-label">Arquivados</div>
            {archivedProcesses.map(renderArchivedRow)}
          </>
        ) : shownProcesses.length === 0 ? (
          <div className="empty-state" role="status">
            <Icon name="nav-arrivals" size={40} strokeWidth={1.5} className="empty-state__glyph" />
            <strong>Nenhum processo encontrado</strong>
            <p>
              {isAdmin
                ? 'Ajuste a busca ou cadastre um novo processo.'
                : 'Ajuste a busca ou os filtros aplicados.'}
            </p>
          </div>
        ) : (
          // Desktop: lista plana ordenada por ETA (inalterada).
          shownProcesses.map(renderProcessRow)
        )}
      </div>

      {isMobile && isSheetOpen ? (
        <ChegadasFilterSheet
          initialFilters={{
            category: categoryFilter,
            modal: mobileCategory,
            etaStart: etaStartDate,
            etaEnd: etaEndDate,
            operation: operationFilter,
            favoritesOnly,
          }}
          categoryOptions={processCategoryOptions}
          operationOptions={
            isAdmin ? [...OPERATION_FILTER_OPTIONS, 'Dados pendentes'] : OPERATION_FILTER_OPTIONS
          }
          countFor={countForDraft}
          archived={viewingArchived}
          exportCount={mobileShown.length}
          isExporting={isExporting}
          onExport={onExport ? () => onExport(mobileShown, { showProgress: true }) : undefined}
          onApply={applySheetFilters}
          onClose={closeSheet}
        />
      ) : null}
    </article>
  )
}