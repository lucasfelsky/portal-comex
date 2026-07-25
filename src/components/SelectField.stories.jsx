import { useState } from 'react'
import SelectField from './SelectField'

// C12 (auditoria mobile F14): drop-in pro <select> nativo. O ponto do
// componente e' que ele MUDA de comportamento por viewport:
//   - desktop (>720px): renderiza o <select> nativo, e so'.
//   - mobile (<=720px): o <select> continua na arvore (fonte da verdade e
//     fallback de teclado/leitor de tela), mas fica atras de um gatilho que
//     abre um ActionSheet.
//
// Por isso a story mais util aqui e' comparar os dois estados. Use o toggle de
// viewport do Storybook para ver o comportamento real; a story `Mobile` usa
// `forceMobile` para mostrar o gatilho sem depender do tamanho da janela.
export default {
  title: 'Components/SelectField',
  component: SelectField,
  parameters: {
    docs: {
      description: {
        component:
          'Substituto do `<select>` com mesma API (`value`, `onChange(event)`, children `<option>`). No mobile abre um `ActionSheet` em vez do dropdown nativo. Selecionar no sheet dispara `onChange` com um evento sintético `{ target: { value } }`, compatível com handlers que leem `event.target.value`.',
      },
    },
  },
}

function Demo({ label, ...props }) {
  const [value, setValue] = useState(props.initialValue ?? 'FCL')
  return (
    <div style={{ maxWidth: 320 }}>
      {label ? (
        <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>
          {label}
        </label>
      ) : null}
      <SelectField
        value={value}
        onChange={(event) => setValue(event.target.value)}
        sheetTitle={props.sheetTitle}
        forceMobile={props.forceMobile}
        disabled={props.disabled}
      >
        {props.children}
      </SelectField>
      <p style={{ marginTop: 10, color: 'var(--ink-soft)', fontSize: 13 }}>
        value: <strong>{value || '(vazio)'}</strong>
      </p>
    </div>
  )
}

const CATEGORIAS = (
  <>
    <option value="FCL">FCL</option>
    <option value="LCL">LCL</option>
    <option value="AEREO">Aéreo</option>
    <option value="CONSOLIDADO">Consolidado</option>
  </>
)

// Sem forceMobile: segue a viewport real. Em tela larga e' o <select> nativo.
export const Default = {
  name: 'Padrão (segue a viewport)',
  render: () => (
    <Demo label="Categoria" sheetTitle="Categoria">
      {CATEGORIAS}
    </Demo>
  ),
}

// forceMobile ignora o useMobileLayout e mostra o gatilho + sheet. Serve pra
// inspecionar o caminho mobile sem redimensionar a janela.
export const Mobile = {
  name: 'Mobile (gatilho + ActionSheet)',
  render: () => (
    <Demo label="Categoria" sheetTitle="Categoria" forceMobile>
      {CATEGORIAS}
    </Demo>
  ),
}

export const Desabilitado = {
  render: () => (
    <Demo label="Categoria" sheetTitle="Categoria" disabled>
      {CATEGORIAS}
    </Demo>
  ),
}

// <optgroup> e' achatado no sheet (que nao tem hierarquia visual), virando
// "Grupo · Opção". Caso real: CollectionStatusEditView.
export const ComOptgroup = {
  name: 'Com <optgroup> (achatado no sheet)',
  render: () => (
    <Demo label="Status de coleta" sheetTitle="Status de coleta" forceMobile initialValue="Coleta Agendada">
      <optgroup label="Pré-coleta">
        <option value="Aguardando agendamento de coleta">Aguardando agendamento</option>
        <option value="Coleta Agendada">Coleta Agendada</option>
      </optgroup>
      <optgroup label="Pós-coleta">
        <option value="Carga a caminho do CD">Carga a caminho do CD</option>
        <option value="Veículo no CD para descarga">Veículo no CD para descarga</option>
        <option value="Carga disponível em estoque">Carga disponível em estoque</option>
      </optgroup>
    </Demo>
  ),
}
