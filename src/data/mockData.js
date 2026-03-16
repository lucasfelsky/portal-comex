import { getRolePermissions } from '../features/admin/rolePermissions'

export const dashboardStats = [
  {
    title: 'Processos ativos',
    value: '18',
    description: 'Itens mockados em acompanhamento no fluxo atual.',
  },
  {
    title: 'Prazos criticos',
    value: '4',
    description: 'Processos que precisariam de tratamento prioritario.',
  },
  {
    title: 'Equipe online',
    value: '6',
    description: 'Indicador ficticio para compor a visao operacional.',
  },
]

export const dashboardHighlights = [
  'Atualizar filtros e busca quando a listagem real entrar.',
  'Conectar cards a metricas vindas do backend.',
  'Definir alertas visuais por tipo de processo.',
]

export const dashboardTasks = [
  'Criar contrato de dados do processo.',
  'Definir estados de carregamento e erro.',
  'Mapear permissoes por perfil de usuario.',
]

export const processItems = [
  {
    id: 'PROC-001',
    client: 'Cliente Atlas',
    route: 'Santos -> Hamburg',
    status: 'Em andamento',
    statusTone: 'info',
  },
  {
    id: 'PROC-002',
    client: 'Cliente Boreal',
    route: 'Paranagua -> Miami',
    status: 'Atencao',
    statusTone: 'warn',
  },
  {
    id: 'PROC-003',
    client: 'Cliente Delta',
    route: 'Itajai -> Rotterdam',
    status: 'Em dia',
    statusTone: 'ok',
  },
]

export const processMetrics = [
  { label: 'Novos hoje', value: '3' },
  { label: 'Pendentes de documento', value: '7' },
  { label: 'Liberados esta semana', value: '9' },
]

export const adminUsersSeed = [
  {
    id: 'USR-001',
    name: 'Marina Costa',
    email: 'marina.costa@sqquimica.com.br',
    role: 'admin',
    area: 'Comex',
    status: 'Ativo',
    statusTone: 'ok',
    lastAccess: 'Hoje, 08:14',
    scopes: getRolePermissions('admin'),
    notes: 'Responsavel por aprovacoes e parametrizacao do portal.',
  },
  {
    id: 'USR-002',
    name: 'Rafael Nunes',
    email: 'rafael.nunes@sqquimica.com.br',
    role: 'user',
    area: 'Importacao',
    status: 'Pendente',
    statusTone: 'warn',
    lastAccess: 'Aguardando primeiro acesso',
    scopes: getRolePermissions('user'),
    notes: 'Cadastro aguardando validacao do perfil operacional.',
  },
  {
    id: 'USR-003',
    name: 'Luciana Prado',
    email: 'luciana.prado@sqquimica.com.br',
    role: 'user',
    area: 'Backoffice',
    status: 'Ativo',
    statusTone: 'info',
    lastAccess: 'Hoje, 10:42',
    scopes: getRolePermissions('user'),
    notes: 'Acompanha custos e conciliacao dos processos aprovados.',
  },
  {
    id: 'USR-004',
    name: 'Thiago Alves',
    email: 'thiago.alves@sqquimica.com.br',
    role: 'user',
    area: 'Diretoria',
    status: 'Bloqueado',
    statusTone: 'neutral',
    lastAccess: '03 mar, 16:05',
    scopes: getRolePermissions('user'),
    notes: 'Acesso pausado temporariamente por revisao de permissoes.',
  },
]

export const adminAuditEvents = [
  {
    id: 'LOG-001',
    action: 'Perfil alterado',
    actor: 'Marina Costa',
    target: 'USR-002',
    timestamp: '12:10',
  },
  {
    id: 'LOG-002',
    action: 'Comunicado publicado',
    actor: 'Luciana Prado',
    target: 'ANN-001',
    timestamp: '10:42',
  },
  {
    id: 'LOG-003',
    action: 'Usuario aprovado',
    actor: 'Marina Costa',
    target: 'USR-004',
    timestamp: '09:18',
  },
]

export const adminChecklist = [
  'Definir perfis e permissoes.',
  'Criar area de anuncios.',
  'Registrar eventos importantes em log.',
]
