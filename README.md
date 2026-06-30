# SQ COMEX UPDATES
Site para Acompanhamento dos Embarques da SQ Química

## Deploy manual no Firebase

Na raiz do projeto:

```bash
npm install
npm install -g firebase-tools
firebase login
```

Se ainda não estiver vinculado ao projeto correto:

```bash
firebase use --add
```

Selecione o projeto `sq-comex-updates`.

### Publicar regras do Firestore

```bash
firebase deploy --only firestore:rules
```

As regras publicadas são lidas do arquivo `firestore.rules` na raiz do projeto.

### Build e deploy do Hosting

O arquivo `firebase.json` já está configurado para servir a pasta `dist` com rewrite SPA para `index.html`.

```bash
npm run build
firebase deploy --only hosting
```

## CI

GitHub Actions em `.github/workflows/ci.yml` (raiz do projeto). Roda em push/PR para `main`, `develop`, `feat/**` e `fix/**`.

Dois jobs:

1. **unit-and-build** — `npm ci` → `npm test` (Vitest, 42 casos) → `npm run build` (Vite).
2. **rules-validation** — depende de `unit-and-build`. Roda `firebase deploy --only firestore:rules --dry-run` para validar a sintaxe do `firestore.rules` sem precisar do emulador Firestore (que exige Java 21+, indisponivel em muitos CI runners). Usa o `firebase-tools` declarado em devDependencies desde a Sprint 4.1.

> Quando a etapa de **deploy** for adicionada (backlog 5.3 do Roadmap), ela reusa o mesmo `FIREBASE_TOKEN` e adiciona um job `deploy:hosting` / `deploy:functions`.

### Secrets necessarios (uma vez)

Em **Settings → Secrets and variables → Actions**:

| Secret | Origem | Usado em |
|---|---|---|
| `FIREBASE_TOKEN` | `firebase login:ci` | `rules-validation` (e deploy futuro) |

Para gerar: `npx firebase login:ci` em uma workstation local; copie o token impresso. O token expira em ~1h apos login — para CI persistente, prefira criar uma service account com `Firebase Hosting Admin` + `Cloud Functions Admin` + `Firebase Rules Admin` e guardar a chave JSON como `GCP_SA_KEY` (backlog 5.4).

### Rodar local

```bash
npm test                       # unit (rapido, ~9s)
node node_modules/firebase-tools/lib/bin/firebase.js --config firebase.portal-comex.json deploy --only firestore:rules --dry-run --non-interactive
```

