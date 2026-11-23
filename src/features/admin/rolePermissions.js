export const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
  { value: 'logistica', label: 'Logística' },
  { value: 'tecnico', label: 'Técnico' },
  { value: 'faturamento', label: 'Faturamento/fiscal' },
]

export const rolePermissionsMap = {
  admin: ['Usuários', 'Permissões', 'Comunicados', 'Auditoria', 'Processos'],
  user: ['Dashboard', 'Processos'],
  logistica: ['Dashboard', 'Processos'],
  tecnico: ['Dashboard', 'Processos', 'Documentos'],
  faturamento: ['Dashboard', 'Processos', 'Documentos'],
}

export function getRoleLabel(role) {
  return roleOptions.find((item) => item.value === role)?.label ?? role
}

export function getRolePermissions(role) {
  return rolePermissionsMap[role] ?? []
}
