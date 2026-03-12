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
