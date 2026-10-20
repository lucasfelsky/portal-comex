// Marcas do refino visual (F1).
//
// ProductMark — marca de produto "Rota e chegada" (Marca.dc.html, direcao A):
//   COMEX = um "C" aberto que termina no ponto de chegada;
//   IQ    = um "Q" cujo traco aponta para o ponto.
//   Ladrilho 48x48 (rx 13) + glifo branco + ponto verde SQ.
//
// SqQuimicaLogo — assinatura modernizada da SQ Quimica (SQLogo.dc.html,
//   variante "minusculas"): anel + gargalo/balao verdes + "sq quimica" em Sora.
//
// Cores vem so de tokens CSS (--brand-mark-*, --sq-logo-*) via classes em
// styles.css; nenhum hex aqui. Decorativos por padrao (aria-hidden, sem
// <title>): a prop `label` opcional troca para role="img" + aria-label.
//
// API:
//   <ProductMark product="comex" tone="dark" size={40} />
//   <ProductMark product="iq" tone="light" size={36} label="IntelliQuote" />
//   <SqQuimicaLogo variant="minusc" tone="light" size={36} label="SQ Química" />

const PRODUCTS = ['comex', 'iq']
const MARK_TONES = ['light', 'dark', 'mono']
const SQ_TONES = ['light', 'dark']

function a11yProps(label) {
  return label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' }
}

export function ProductMark({ product = 'comex', tone = 'light', size = 40, label, className = '' }) {
  const safeProduct = PRODUCTS.includes(product) ? product : 'comex'
  const safeTone = MARK_TONES.includes(tone) ? tone : 'light'
  const classes = ['brand-mark', `brand-mark--${safeProduct}`, `brand-mark--${safeTone}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <svg
      className={classes}
      viewBox="0 0 48 48"
      width={size}
      height={size}
      focusable="false"
      {...a11yProps(label)}
    >
      <rect className="brand-mark__tile" width="48" height="48" rx="13" />
      {safeProduct === 'iq' ? (
        <>
          <circle
            className="brand-mark__glyph"
            cx="22.5"
            cy="22.5"
            r="10"
            fill="none"
            strokeWidth="4.5"
          />
          <path
            className="brand-mark__glyph"
            d="M29.8 29.8 L31.2 31.2"
            fill="none"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          <circle className="brand-mark__dot" cx="35.4" cy="35.4" r="3.1" />
        </>
      ) : (
        <>
          <path
            className="brand-mark__glyph"
            d="M31.78 16.22 A11 11 0 1 0 31.78 31.78"
            fill="none"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          <circle className="brand-mark__dot" cx="35.2" cy="24" r="3.1" />
        </>
      )}
    </svg>
  )
}

export function SqQuimicaLogo({ variant = 'minusc', tone = 'light', size = 36, label, className = '' }) {
  const safeTone = SQ_TONES.includes(tone) ? tone : 'light'
  const px = (factor) => `${Math.round(size * factor)}px`
  const classes = ['sq-logo', `sq-logo--${variant}`, `sq-logo--${safeTone}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <span
      className={classes}
      style={{
        '--sq-logo-font': px(0.4),
        '--sq-logo-gap': px(0.18),
        '--sq-logo-word-gap': px(0.12),
      }}
      {...a11yProps(label)}
    >
      <svg
        className="sq-logo__symbol"
        viewBox="0 0 100 100"
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
      >
        <path
          className="sq-logo__ring"
          d="M64 19.5 A38 38 0 1 1 36 19.5"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path className="sq-logo__green" d="M44 30.5 L56 23.5 L56 44 L44 44 Z" />
        <circle className="sq-logo__green" cx="50" cy="58.5" r="19.5" />
      </svg>
      <span className="sq-logo__words">
        <span className="sq-logo__sq">sq</span>
        <span className="sq-logo__chem">química</span>
      </span>
    </span>
  )
}
