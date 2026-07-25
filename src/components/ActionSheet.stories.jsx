import { useState } from 'react'
import ActionSheet from './ActionSheet'

// C12 (auditoria mobile F14): bottom sheet estilo iOS. Renderiza via Portal em
// document.body, entao no Storybook ele aparece por cima do canvas inteiro —
// e' o comportamento correto, nao um bug de layout da story.
export default {
  title: 'Components/ActionSheet',
  component: ActionSheet,
  parameters: {
    docs: {
      description: {
        component:
          'Bottom sheet com lista de opções. Genérico: não é acoplado a `<select>` — quem faz essa ponte é o `SelectField`. Fecha por toque na opção, no backdrop, no botão Cancelar ou tecla Esc. Ao abrir, o foco vai para a opção ativa.',
      },
    },
  },
}

const CATEGORIAS = [
  { value: 'FCL', label: 'FCL' },
  { value: 'LCL', label: 'LCL' },
  { value: 'AEREO', label: 'Aéreo' },
  { value: 'CONSOLIDADO', label: 'Consolidado' },
]

// O sheet e' controlado por quem o renderiza: nao tem prop `open`, ele so'
// existe (ou nao) na arvore. O wrapper reproduz esse ciclo.
function ActionSheetDemo({ options, title, initialValue = '' }) {
  const [isOpen, setIsOpen] = useState(true)
  const [value, setValue] = useState(initialValue)

  return (
    <div>
      <button type="button" className="primary-button" onClick={() => setIsOpen(true)}>
        Abrir sheet
      </button>
      <p style={{ marginTop: 12, color: 'var(--ink-soft)', fontSize: 13 }}>
        Selecionado: <strong>{value || '(nenhum)'}</strong>
      </p>
      {isOpen ? (
        <ActionSheet
          title={title}
          options={options}
          value={value}
          onSelect={(next) => {
            setValue(next)
            setIsOpen(false)
          }}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </div>
  )
}

export const Default = {
  render: () => <ActionSheetDemo title="Categoria" options={CATEGORIAS} initialValue="FCL" />,
}

export const SemTitulo = {
  name: 'Sem título',
  render: () => <ActionSheetDemo options={CATEGORIAS} initialValue="LCL" />,
}

export const ComOpcaoDesabilitada = {
  name: 'Com opção desabilitada',
  render: () => (
    <ActionSheetDemo
      title="Status de coleta"
      initialValue="Coleta Agendada"
      options={[
        { value: 'Aguardando agendamento de coleta', label: 'Aguardando agendamento' },
        { value: 'Coleta Agendada', label: 'Coleta Agendada' },
        { value: 'Carga a caminho do CD', label: 'Carga a caminho do CD' },
        {
          value: 'Carga recebida',
          label: 'Carga recebida (bloqueado)',
          disabled: true,
        },
      ]}
    />
  ),
}

// Lista longa: o caso que motivou o componente. O dropdown nativo do celular
// vira uma lista minuscula e dificil de acertar com o dedo.
export const ListaLonga = {
  name: 'Lista longa (o caso que motivou o componente)',
  render: () => (
    <ActionSheetDemo
      title="Destino"
      initialValue="Navegantes"
      options={[
        'Navegantes',
        'Itajaí',
        'Paranaguá',
        'Santos',
        'Rio Grande',
        'Suape',
        'Salvador',
        'Vitória',
        'Manaus',
        'Pecém',
      ].map((destino) => ({ value: destino, label: destino }))}
    />
  ),
}
