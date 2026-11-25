import { useId, useMemo, useRef, useState } from 'react'
import Modal from '../../components/Modal'
import { buildActionErrorMessage } from '../../utils/errorMessages'
import { formatCargoNumber } from './cargoReportFormModel'
import { buildSupplierPackagingEntry } from './cargoSupplierPackaging'

// S9-D do Relatório de Carga: "Cadastrar embalagem" para o item e o fornecedor da linha (atalho do aviso "Sem
// embalagem cadastrada"). Só o admin, com o COMEX em rascunho. Vale só para este fornecedor e fica salvo no cadastro
// de embalagens; `onSave(entry)` grava (e preenche as linhas) e devolve uma Promise: rejeitada, o erro aparece aqui.
// `askTarget` (tela admin, "Fornecedor para um item"): o item e o fornecedor são digitados em vez de fixos.

const PERMISSION_MESSAGE = 'Sem permissão para gravar o cadastro. Só o admin cadastra embalagens.'
const SAVE_ERROR_PREFIX = 'Não foi possível gravar o cadastro.'

const kg = (value) => (typeof value === 'number' ? formatCargoNumber(value, { maxDecimals: 3 }) : '')

// `defaults`: { packagingType, netWeightKg } do padrão do item (sugestão), quando existir.
export default function CargoReportQuickPackagingDialog({
  code = '',
  supplierName = '',
  packagingTypes,
  defaults,
  mobile = false,
  askTarget = false,
  onSave,
  onCancel,
}) {
  const ids = useId()
  const firstRef = useRef(null)
  const types = useMemo(() => {
    const suggested = defaults?.packagingType
    return suggested && !packagingTypes.includes(suggested) ? [suggested, ...packagingTypes] : packagingTypes
  }, [defaults, packagingTypes])
  const [target, setTarget] = useState({ code, supplierName })
  const [packagingType, setPackagingType] = useState(defaults?.packagingType || types[0] || '')
  const [net, setNet] = useState(kg(defaults?.netWeightKg))
  const [tare, setTare] = useState('')
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function handleSave() {
    if (isSaving) return
    const { entry, errors: found } = buildSupplierPackagingEntry({
      code: target.code,
      supplierName: target.supplierName,
      packagingType,
      netWeightKg: net,
      packageWeightKg: tare,
    })
    setErrors(found)
    setSaveError('')
    if (Object.keys(found).length > 0) return

    setIsSaving(true)
    try {
      await onSave(entry)
    } catch (error) {
      setSaveError(
        error?.code === 'permission-denied' ? PERMISSION_MESSAGE : buildActionErrorMessage(SAVE_ERROR_PREFIX, error)
      )
      setIsSaving(false)
    }
  }

  const textField = (key, label, extra = {}) => (
    <div className="crf-field">
      <label htmlFor={`${ids}-${key}`}>{label}</label>
      <input
        id={`${ids}-${key}`}
        ref={key === 'code' ? firstRef : undefined}
        type="text"
        value={target[key]}
        aria-invalid={errors[key] ? true : undefined}
        onChange={(event) => setTarget((current) => ({ ...current, [key]: event.target.value }))}
        {...extra}
      />
      {errors[key] ? <span className="crf-pkdlg__err">{errors[key]}</span> : null}
    </div>
  )

  return (
    <Modal
      open
      onClose={isSaving ? () => {} : onCancel}
      title={askTarget ? 'Fornecedor para um item' : 'Cadastrar embalagem'}
      className={`crf-split crf-pkdlg${mobile ? ' crf-split--mobile' : ''}`}
      initialFocusRef={firstRef}
    >
      <div className="crf-dlg">
        {askTarget ? (
          <p className="crf-split__sub">
            Cadastra a embalagem de um item para um fornecedor. Vale só para ele; sem linha do fornecedor, vale o padrão do
            item.
          </p>
        ) : (
          <p className="crf-split__sub">
            Item <b>{code}</b> · fornecedor <b>{supplierName}</b>. Vale só para este fornecedor; fica salvo no cadastro de
            embalagens.
          </p>
        )}

        {askTarget ? (
          <div className="crf-pkdlg__grid">
            {textField('code', 'Item (código)')}
            {textField('supplierName', 'Fornecedor')}
          </div>
        ) : null}

        <div className="crf-pkdlg__grid">
          <div className="crf-field">
            <label htmlFor={`${ids}-type`}>Tipo</label>
            <select
              id={`${ids}-type`}
              value={packagingType}
              aria-invalid={errors.packagingType ? true : undefined}
              onChange={(event) => setPackagingType(event.target.value)}
            >
              {types.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            {errors.packagingType ? <span className="crf-pkdlg__err">{errors.packagingType}</span> : null}
          </div>
          <div className="crf-field">
            <label htmlFor={`${ids}-net`}>Peso líquido (kg)</label>
            <input
              id={`${ids}-net`}
              ref={askTarget ? undefined : firstRef}
              type="text"
              inputMode="decimal"
              value={net}
              aria-invalid={errors.netWeightKg ? true : undefined}
              onChange={(event) => setNet(event.target.value)}
            />
            {errors.netWeightKg ? <span className="crf-pkdlg__err">{errors.netWeightKg}</span> : null}
          </div>
          <div className="crf-field">
            <label htmlFor={`${ids}-tare`}>Peso da emb. (kg)</label>
            <input
              id={`${ids}-tare`}
              type="text"
              inputMode="decimal"
              value={tare}
              aria-invalid={errors.packageWeightKg ? true : undefined}
              onChange={(event) => setTare(event.target.value)}
            />
            {errors.packageWeightKg ? <span className="crf-pkdlg__err">{errors.packageWeightKg}</span> : null}
          </div>
        </div>

        {!askTarget && (errors.code || errors.supplierName) ? (
          <div className="error-banner" role="alert">
            {errors.code ?? errors.supplierName}
          </div>
        ) : null}
        {saveError ? (
          <div className="error-banner" role="alert">
            {saveError}
          </div>
        ) : null}

        <div className="crf-dlg__actions">
          <button type="button" className="secondary-button" disabled={isSaving} onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="primary-button" disabled={isSaving} onClick={handleSave}>
            {isSaving ? 'Gravando…' : 'Salvar no cadastro'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
