# Plano de correção — Revisão de interface (fluxo Processos/Chegadas)

**Origem:** revisão `better-interface` (modo `full`) rodada em 2026-07-29 sobre o fluxo de Processos do Portal COMEX (`ProcessesPage` + `features/processes/*` + componentes compartilhados). Veredito da revisão: **Block** (9 achados HIGH).

**Papéis:** este documento é um plano — Claude não implementou nada aqui. Gemini implementa a partir destes blocos; Claude revisa o diff depois (lendo o código de verdade, rodando testes/lint, checando higiene de git), conforme o protocolo combinado em 2026-07-28.

## Lembretes de processo (valem para todos os itens abaixo)

- Não commitar direto em `main`. Cada item (ou grupo relacionado) vira um branch + PR, mesmo que pequeno.
- Rodar a suíte de testes relevante (`npm test`, `npm run test:rules` se mexer em regra/label persistida, `npm run lint`) **antes** de declarar qualquer item pronto — não confiar em "deveria funcionar".
- Commits atômicos: uma mudança não relacionada não deve ser escondida dentro do commit de outra (ex: não misturar um fix de copy com uma mudança de CSS de outro item).
- Se a página onde a mensagem aparece for coberta por Storybook, atualizar/checar a story correspondente.
- P2-14 (toast dark mode) e P1-6 (contraste do toast) mexem no mesmo bloco de CSS — fazer os dois juntos em um único PR para não haver retrabalho.
- **P2-11 (casing dos status) é o item de maior risco de dados** — ver aviso específico no item. Não implementar sem confirmar se os valores são usados como chave persistida.

---

## Prioridade 1 — Bloqueadores (HIGH)

### ✅ P1-1 · Confirmação antes de excluir processo
**Domínio:** UI/Writing · **Arquivos:** `src/features/processes/ProcessDetailView.jsx` (~linha 471), `src/pages/ProcessesPage.jsx` (`handleDeleteProcess`, ~1187-1210), `src/components/ConfirmDialog.jsx` (reaproveitar, já existe no projeto).

**Objetivo:** impedir exclusão permanente de processo com um único clique acidental.

**Passos:**
1. No botão "Excluir processo" do `ProcessDetailView`, abrir um `ConfirmDialog` (estado local) em vez de chamar `onDeleteProcess` diretamente.
2. Usar o mesmo padrão de cópia de outros `ConfirmDialog` do app — título e mensagem deixando claro que a ação é irreversível.
3. Só chamar `onDeleteProcess` (que dispara `handleDeleteProcess`) após confirmação explícita.

**Riscos:** nenhum funcional relevante; conferir que o redirect pós-exclusão que já existe continua funcionando.

**Critério de pronto:** clicar em "Excluir processo" abre o diálogo; cancelar não exclui nada; confirmar exclui normalmente.

---

### ✅ P1-2 · Arquivar/favoritar sem depender de swipe
**Domínio:** Acessibilidade · **Arquivos:** `src/features/processes/ProcessListView.jsx` (`ProcessRow`, ~56-96), `src/hooks/useSwipeReveal.js`.

**Objetivo:** tornar arquivar e favoritar alcançáveis por teclado/clique de mouse/leitor de tela, não só por gesto de swipe em touch.

**Passos:**
1. Adicionar um botão de ícone (ou menu "...") sempre visível/tabulável em cada linha, chamando os mesmos handlers `onArchiveProcess` e `onToggleFavorite` já usados pelo swipe.
2. Manter o swipe como atalho adicional em mobile, não como único caminho.
3. `aria-label` descritivo em cada botão (ex: "Arquivar processo", "Favoritar processo"); funcionar com Enter/Espaço.

**Riscos:** pode exigir ajuste de espaçamento na linha da lista para caber o novo controle.

**Critério de pronto:** arquivar e favoritar funcionam via clique/teclado em qualquer tamanho de tela, sem swipe.

---

### ✅ P1-3 · Painel de notificações e drawer mobile: Escape + foco
**Domínio:** Acessibilidade · **Arquivos:** `src/components/AppLayout.jsx` (~221-241, ~308-408, ~433-450).

**Objetivo:** painel de notificações e drawer mobile devem fechar com Escape, prender o foco enquanto abertos e devolver o foco ao botão que os abriu — igual ao que `Modal.jsx` já faz.

**Passos:**
1. Adicionar handler de `keydown` para Escape fechando o que estiver aberto.
2. Ao abrir, mover foco para o heading do painel/drawer ou primeiro item focável.
3. Ao fechar, devolver foco ao botão que abriu (sino / hambúrguer).
4. Aplicar `inert` (ou equivalente) no conteúdo principal enquanto o overlay estiver aberto.

**Riscos:** o Command Palette já teve um bug relacionado a bypass de backdrop (L27, corrigido em 2026-07-28) — testar que essa mudança não reabre esse conflito.

**Critério de pronto:** Escape fecha painel/drawer e devolve foco; Tab não escapa para trás do overlay.

---

### ✅ P1-4 · Lightbox de fotos (PostReceiptGallery) como diálogo de verdade
**Domínio:** Acessibilidade · **Arquivos:** `src/features/processes/PostReceiptGallery.jsx` (~17-19), `src/pages/ProcessesPage.jsx` (keydown handler, ~643-681). Avaliar reaproveitar `src/components/Modal.jsx`.

**Objetivo:** o lightbox precisa de semântica de diálogo e gerenciamento de foco.

**Passos:**
1. `role="dialog" aria-modal="true" aria-labelledby` no contêiner.
2. Mover foco para o botão de fechar (ou primeiro elemento focável) ao abrir.
3. Prender Tab dentro do lightbox enquanto aberto.
4. Devolver foco à miniatura que abriu o lightbox ao fechar.
5. Preferencialmente migrar para o componente `Modal` existente, que já resolve tudo isso — testar que Escape/setas de navegação entre fotos continuam funcionando após a migração.

**Critério de pronto:** abrir a galeria trava o foco dentro dela; Escape fecha e devolve foco à miniatura original.

---

### P1-5 · Contraste do rótulo "ETA atualizada" no modo escuro
**Domínio:** Cores · **Arquivos:** `src/styles.css` (~3611-3613, `.eta-detail-highlight .detail-label`).

**Objetivo:** corrigir contraste que hoje cai para ~2.5:1 no modo escuro.

**Passos:** trocar `color: rgba(0, 120, 100, 0.92)` (hardcoded) por um token de tema, ex. `var(--primary-700)`, e conferir contraste ≥4.5:1 nos dois temas.

**Critério de pronto:** contraste ≥4.5:1 em claro e escuro, validado com ferramenta de contraste.

---

### P1-6 · Contraste dos toasts success/warning
**Domínio:** Cores · **Arquivos:** `src/styles.css` (~1699-1710), `src/components/Toast.jsx` (~96, só referência).

**Objetivo:** texto branco sobre `toast--success`/`toast--warning` hoje mede ~4.04:1 e ~3.18:1 — abaixo de AA.

**Passos:** escurecer os backgrounds (tokens `-700` já existentes no projeto) até ≥4.5:1, mantendo consistência com `toast--error`/`toast--info`, que já passam. **Fazer junto com P2-14** (mesmo bloco de CSS).

**Critério de pronto:** os 4 tons de toast atingem ≥4.5:1 de contraste com o texto usado.

---

### P1-7 · Chip de filtro "Etapa: X" usando cor de aviso indevidamente
**Domínio:** Cores · **Arquivos:** `src/features/processes/ProcessListView.jsx` (~439-445).

**Objetivo:** o chip `variant="warning"` é aplicado sempre que qualquer etapa operacional está filtrada, mesmo etapas não urgentes.

**Passos:** trocar para `variant="info"` (ou `default`, igual aos demais chips da mesma linha).

**Critério de pronto:** o chip de etapa usa a mesma linguagem visual neutra dos outros chips de filtro.

---

### P1-8 · Empty state não deve mandar não-admin "cadastrar processo"
**Domínio:** Writing · **Arquivos:** `src/features/processes/ProcessListView.jsx` (~474-477, ~502-505).

**Objetivo:** usuário sem permissão de criar processo não deve ser instruído a fazê-lo.

**Passos:** usar a flag `isAdmin` já disponível (ver uso em `ProcessesPage.jsx:1397`) para diferenciar a segunda linha do texto — admin mantém "...ou cadastre um novo processo.", não-admin vira algo como "Ajuste a busca ou os filtros aplicados.".

**Critério de pronto:** usuário não-admin nunca vê sugestão de criar processo.

---

### P1-9 · Mensagem de erro específica enterrada em parênteses
**Domínio:** Writing · **Arquivos:** `src/pages/ProcessesPage.jsx` (`buildActionErrorMessage`, ~129-132, e ~10 pontos de uso: 513, 768, 984-995, 1059, 1112-1134, 1187, 1210, 1268-1269, 1333, 1349).

**Objetivo:** a mensagem acionável (ex: "máximo 6 imagens por observação") hoje vira parênteses depois de um prefixo genérico — precisa virar a frase principal.

**Passos:** se `error?.code` existir, manter formato atual (prefixo + código curto entre parênteses); se só existir `error?.message` (texto descritivo), usar esse texto como mensagem principal, sem o prefixo genérico na frente. Revisar os ~10 pontos de chamada.

**Riscos:** verificar se algum lugar faz parsing dessa string (log/telemetria) antes de mudar o formato.

**Critério de pronto:** erros com mensagem customizada aparecem como frase única e clara.

---

## Prioridade 2 — Achados incluídos no relatório (MEDIUM)

### P2-10 · Concordância de plural/gênero em três mensagens
**Domínio:** Writing · **Arquivos:** `src/pages/ProcessesPage.jsx` (~1087, ~1092-1093), `src/features/processes/ImportProcessesModal.jsx` (~133-136), `src/features/processes/ProcessMessagesPanel.jsx` (~88-90).

**Passos:**
- "Importados 1 processo." / "Importados N processos." e "N processos não puderam ser criados." (verbo concordando, hoje fica "não pôde ser criado" mesmo no plural).
- "(pulada)"/"(puladas)" seguindo a mesma condição já usada para "duplicada{s}".
- "Resta 1 mensagem disponível..." / "Restam N mensagens disponíveis..." (hoje fica "Restam 1 mensagens").

**Critério de pronto:** testar cada um com count=1 e count>1.

---

### P2-11 · Casing inconsistente dos rótulos de status ⚠️ risco de dados
**Domínio:** Writing · **Arquivos:** `src/features/processes/processStatus.js` (`processStatusOptions` ~1-14, `postCollectionStatusOptions` ~16-20).

**Objetivo:** unificar Title Case vs. sentence case misturados no mesmo dropdown/badge.

**⚠️ Antes de mexer:** confirmar se essas strings são usadas só como rótulo exibido ou também como valor persistido/comparado (Firestore, regras, filtros). Se forem valor persistido, mudar o texto pode quebrar processos já salvos ou regras do Firestore — nesse caso, separar `value` (não muda) de `label` (muda), se a estrutura permitir. Esse é exatamente o tipo de problema já registrado no projeto sobre labels espelhadas entre backend/frontend — reler esse contexto antes de tocar aqui.

**Critério de pronto:** rótulos consistentes; nenhum teste ou regra do Firestore quebrado; nenhum dado existente deixa de ser reconhecido pelos filtros/telas.

---

### P2-12 · Empty states sem `role="status"`
**Domínio:** Acessibilidade · **Arquivos:** `ProcessListView.jsx` (474-477, 502-505), `ProcessDetailView.jsx` (403-406, 441-444), `ProcessMessagesPanel.jsx` (37-40, 63-67), `ImportProcessesModal.jsx` (119-124), `CollectionWindowsEditor.jsx` (80-91).

**Passos:** trocar as divs ad hoc pelo componente `src/components/EmptyState.jsx` (já tem `role="status"`) onde o layout permitir; onde não for viável, adicionar `role="status"` direto na div.

**Critério de pronto:** os 5 locais anunciam mudança de estado para leitor de tela.

---

### P2-13 · `role="tab"` sem o modelo de teclado correspondente
**Domínio:** Acessibilidade · **Arquivos:** `ProcessListView.jsx` (~331-348, filtro segmentado mobile), `ProcessForm.jsx` (~663-676, wizard steps).

**Passos:** decidir — se forem abas de conteúdo de verdade, implementar roving `tabindex` (só a ativa com `tabIndex=0`) + Arrow keys; se forem só um grupo de botões, remover `role="tab"`/`tablist`/`aria-selected`.

**Critério de pronto:** comportamento de teclado coerente com o role usado.

---

### P2-14 · Toasts perdem cor semântica no modo escuro
**Domínio:** Cores · **Arquivos:** `src/styles.css` (`[data-theme='dark'] .toast` ~7341-7345 vs. `.toast--*` ~1699-1713).

**Objetivo:** a regra genérica de dark mode tem mais especificidade que as classes de tom, então os 4 tons colapsam para o mesmo cinza no escuro.

**Passos:** adicionar overrides `[data-theme='dark'] .toast--success/error/warning/info` com os tokens de tom escuro do projeto, com especificidade suficiente para vencer a regra genérica. **Fazer junto com P1-6.**

**Critério de pronto:** os 4 tons continuam visualmente distintos no modo escuro.

---

### P2-15 · Botões sem feedback de pressionar (`:active`)
**Domínio:** UI · **Arquivos:** `src/styles.css` (`.primary-button`/`.ghost-button`/`.danger-button`, ~2816-2838).

**Objetivo:** hoje só os botões do toolbar mobile de detalhe do processo (`styles.css:6475-6480`) têm `scale(0.98)` no `:active`; o resto do app não tem nenhum feedback tátil.

**Passos:** adicionar `transition` incluindo `scale` + `&:active:not(:disabled) { scale: 0.96 }` na regra base compartilhada; unificar/remover a regra específica se ficar redundante.

**Critério de pronto:** qualquer botão primary/ghost/danger do app dá feedback visual ao ser pressionado.

---

## Prioridade 3 — Opcional / polimento (ficaram fora do cap de 15, mas são reais)

Estes itens não bloqueiam o veredito da revisão. Priorizar conforme capacidade do time.

**Layout**
- Remover `marginBottom:'4px'` inline no heading da página Processos (`ProcessesPage.jsx:1357`), que aperta o padrão de 28px usado nas outras páginas.
- Dar affordance de scroll (peek do próximo card) no carrossel mobile do `WeeklyArrivalsCard` (`WeeklyArrivalsCard.jsx:327` + `styles.css:7777-7792`).
- Tornar a barra de ações do `ImportProcessesModal` fixa (sticky footer) para não sumir em conteúdo longo (`ImportProcessesModal.jsx:186-198`).
- *(baixa)* Resolver conflito `flex-wrap:wrap` herdado vs. `overflow-x:auto` em `.wizard-steps` (`ProcessForm.jsx:663`, `styles.css:3921-3929`).
- *(baixa)* Revisar alinhamento do header de 3 colunas no detalhe do processo em desktop (`ProcessDetailView.jsx:158-187`).

**Typography**
- Subir os dois `<select>` que ficam em 15px no mobile para 16px, evitando zoom automático do iOS Safari (`styles.css:4859-4877` e `:766-788`).
- Adicionar `white-space: nowrap` em `.status-tag` para status longos não quebrarem a pílula (`styles.css:2705-2714`).
- *(baixa)* Padronizar o `font-size: 0.85em` ad hoc em `.weekly-arrivals-windows__row/__label` para um token `--fs-*` existente (`styles.css:3804-3825`).
- *(baixa)* Adicionar `-webkit-font-smoothing`/`-moz-osx-font-smoothing` no `:root` (`styles.css:68-71`).
- *(baixa)* Adicionar `title` com valor completo no nome/e-mail truncados do topbar (`AppLayout.jsx:580-583`).

**Cores**
- Unificar a implementação de tom do canal DUIMP — existe uma versão genérica (`styles.css:3625-3639`) sem tratamento de dark mode e outra específica do dashboard (`styles.css:2241-2259`) que já resolve isso; usar a do dashboard como base para as duas.
- *(verificar antes)* Contraste borderline (~4.47:1) do par `.status-tag--warn` (`styles.css:2721-2724`), usado em 4 componentes — confirmar com ferramenta antes de escurecer o tom.

**UI/motion**
- Adicionar animação de saída ao fechar Modal/Toast/backdrop do sidebar mobile, espelhando o padrão já usado no painel de notificações e no swipe-to-dismiss do próprio Modal.
- Unificar a transição do filtro segmentado mobile (`.chegadas-segmented__item`, sem transition) com a do `.tab-button` (200ms).
- Mostrar spinner/estado de carregamento nos botões "Excluir processo" e "Exportar" (o componente `Spinner` já está importado em `ProcessesPage.jsx` e não é usado).
- ✅ *(baixa)* Trocar o ícone de favorito conforme o estado (preenchido vs. contorno), hoje só o texto muda (`ProcessListView.jsx:79-93`).

**Acessibilidade**
- Adicionar texto visível ao label do input de arquivo do `ImportProcessesModal` (~107-115), hoje depende só do texto padrão do navegador.
- Não fazer auto-dismiss de toasts de erro em 4s (ou pausar no hover/foco) — hoje não há outro registro persistente da falha em alguns fluxos (`Toast.jsx:13,38-40`).

**Writing**
- Unificar o texto do botão de editar processo ("Editar processo" vs. "Editar") no `ProcessDetailView.jsx:168-172`.
- Corrigir "Status coleta" → "Status de coleta" no botão do `ProcessDetailView.jsx:177`, para bater com o título da tela de destino.
- Corrigir acentuação em `ProcessesPage.jsx:984` ("maximo"→"máximo", "observacao"→"observação").
- *(baixa)* Expandir "Editar obs." → "Editar observações" (`ProcessDetailView.jsx:174`).
- *(baixa)* Alinhar capitalização do filtro "Coleta agendada" com o valor real "Coleta Agendada" (`processStatus.js:9`).
