import { useEffect, useRef, useState } from 'react'

// Arte SVG da tela de login (Ciclo login-arte). So' o LoginPage monta isto.
// Tudo e' decorativo: aria-hidden + focusable="false". Sem hex aqui: a cor vem
// de classes (`login-art-*`, `login-chart__*`, `login-port-scene__*`,
// `login-waves__*`) que apontam para tokens `--login-*` em src/styles.css,
// com contraparte em :root[data-theme='dark']. As opacidades numericas do
// design ficam como atributos.

const WAVE_MARK_TAIL = 'q5 -5 10 0 t10 0'

// Helpers de SVG (funcoes de render, nao componentes: sem props).
function renderWaveMarks(marks) {
  return (
    <g
      className="login-art-stroke--mark"
      fill="none"
      strokeLinecap="round"
      strokeWidth="1.2"
      strokeOpacity="0.22"
    >
      {marks.map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x} ${y} ${WAVE_MARK_TAIL}`} />
      ))}
    </g>
  )
}

// Navio da carta nautica: renderizado 3x (sem <use href> entre SVGs).
function ChartShip() {
  return (
    <g>
      <path
        className="login-chart__wake"
        d="M-36 4 q-16 -2 -38 2"
        fill="none"
        strokeOpacity="0.35"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        className="login-chart__wake"
        d="M-34 8 q-20 2 -50 7"
        fill="none"
        strokeOpacity="0.2"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <rect className="login-art-cargo--a" x="-16" y="-7" width="7.5" height="6.5" />
      <rect className="login-art-cargo--b" x="-8" y="-7" width="7.5" height="6.5" />
      <rect className="login-art-cargo--c" x="0" y="-7" width="7.5" height="6.5" />
      <rect className="login-art-cargo--d" x="8" y="-7" width="7.5" height="6.5" />
      <rect className="login-art-cargo--a" x="16" y="-7" width="7.5" height="6.5" />
      <rect className="login-art-cargo--a" x="-8" y="-14" width="7.5" height="6.5" />
      <rect className="login-art-cargo--b" x="8" y="-14" width="7.5" height="6.5" />
      <rect className="login-chart__bridge" x="-27" y="-15" width="9" height="15" />
      <rect className="login-chart__window" x="-26" y="-12" width="7" height="2" />
      <rect className="login-art-cargo--a" x="-24" y="-20" width="4" height="5" />
      <path className="login-chart__hull" d="M-30 0 H31 L25 9 H-26 Z" />
      <rect className="login-art-cargo--a" x="-27" y="5.5" width="53" height="1.6" />
    </g>
  )
}

// ---- Porto (painel .auth-brand, desktop) ----

// coluna x -> pilha de baixo para cima (y 722 / 709 / 696).
const PORT_CARGO = [
  [210, ['a', 'b', 'c']],
  [232, ['d', 'a', 'e']],
  [254, ['f', 'c']],
  [276, ['e', 'd', 'a']],
  [298, ['b', 'f', 'b']],
  [320, ['a', 'e', 'd']],
  [342, ['c', 'b']],
  [364, ['d', 'a', 'f']],
  [386, ['f', 'c', 'e']],
  [408, ['e']],
  [430, ['b', 'a', 'd']],
  [452, ['a', 'd']],
  [474, ['c', 'f', 'b']],
]
const PORT_CARGO_Y = [722, 709, 696]

const PORT_STACKS = [
  [0, 700, 34, 35],
  [36, 712, 40, 23],
  [150, 706, 26, 29],
  [520, 696, 40, 39],
]

const CRANE_HEAVY =
  'M70 735 V600 M120 735 V600 M30 600 H330 M410 735 V590 M455 735 V590 M290 590 H540'
const CRANE_LIGHT =
  'M70 690 L120 645 M120 690 L70 645 M95 600 V556 M95 556 L30 600 M95 556 L330 600 ' +
  'M410 680 L455 635 M455 680 L410 635 M432 590 V548 M432 548 L290 590 M432 548 L540 590'

const PORT_WAVE_TAIL = ' t40 0'.repeat(35)
const PORT_WAVES = [
  { x: -320, y: 792, opacity: '0.22', width: '1.4' },
  { x: -340, y: 814, opacity: '0.14', width: '1.2' },
  { x: -320, y: 836, opacity: '0.08', width: '1' },
]

export function LoginPortScene() {
  return (
    <svg
      className="login-port-scene"
      viewBox="-280 470 1120 382"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="login-port-water" x1="0" y1="0" x2="0" y2="1">
          <stop className="login-port-scene__water-top" offset="0" />
          <stop className="login-port-scene__water-bottom" offset="1" />
        </linearGradient>
      </defs>
      <g className="login-port-scene__sun">
        <circle cx="420" cy="610" r="120" fillOpacity="0.08" />
        <circle cx="420" cy="610" r="78" fillOpacity="0.12" />
      </g>
      <g className="login-port-scene__stacks" fillOpacity="0.06">
        {PORT_STACKS.map(([x, y, w, h]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} />
        ))}
      </g>
      <g
        className="login-port-scene__cranes"
        fill="none"
        strokeOpacity="0.24"
        strokeLinecap="round"
      >
        <path d={CRANE_HEAVY} strokeWidth="3" />
        <path d={CRANE_LIGHT} strokeWidth="1.4" />
      </g>
      <g className="login-port-scene__spreaders" fillOpacity="0.5">
        <rect x="262" y="603" width="14" height="8" rx="1" />
        <rect x="330" y="593" width="14" height="8" rx="1" />
      </g>
      <path
        className="login-port-scene__cables"
        d="M266 611 V690 M337 601 V682"
        strokeOpacity="0.35"
        strokeWidth="1"
      />
      <rect
        className="login-port-scene__quay"
        x="-280"
        y="735"
        width="440"
        height="8"
        fillOpacity="0.1"
      />
      <rect x="-280" y="760" width="1120" height="92" fill="url(#login-port-water)" />

      <g className="login-port-scene__ship">
        <g fillOpacity="0.92">
          {PORT_CARGO.map(([x, stack]) =>
            stack.map((tone, level) => (
              <rect
                key={`${x}-${level}`}
                className={`login-port-scene__cargo--${tone}`}
                x={x}
                y={PORT_CARGO_Y[level]}
                width="21"
                height="12"
              />
            )),
          )}
        </g>
        <rect
          className="login-port-scene__bridge"
          x="166"
          y="688"
          width="34"
          height="47"
          rx="2"
          fillOpacity="0.9"
        />
        <rect
          className="login-port-scene__window"
          x="172"
          y="694"
          width="22"
          height="5"
          rx="1"
          fillOpacity="0.6"
        />
        <rect className="login-port-scene__funnel" x="184" y="674" width="9" height="14" />
        <path className="login-port-scene__hull" d="M146 735 H526 L502 776 H172 Z" />
        <rect
          className="login-port-scene__stripe"
          x="160"
          y="765"
          width="352"
          height="4"
          fillOpacity="0.85"
        />
      </g>

      <g className="login-port-scene__waves" fill="none" strokeLinecap="round">
        {PORT_WAVES.map(({ x, y, opacity, width }) => (
          <path
            key={y}
            d={`M${x} ${y} q20 -6 40 0${PORT_WAVE_TAIL}`}
            strokeOpacity={opacity}
            strokeWidth={width}
          />
        ))}
      </g>
    </svg>
  )
}

// ---- Carta nautica (fundo claro, desktop) ----

const LON_LABELS = [
  '46°40′W',
  '46°30′W',
  '46°20′W',
  '46°10′W',
  '46°00′W',
  '45°50′W',
  '45°40′W',
  '45°30′W',
  '45°20′W',
  '45°10′W',
  '45°00′W',
  '44°50′W',
]
const LAT_LABELS = [
  '23°50′S',
  '23°55′S',
  '24°00′S',
  '24°05′S',
  '24°10′S',
  '24°15′S',
  '24°20′S',
  '24°25′S',
]
// Refino F5b (D16): a assinatura SQ Quimica ocupa o canto inferior direito da carta; a partir de
// 24°10′S os rotulos deixam de ser desenhados. Filtra por indice (as posicoes y = 144 + 180·k dos
// que ficam nao mudam; nada e removido do meio do array).
const LAT_VISIBLE_COUNT = 4
// Refino F6a (carry-over da F5b): nenhum rotulo da carta pode aparecer cortado. A largura/altura do
// SVG muda com o viewport e com o modo notebook (a carta e deslocada por --nb-login-shift), entao o
// que cabe e' medido no elemento. Um rotulo so e' desenhado se sua caixa inteira cair na zona opaca:
// longitudes ate 170px antes da borda direita (onde a mascara comeca a esmaecer) e latitudes ate 84px
// antes do rodape (onde a mascara corta). Sem medida (jsdom, carta escondida em <= 1040px) = todos.
const LON_X0 = 706
const LON_STEP = 160
const LON_LABEL_WIDTH = 56
const LON_FADE_PX = 170
const LAT_Y0 = 144
const LAT_STEP = 180
const LAT_LABEL_DEPTH = 4
const LAT_FOOTER_PX = 84

export function countFittingLonLabels(width) {
  if (!(width > 0)) return LON_LABELS.length
  return LON_LABELS.filter((_, k) => LON_X0 + LON_STEP * k + LON_LABEL_WIDTH <= width - LON_FADE_PX).length
}

export function countFittingLatLabels(height) {
  if (!(height > 0)) return LAT_VISIBLE_COUNT
  return LAT_LABELS.slice(0, LAT_VISIBLE_COUNT).filter(
    (_, k) => LAT_Y0 + LAT_STEP * k + LAT_LABEL_DEPTH <= height - LAT_FOOTER_PX,
  ).length
}

function useBoxSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const read = () => {
      const box = node.getBoundingClientRect()
      setSize((previous) =>
        previous.width === box.width && previous.height === box.height
          ? previous
          : { width: box.width, height: box.height },
      )
    }
    read()
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(read)
      observer.observe(node)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [ref])
  return size
}
const GRID_X = Array.from({ length: 13 }, (_, k) => 700 + 160 * k)
const GRID_Y = Array.from({ length: 8 }, (_, k) => 150 + 180 * k)

const MARKS_TOP = [
  [1160, 88],
  [672, 248],
]
const MARKS_MID = [
  [1300, 13],
  [760, 35],
  [1290, 255],
]
// Refino F5b: a marca que ficava em [1370, 200] caia sob a assinatura SQ Quimica (right 40,
// bottom 32, ~160 x 36) a 1440-1600px; sobe para y = 120 (>= 120px do rodape, fora da faixa).
const MARKS_BOTTOM = [
  [940, 100],
  [700, 208],
  [1370, 120],
]

function renderChartRoute(y, opacity) {
  return (
    <line
      className="login-art-stroke--line"
      x1="600"
      y1={y}
      x2="100%"
      y2={y}
      fill="none"
      strokeLinecap="round"
      strokeWidth="1.2"
      strokeDasharray="3 9"
      strokeOpacity={opacity}
    />
  )
}

export function LoginSeaChart() {
  const lonRef = useRef(null)
  const latRef = useRef(null)
  const lonCount = countFittingLonLabels(useBoxSize(lonRef).width)
  const latCount = countFittingLatLabels(useBoxSize(latRef).height)
  return (
    <div className="login-chart" aria-hidden="true">
      <svg className="login-chart__grid" focusable="false">
        <g
          className="login-art-stroke--line"
          fill="none"
          strokeOpacity="0.09"
          strokeWidth="1"
          strokeDasharray="2 6"
        >
          {GRID_X.map((x) => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="100%" />
          ))}
          {GRID_Y.map((y) => (
            <line key={`h${y}`} x1="600" y1={y} x2="100%" y2={y} />
          ))}
        </g>
      </svg>

      <svg className="login-chart__lon" focusable="false" ref={lonRef}>
        {LON_LABELS.map((label, k) =>
          k < lonCount ? (
            <text key={label} x={LON_X0 + LON_STEP * k} y="44">
              {label}
            </text>
          ) : null,
        )}
      </svg>

      <svg className="login-chart__lat" focusable="false" ref={latRef}>
        {LAT_LABELS.map((label, k) =>
          k < LAT_VISIBLE_COUNT && k < latCount ? (
            <text key={label} x="110" y={LAT_Y0 + LAT_STEP * k} textAnchor="end">
              {label}
            </text>
          ) : null,
        )}
      </svg>

      <svg className="login-chart__lane login-chart__lane--top" focusable="false">
        {renderChartRoute(140, 0.22)}
        {renderWaveMarks(MARKS_TOP)}
        <g transform="translate(0 132)" opacity="0.75">
          <g className="login-chart__ship login-chart__ship--out">
            <g className="login-chart__bob">
              <ChartShip />
            </g>
          </g>
        </g>
      </svg>

      <svg className="login-chart__lane login-chart__lane--mid" focusable="false">
        {renderChartRoute(199, 0.14)}
        {renderWaveMarks(MARKS_MID)}
        <g transform="translate(0 193) scale(0.75)" opacity="0.45">
          <g className="login-chart__ship login-chart__ship--far">
            <g className="login-chart__bob">
              <ChartShip />
            </g>
          </g>
        </g>
      </svg>

      <svg className="login-chart__lane login-chart__lane--bottom" focusable="false">
        {renderChartRoute(164, 0.22)}
        {renderWaveMarks(MARKS_BOTTOM)}
        <g transform="translate(668 42)">
          <path
            className="login-chart__buoy-body"
            d="M-7 10 L0 -10 L7 10 Z"
            fillOpacity="0.35"
          />
          <rect
            className="login-chart__buoy-base"
            x="-9"
            y="9"
            width="18"
            height="5"
            rx="2"
            fillOpacity="0.5"
          />
          <circle className="login-chart__buoy-light" cy="-14" r="4" />
          <path
            className="login-art-stroke--line"
            d="M-16 18 q4 -3 8 0 t8 0 t8 0 t8 0"
            fill="none"
            strokeOpacity="0.25"
            strokeWidth="1"
          />
        </g>
        <g transform="translate(0 156) scale(-1 1)" opacity="0.7">
          <g className="login-chart__ship login-chart__ship--back">
            <g className="login-chart__bob">
              <ChartShip />
            </g>
          </g>
        </g>
      </svg>

      <svg className="login-chart__compass" viewBox="-60 -70 120 125" focusable="false">
        <g className="login-art-stroke--ink" fill="none" strokeOpacity="0.22" strokeWidth="1">
          <circle r="42" />
          <circle r="34" strokeDasharray="1 4" />
          <path
            className="login-art-fill--ink"
            d="M0 -50 L7 -7 L50 0 L7 7 L0 50 L-7 7 L-50 0 L-7 -7 Z"
            fillOpacity="0.06"
          />
          <path
            className="login-art-fill--mark"
            d="M0 -50 L7 -7 L0 0 Z"
            fillOpacity="0.45"
            stroke="none"
          />
          <path d="M-26 -26 L26 26 M26 -26 L-26 26" strokeOpacity="0.12" />
          <text
            className="login-chart__north"
            y="-58"
            textAnchor="middle"
            fillOpacity="0.4"
            stroke="none"
          >
            N
          </text>
        </g>
      </svg>
    </div>
  )
}

// ---- Ondas no rodape (mobile/tablet) ----

const SEA_CREST = 'M0 752 C 90 728, 180 778, 270 752 S 360 736, 390 746'

export function LoginWaves() {
  return (
    <div className="login-waves" aria-hidden="true">
      <svg className="login-waves__swell" viewBox="150 50 250 70" focusable="false">
        <g
          className="login-art-stroke--line"
          fill="none"
          strokeLinecap="round"
          strokeWidth="1.2"
        >
          <path d="M150 70 C 230 50, 300 100, 400 76" strokeOpacity="0.07" />
          <path d="M150 98 C 230 78, 300 128, 400 104" strokeOpacity="0.05" />
        </g>
      </svg>

      <svg
        className="login-waves__sea"
        viewBox="0 600 390 244"
        preserveAspectRatio="none"
        focusable="false"
      >
        <defs>
          <linearGradient id="login-waves-sea" x1="0" y1="0" x2="0" y2="1">
            <stop className="login-waves__sea-top" offset="0" />
            <stop className="login-waves__sea-bottom" offset="1" />
          </linearGradient>
        </defs>
        <g
          className="login-art-stroke--line"
          fill="none"
          strokeLinecap="round"
          strokeWidth="1.2"
        >
          <path
            d="M-10 640 C 90 610, 190 670, 290 640 S 380 620, 400 632"
            strokeOpacity="0.1"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M-10 668 C 90 638, 190 698, 290 668 S 380 648, 400 660"
            strokeOpacity="0.13"
            vectorEffect="non-scaling-stroke"
          />
        </g>
        <path
          className="login-art-fill--mark"
          d="M0 712 C 80 690, 170 738, 260 712 S 360 694, 390 704 V844 H0 Z"
          fillOpacity="0.1"
        />
        <path
          d={`${SEA_CREST} V844 H0 Z`}
          fill="url(#login-waves-sea)"
        />
        <path
          className="login-waves__crest"
          d={SEA_CREST}
          fill="none"
          strokeOpacity="0.35"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="login-waves__crest"
          d="M0 790 C 100 772, 200 808, 300 790 S 370 780, 390 786"
          fill="none"
          strokeOpacity="0.14"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <svg className="login-waves__ship" viewBox="296 721 48 24" focusable="false">
        <g className="login-waves__hull" fillOpacity="0.55">
          <path d="M296 735 H344 L338 744 H302 Z" />
          <rect x="305" y="728" width="7" height="6" />
          <rect x="313" y="728" width="7" height="6" />
          <rect x="321" y="728" width="7" height="6" />
          <rect x="313" y="722" width="7" height="5" />
          <rect x="330" y="724" width="8" height="10" />
        </g>
      </svg>
    </div>
  )
}
