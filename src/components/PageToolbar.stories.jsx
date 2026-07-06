import PageToolbar from './PageToolbar'

export default {
  title: 'Components/PageToolbar',
  component: PageToolbar,
}

export const Basic = {
  args: {
    eyebrow: 'Compras',
    title: 'Fornecedores',
    description: 'Cadastro de fornecedores, contatos principais e incoterms aceitos.',
  },
}

export const WithActions = {
  args: {
    eyebrow: 'Compras',
    title: 'Fornecedores',
    description: 'Cadastro de fornecedores, contatos principais e incoterms aceitos.',
    actions: <button type="button" className="primary-button">Novo fornecedor</button>,
  },
}

export const WithCustomChildren = {
  args: {
    children: (
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
        <strong>Layout customizado via children</strong>
        <button type="button" className="ghost-button">Ação</button>
      </div>
    ),
  },
}
