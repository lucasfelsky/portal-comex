import { useEffect, useState } from 'react'
import Skeleton from '../../components/Skeleton'
import useAuth from '../../hooks/useAuth'
import {
  getCargoReportRecipients,
  saveCargoReportRecipients,
} from '../../services/cargoReportRecipientsRepository'
import { buildActionErrorMessage } from '../../utils/errorMessages'
import CargoReportRecipientListCard from './CargoReportRecipientListCard'
import ItemPackagingCatalogCard from './ItemPackagingCatalogCard'
import {
  CARGO_REPORT_RECIPIENT_LISTS,
  isValidCargoReportRecipientEmail,
} from './cargoReportRecipients'

const EMPTY_LISTS = { tecnico: [], faturamento: [] }

function areListsEqual(first, second) {
  return CARGO_REPORT_RECIPIENT_LISTS.every(({ key }) => {
    const a = first[key]
    const b = second[key]
    return a.length === b.length && a.every((email, index) => email === b[index])
  })
}

// Tela /admin/relatorio-carga: destinatários do aviso por e-mail quando um Relatório de Carga é
// anexado (`config/cargoReportRecipients`), mais a tabela mestra Item x Emb. (ItemPackagingCatalogCard).
export default function AdminCargoReportRecipientsPanel() {
  const { profile } = useAuth()
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saved, setSaved] = useState(EMPTY_LISTS)
  const [draft, setDraft] = useState(EMPTY_LISTS)
  const [meta, setMeta] = useState({ exists: true, ignoredNonCorporate: 0 })
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function loadRecipients() {
      setIsLoading(true)

      try {
        const loaded = await getCargoReportRecipients()

        if (!isMounted) return

        const lists = { tecnico: loaded.tecnico, faturamento: loaded.faturamento }
        setSaved(lists)
        setDraft(lists)
        setMeta({ exists: loaded.exists, ignoredNonCorporate: loaded.ignoredNonCorporate })
      } catch (error) {
        if (isMounted) {
          setLoadError(buildActionErrorMessage('Não foi possível carregar os destinatários.', error))
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadRecipients()

    return () => {
      isMounted = false
    }
  }, [])

  const isDirty = !areListsEqual(saved, draft)
  const hasInvalidEntries = CARGO_REPORT_RECIPIENT_LISTS.some(({ key }) =>
    draft[key].some((email) => !isValidCargoReportRecipientEmail(email))
  )

  function handleListChange(key, nextList) {
    setDraft((current) => ({ ...current, [key]: nextList }))
    setSaveSuccess(false)
    setSaveError('')
  }

  function handleDiscard() {
    setDraft(saved)
    setSaveSuccess(false)
    setSaveError('')
  }

  async function handleSave() {
    setIsSaving(true)
    setSaveError('')
    setSaveSuccess(false)

    try {
      const written = await saveCargoReportRecipients(
        { tecnico: draft.tecnico, faturamento: draft.faturamento },
        profile
      )
      const lists = { tecnico: written.tecnico, faturamento: written.faturamento }
      setSaved(lists)
      setDraft(lists)
      setMeta({ exists: true, ignoredNonCorporate: 0 })
      setSaveSuccess(true)
    } catch (error) {
      setSaveError(buildActionErrorMessage('Não foi possível salvar os destinatários.', error))
    } finally {
      setIsSaving(false)
    }
  }

  // Destinatários (loading/erro/listas): independentes do card da tabela Item x Emb., que sempre aparece.
  let recipientsSection

  if (isLoading) {
    recipientsSection = (
      <div className="admin-panel-stack" role="status" aria-label="Carregando destinatários">
        <Skeleton variant="card" style={{ height: 60 }} />
        <Skeleton variant="card" style={{ height: 220 }} />
        <Skeleton variant="card" style={{ height: 220 }} />
      </div>
    )
  } else if (loadError) {
    recipientsSection = <div className="error-banner">{loadError}</div>
  } else {
    recipientsSection = (
      <>
        <p className="field-hint">
          Quem está nestas listas recebe o aviso por e-mail quando um Relatório de Carga é anexado a um
          processo.
        </p>

        {!meta.exists ? (
          <p className="field-hint" role="note">
            Nenhuma lista cadastrada ainda. Ao salvar, a configuração será criada.
          </p>
        ) : null}

        {meta.ignoredNonCorporate > 0 ? (
          <p className="field-hint" role="note">
            {`${meta.ignoredNonCorporate} e-mail(s) fora do domínio @sqquimica.com no documento atual já são ignorados no envio e serão removidos ao salvar.`}
          </p>
        ) : null}

        {hasInvalidEntries ? (
          <div className="error-banner" role="alert">
            Há e-mails em formato inválido. Remova-os para salvar.
          </div>
        ) : null}

        {saveSuccess ? (
          <div className="success-banner" role="status">
            Destinatários salvos. O próximo Relatório de Carga já usa as novas listas.
          </div>
        ) : null}

        {saveError ? (
          <div className="error-banner" role="alert">
            {saveError}
          </div>
        ) : null}

        {CARGO_REPORT_RECIPIENT_LISTS.map(({ key, label, description }) => (
          <CargoReportRecipientListCard
            key={key}
            label={label}
            description={description}
            items={draft[key]}
            disabled={isSaving}
            onChange={(nextList) => handleListChange(key, nextList)}
          />
        ))}

        <div className="action-row crr-actions">
          <button
            type="button"
            className="primary-button"
            onClick={handleSave}
            disabled={isSaving || !isDirty || hasInvalidEntries}
          >
            {isSaving ? 'Salvando…' : 'Salvar alterações'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleDiscard}
            disabled={isSaving || !isDirty}
          >
            Descartar alterações
          </button>
        </div>
      </>
    )
  }

  return (
    <div className="admin-panel admin-panel--cargo-report">
      <div className="admin-panel-stack">
        {recipientsSection}
        <ItemPackagingCatalogCard />
      </div>
    </div>
  )
}
