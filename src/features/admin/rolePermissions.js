export const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
  { value: 'logistica', label: 'Logistica' },
]

export const rolePermissionsMap = {
  admin: ['Usuarios', 'Permissoes', 'Comunicados', 'Auditoria', 'Processos'],
  user: ['Dashboard', 'Processos'],
  logistica: ['Dashboard', 'Processos'],
}

export function getRoleLabel(role) {
  return roleOptions.find((item) => item.value === role)?.label ?? role
}

export function getRolePermissions(role) {
  return rolePermissionsMap[role] ?? []
}
