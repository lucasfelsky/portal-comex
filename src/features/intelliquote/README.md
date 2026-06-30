# IntelliQuote (dentro do Portal COMEX)

Modulo de cotacao eletronica integrado como aba do Portal COMEX.

## Estrutura

```
features/intelliquote/
  pages/        # Telas principais (React Router)
  components/   # Componentes reutilizaveis (em construcao)
  services/     # Chamadas ao backend (em construcao)
  hooks/        # Hooks customizados (em construcao)
```

## Status atual (Fase 1)

- [x] Aba "Cotacoes" no menu lateral do Portal COMEX
- [x] Restricao de acesso: perfis `admin` e `comex`
- [x] Pagina placeholder com status do backend
- [ ] Migracao dos modulos JS vanilla para componentes React
- [ ] Servico de API unificado com token Firebase
- [ ] Validacao Firebase no backend + emissao de JWT IntelliQuote

## Variaveis de ambiente

| Variavel | Descricao | Exemplo |
|----------|-----------|---------|
| `VITE_INTELLIQUOTE_API_BASE` | URL base do backend IntelliQuote | `http://localhost:3000` (dev) / `https://intelliquote-api-xxx.run.app` (prod) |