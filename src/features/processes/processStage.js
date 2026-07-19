// F16.5 (redesign iOS): mapeia o processStatus canônico para um dos 5
// estágios da timeline do detalhe. Puro — sem React, testável isolado.
//
// Estágios (protótipo): Embarque → Trânsito → Chegada → Liberação → Entrega.
// `currentStage` é o índice do estágio ATIVO; tudo antes conta como
// concluído. `isComplete` = carga recebida → a timeline inteira preenche.

import { canonicalizeProcessStatus } from './processStatus'

export const PROCESS_STAGES = ['Embarque', 'Trânsito', 'Chegada', 'Liberação', 'Entrega']

const STAGE_BY_STATUS = {
  'Aguardando Embarque': 0,
  Embarcou: 1,
  'Aguardando atracação': 1,
  'Atracação Confirmada': 2,
  'Aguardando registro da DUIMP': 3,
  'Aguardando parametrização da DUIMP': 3,
  'Aguardando agendamento de coleta': 4,
  'Coleta Agendada': 4,
  'Carga recebida': 4,
}

export function getProcessStage(process) {
  const canonical = canonicalizeProcessStatus(process?.processStatus)
  const isComplete = canonical === 'Carga recebida'
  const currentStage = STAGE_BY_STATUS[canonical] ?? 0
  return { currentStage, isComplete }
}
