// Lista unica de perfis que veem o `name` de processos FCL/LCL/AEREO.
// Modulo separado e sem imports de proposito: `processLabels` tem mock FECHADO
// em testes de pagina; as paginas importam daqui para rodar a regra real.
// Espelho no backend: `PROCESS_NAME_VIEWER_ROLES` em
// `functions/src/core/shared.js` (paridade coberta por `tests/unit/processLabels.test.js`).
export const PROCESS_NAME_VIEWER_ROLES = Object.freeze(['admin', 'logistica', 'tecnico', 'faturamento'])

export function canSeeProcessName(role) {
  return PROCESS_NAME_VIEWER_ROLES.includes(role)
}
