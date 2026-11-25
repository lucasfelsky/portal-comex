// S9-C do Relatório de Carga: marcas de origem das células preenchidas (P processo, F FUP do DBCorp, C cadastro de
// embalagens) e "editado por você" (✎). A marca é irmã do campo, nunca parte do nome acessível dele.

import { SOURCE_MARK_TITLES } from './cargoReportAutofill'

export function SourceMark({ origin }) {
  if (!origin) return null
  return (
    <span className={`crf-src crf-src--${origin.toLowerCase()}`} role="img" aria-label={SOURCE_MARK_TITLES[origin]} title={SOURCE_MARK_TITLES[origin]}>
      {origin === 'E' ? '✎' : origin}
    </span>
  )
}

// Campo + marca no canto. Sempre embrulhado (com ou sem marca) para o campo não remontar, e perder o foco, quando a
// marca muda de P/F para ✎ durante a digitação.
export function MarkedField({ origin, children }) {
  return (
    <div className={`crf-cellwrap${origin ? ' has-mark' : ''}`}>
      {children}
      <SourceMark origin={origin} />
    </div>
  )
}

// Legenda acima da tabela (só aparece quando o relatório tem células preenchidas pelo processo ou pelo FUP).
export function SourceLegend() {
  return (
    <p className="crf-legend" aria-label="Legenda das marcas de origem">
      <span>
        <i className="crf-src crf-src--p" aria-hidden="true">
          P
        </i>{' '}
        processo
      </span>
      <span>
        <i className="crf-src crf-src--f" aria-hidden="true">
          F
        </i>{' '}
        FUP do DBCorp
      </span>
      <span>
        <i className="crf-src crf-src--e" aria-hidden="true">
          ✎
        </i>{' '}
        editado por você
      </span>
    </p>
  )
}
