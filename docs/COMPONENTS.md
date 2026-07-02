# Componentes do Portal COMEX

Catalogo de referencia para os 16 componentes top-level em `src/components/`.
Cada componente tem testes em `tests/ui/<Nome>.test.jsx`.

Para exemplos ao vivo, abra o app (Ctrl+K no command palette) e navegue.

---

## Estrutura

| Componente | Arquivo | Sprint | Props principais |
|---|---|---|---|
| `AppLayout` | AppLayout.jsx | 15.0 | (sem props; usa hooks) |
| `Breadcrumb` | Breadcrumb.jsx | 13.0 | `items: [{ label, to? }]` |
| `CommandPalette` | CommandPalette.jsx | 14.0, 18.0 | `open`, `onClose`, `commands`, `searcher?`, `placeholder?` |
| `EmptyState` | EmptyState.jsx | 12.0 | `title`, `message`, `icon?`, `illustration?`, `action?` |
| `FilterChip` | FilterChip.jsx | 14.0 | `label`, `variant?`, `size?`, `onRemove?` |
| `Icon` | Icon.jsx | 11.0, 12.0 | `name`, `size?` |
| `Modal` | Modal.jsx | 9.0 | `open`, `onClose`, `title?`, `wide?` |
| `PageFade` | PageFade.jsx | 16.0 | `children`, `className?` |
| `PageToolbar` | PageToolbar.jsx | 17.0 | `eyebrow?`, `title?`, `description?`, `actions?`, `children?` |
| `ProtectedRoute` | ProtectedRoute.jsx | (auth) | (wrapper de rota) |
| `Skeleton` | Skeleton.jsx | 12.0 | `width?`, `height?`, `variant?` |
| `Stagger` | Stagger.jsx | 21.0 | `stepMs?`, `baseMs?`, `className?` |
| `StatCard` | StatCard.jsx | 14.0 | `label`, `value`, `trend?`, `sparklineData?` |
| `TabButton` | TabButton.jsx | 16.1 | `active?`, `disabled?`, `onClick`, `children`, `className?` |
| `Toast` (Provider) | Toast.jsx | 8.0 | `<ToastProvider>` no root; `useToast()` retorna `{success,error,warning,info}` |
| `Tooltip` | Tooltip.jsx | 19.0 | `label`, `side?`, `className?` |

---

## Hooks customizados (`src/hooks/`)

| Hook | Arquivo | Sprint | API |
|---|---|---|---|
| `useAuth` | useAuth.js | (auth) | `{ profile, isAuthenticated, hasAccess, login, register, logout, ... }` |
| `useForecastSettings` | useForecastSettings.js | (forecast) | configuracoes de previsao |
| `useProcessSearch` | useProcessSearch.js | 18.0 | `searcher(query)` - busca em processos |
| `useGlobalSearch` | useGlobalSearch.js | 23.0 | `{ searcher, recentSearches, clearRecent }` - processos + news + historico |
| `useDoNotDisturb` | useDoNotDisturb.js | 20.0 | `{ isActive, remainingMs, enableFor, disable }` + `formatRemaining` |
| `useFcm` | useFcm.js | 22.0 | `{ supported, status, token, enable, disable }` |

---

## Padroes de design

### Cores (tokens)
Veja `src/styles.css` no `:root`. Fonte de verdade e o IntelliQuote (`Intelliquote/programa/web/src/styles/globals.css`):
- `--primary: #00ae91` (verde-azulado)
- `--ink: #1f1c18` (texto principal)
- `--bg: #f5f8f7` (fundo)
- `--surface: #ffffff` (cards)
- `--radius: 14px` (arredondamento padrao)

### Botoes
4 variantes em `styles.css`:
- `.primary-button` (verde gradient, acao principal)
- `.ghost-button` (transparente, acao secundaria)
- `.danger-button` (vermelho, acao destrutiva)
- `.secondary-button` (cinza, neutro)

### Tipografia
- h1: 26px / 800
- h2: 20px / 700
- h3: 16px / 700
- h4: 14px / 700
- Body: 0.875rem (14px)
- Font: Manrope (Google Fonts)

### Animacoes
- `prefers-reduced-motion: reduce` desabilita animacoes
- Page transitions: 180ms ease-out (PageFade)
- Tabs: scale(1.02) + box-shadow 200ms (TabButton)
- Stagger: fade-in com delay incremental 60ms
- Tooltip: 140ms ease

---

## Adicionar novo componente

1. Crie `src/components/MeuComponente.jsx` com `'use client'`-style doc comment no topo
2. Crie `tests/ui/MeuComponente.test.jsx` com `@vitest-environment jsdom` no topo
3. Adicione em `_topLevel_list` em `tests/fixtures/expected-counts.json`
4. Rode `npm test` - o audit (`tests/scripts/audit-vault-counts.test.js`) detecta drift
5. Atualize a tabela acima

## Adicionar novo hook

1. Crie `src/hooks/useMeuHook.js` (sempre `use` prefix)
2. Crie `tests/ui/useMeuHook.test.jsx`
3. Adicione teste em `tests/fixtures/expected-counts.json` (`tests.totalFiles` + `tests.ui`)
4. Documente na secao de Hooks acima
