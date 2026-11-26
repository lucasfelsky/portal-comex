// S11-F: códigos de erro da leitura de COA que valem só para o ARQUIVO (a fila segue). Módulo mínimo para que a fila
// da leitura automática (`coaAutoReadQueue`) não importe o hook do formulário (`useCargoReportCoa`) e não infle o
// chunk da aba Documentos. `useCargoReportCoa` reexporta por compatibilidade.
//
// Qualquer outro código (sessão, configuração, limite do dia, serviço fora do ar, "ocupado" e o erro genérico que o
// Cloud Run devolve num 429) INTERROMPE a fila: o resto fica "não lido".
export const COA_READ_FILE_ERROR_CODES = new Set([
  'not-pdf',
  'too-large',
  'tess-too-large',
  'attempts',
  'invalid-response',
  'tess-bad-response',
  'tess-timeout',
  'invalid-file',
  'not-found',
])
