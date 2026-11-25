import { useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import Skeleton from '../components/Skeleton'
import CargoConferenceListView from '../features/processes/CargoConferenceListView'
import CargoConferenceScreen from '../features/processes/CargoConferenceScreen'
import { canOpenCargoReport } from '../features/processes/cargoReportFormModel'
import { canSeeProcessName } from '../features/processes/processNameAccess'
import { useCargoConferenceList } from '../features/processes/useCargoConferenceList'
import useAuth from '../hooks/useAuth'
import useMediaQuery from '../hooks/useMediaQuery'

// S9-F do Relatório de Carga: aba Conferência (celular), rota `/conferencia`. Só logística e admin (os demais papéis
// caem no início e nunca leem relatório); só no celular (<= 720 px): no computador aparece um aviso com "Ir para
// Chegadas". A largura é travada na entrada: girar o celular para paisagem no meio da conferência não desmonta a tela
// nem perde o que foi digitado. Sem `?processo=` mostra a lista; com `?processo=<id>` a conferência do processo (o
// "voltar" do aparelho volta à lista). O filtro e a busca da lista ficam aqui e sobrevivem a abrir e voltar.

export default function ConferencePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const isMobileNow = useMediaQuery('(max-width: 720px)')
  const [isMobileAtEntry] = useState(isMobileNow)
  const [filter, setFilter] = useState('pendentes')
  const [query, setQuery] = useState('')
  const [pinned, setPinned] = useState(null)
  const role = profile?.role
  const allowed = canOpenCargoReport(role)
  const processId = searchParams.get('processo')
  const list = useCargoConferenceList({ enabled: allowed && isMobileAtEntry })

  if (!allowed) return <Navigate to="/" replace />

  if (!isMobileAtEntry) {
    return (
      <div className="ccf-page">
        <EmptyState
          illustration="inbox"
          title="Conferência"
          message="A aba Conferência é só para o celular. No computador, confira em Chegadas › processo › Documentos › Relatório de Carga."
          action={
            <button type="button" className="secondary-button" onClick={() => navigate('/processos')}>
              Ir para Chegadas
            </button>
          }
        />
      </div>
    )
  }

  const canSeeName = canSeeProcessName(role)

  function openProcess(id) {
    navigate(`/conferencia?processo=${encodeURIComponent(id)}`, { state: { fromList: true } })
  }

  // Voltar do app: se veio da lista, volta no histórico (o voltar do aparelho fica coerente); senão troca a URL.
  function backToList() {
    if (location.state?.fromList) navigate(-1)
    else navigate('/conferencia', { replace: true })
  }

  if (!processId) {
    return (
      <div className="ccf-page">
        <CargoConferenceListView
          entries={list.entries}
          status={list.status}
          isAdmin={role === 'admin'}
          canSeeName={canSeeName}
          filter={filter}
          query={query}
          onFilterChange={setFilter}
          onQueryChange={setQuery}
          onRefresh={list.refresh}
          onRetryEntry={list.retryEntry}
          onOpen={openProcess}
        />
      </div>
    )
  }

  // Detalhe: o processo vem da lista carregada (cache) e fica fixo enquanto a tela está aberta.
  const found = list.entries.find((entry) => entry.processId === processId)?.process ?? null
  if (found && pinned?.id !== found.id) setPinned(found)
  const process = pinned?.id === processId ? pinned : found

  if (!process) {
    if (list.status === 'error') {
      return (
        <div className="ccf-page">
          <div className="error-banner error-banner--retry" role="alert">
            <span>Não foi possível carregar os processos.</span>
            <button type="button" className="secondary-button" onClick={list.refresh}>
              Tentar novamente
            </button>
          </div>
        </div>
      )
    }
    if (list.status === 'loading' || list.status === 'idle') {
      return (
        <div className="ccf-page">
          <div className="ccf-skeletons" role="status" aria-label="Carregando conferência">
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </div>
        </div>
      )
    }
    return (
      <div className="ccf-page">
        <EmptyState
          illustration="search"
          title="Conferência"
          message="Este processo não está na lista de conferência."
          action={
            <button type="button" className="secondary-button" onClick={() => navigate('/conferencia', { replace: true })}>
              Voltar à lista
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className={`ccf-page ccf-page--detail${isMobileNow ? ' ccf-page--nav' : ''}`}>
      <CargoConferenceScreen
        key={process.id}
        process={process}
        profile={profile}
        canSeeName={canSeeName}
        onBack={backToList}
      />
    </div>
  )
}
