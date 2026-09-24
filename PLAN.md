# PLAN: F17.2d-1 - Ajustes do QA do Lucas (Q2 cubagem FCL/CONSOL, Q3 ETD do transbordo, Q4 carga perigosa por item, Q5 "Embarque confirmado" no ETD)
**Repo:** PORTAL COMEX
**Base:** worktree `sq-comex-f17`, branch `feat/f17-2d-ajustes-qa` = `origin/main` `af46201` (F17.0-F17.3b mergeados). Este plano NAO cria branch nem commit. Numeros de linha lidos NESTE commit.
**Spec:** vault `Portal COMEX/Plano F17 — Detalhes operacionais por modal.md`, secao "## F17.2d — Ajustes do QA do Lucas (2026-09-24)" (Q1-Q8, decisoes confirmadas pelo Lucas).

**Contexto (6 linhas):** F17.2d foi DIVIDIDO: **este PR = F17.2d-1 (Q2, Q3, Q4, Q5)**; **F17.2d-2 (Q1, Q6, Q7, Q8 - POs objeto + mascara, janelas automaticas por conteiner, trava de remocao) esta no ANEXO** e sera replanejado (linhas relidas) apos o merge deste. Motivo: os dois blocos sao independentes (2d-1 = carga/transito/itens; 2d-2 = POs/coleta) e juntos passariam de ~25 arquivos com 3 zonas de risco (dual schema de coleta, mascara, notificacao). Deploy do Lucas continua UNICO (F17.3a + F17.3b + F17.2d-1 + F17.2d-2).
**Worktree antes deste plano:** `git status --porcelain` = `?? .claude/` e `?? PLAN.md` (este arquivo, sobrescrito; era o plano do F17.3b). Nenhum arquivo rastreado sujo. `CLAUDE.md` nao existe neste worktree (protocolo lido de `sq-comex-updates/CLAUDE.md`). **Baseline medido agora:** `npx vitest run` = 93 arquivos verdes / 7 skip, **1357 testes verdes / 245 skip**; `npm run audit:vault` = 23 checks, 0 mismatches, `isAdminProcessFields() = 76 campos`; `npm run lint` sai 0 (0 errors, so warnings).

**Escopo (DENTRO):** Q2 cubagem `volumeM3` editavel/gravada tambem em FCL e CONSOLIDADO (opcional, sem pendencia nova); Q3 campo novo `transshipmentEtd` (data, so com `transshipment`), allowlist admin 76 -> **77**; Q4 carga perigosa POR ITEM (`items[].dangerousGoods/unNumber/imoClass`), flag do processo derivada, legado de nivel-processo vira PENDENCIA (sem copia), campos de processo em leitura compat por 1 release, badge no card + exibicao por item no detalhe, notificacao por mudanca de IMO do item sem espuria no 1o save; Q5 checkbox "Embarque confirmado" ao lado do ETD (`shippedAt = etd`), sai o campo "Data de embarque" do passo Embarque e transito. **FORA:** Q1/Q6/Q7/Q8 (ANEXO, F17.2d-2); `migrateOperationalV2.mjs` (nenhum passo novo); marcos (`functions/src/process/milestones.js` intocado); Excel/import com colunas novas; FISPQ.

---

## Decisoes tomadas (o dev NAO rediscute; o reviewer confere)

**D-1 (Q5) - Sem campo novo.** "Embarque confirmado" = `hasText(shippedAt)` (derivado, nao gravado). Modulo novo ZERO imports `src/features/processes/shipmentConfirmation.js` (seguro para o mock fechado de `tests/ui/ProcessesPage.test.jsx:68-125`, que nao mocka este modulo). Exports:
- `getLocalDateKey(date)` - `YYYY-MM-DD` local (copia do padrao de `ProcessTransitFields.jsx:8-13`; PROIBIDO `toISOString()`).
- `isShipmentConfirmed(p)` = `String(p?.shippedAt ?? '').trim() !== ''`.
- `hasShipmentDateDivergence(p)` = confirmado E `shippedAt !== etd` (inclui ETD vazio).
- `applyShipmentConfirmation(draft, checked)`: `checked` e ETD vazio -> devolve `draft` intacto (no-op); `checked` -> `{ ...draft, shippedAt: draft.etd }`; `!checked` -> `{ ...draft, shippedAt: '' }`.
- `applyEtdEdit(draft, value)`: `next = { ...draft, etd: value }`; SO sincroniza `next.shippedAt = value` quando `isShipmentConfirmed(draft)` E `draft.shippedAt === draft.etd` (estava sincronizado) E `value` nao-vazio. Limpar o ETD NUNCA apaga `shippedAt` (evita regressao acidental do status).
- `isFutureShipment(p, today = getLocalDateKey(new Date()))` = confirmado E `shippedAt > today`.

**D-2 (Q5, doc legado com `shippedAt != etd`) - PRESERVA os dois, nada e reescrito.** Motivo: `shippedAt` gravado a mao pelo F17.2a e a data REAL; o ETD e estimativa. Sobrescrever qualquer um perde dado real, e mexer no ETD no 1o save geraria "ETD atualizada" espurio (`functions/src/core/shared.js:248-250`). Comportamento: checkbox aparece MARCADO; hint inline "Embarque registrado em dd/mm/aaaa (diferente do ETD)" + botao "Usar esta data como ETD" (chama `onDraftChange('etd', draft.shippedAt)` -> fica sincronizado). Enquanto divergente, editar o ETD NAO toca `shippedAt` (regra do `applyEtdEdit`). Desmarcar = acao explicita do admin -> `shippedAt = ''`. Marco `shipped` (`milestones.js:197-205`) inalterado: dispara so na transicao vazio -> preenchido; editar o ETD sincronizado depois NAO gera evento novo (mesma semantica atual).

**D-3 (Q4) - Chaves de IMO no item sao ESPARSAS.** `items[i]` so ganha `dangerousGoods: true, unNumber, imoClass` quando o item e perigoso; item nao-perigoso fica `{ id, commercialName, quantity[, poNumber] }` como hoje. Motivo: o resumo de notificacao compara `JSON.stringify(items)` cru (`shared.js:274`) - chaves `false/''` em todo item acusariam "itens vinculados atualizados" espurio no 1o save de todo legado (mesmo padrao do `poNumber` no F17.2c, `processesRepository.js:94-116`). Rules: `items` ja esta na allowlist e sem validacao de shape - nenhuma mudanca de rule para Q4.

**D-4 (Q4) - Helpers puros em `src/features/processes/operationalOptions.js`** (ja e zero imports e ja tem `normalizeUnNumber`/`normalizeImoClass`, linhas 31-45):
- `normalizeItemDangerousGoods(item)` -> `{}` se `item?.dangerousGoods !== true`; senao `{ dangerousGoods: true, unNumber: normalizeUnNumber(item.unNumber), imoClass: normalizeImoClass(item.imoClass) }`.
- `itemsHaveDangerousGoods(items)` = array com algum `item?.dangerousGoods === true`.
- `hasDangerousGoods(process)` = `process?.dangerousGoods === true || itemsHaveDangerousGoods(process?.items)` (badge/detalhe).
- `isLegacyProcessDangerousGoods(process)` = `process?.dangerousGoods === true && !itemsHaveDangerousGoods(process?.items)`.
- `resolveProcessDangerousGoods(current, nextItems)`: algum item perigoso em `nextItems` -> `{ dangerousGoods: true, unNumber: '', imoClass: '' }`; senao, se `current.items` TINHA item perigoso (flag era derivada, nao legado) -> `{ dangerousGoods: false, unNumber: '', imoClass: '' }`; senao -> `{ dangerousGoods: Boolean(current.dangerousGoods), unNumber: current.unNumber ?? '', imoClass: current.imoClass ?? '' }` (legado preservado).
- `getItemDangerousGoodsLabel(item)` -> `"Carga perigosa"` + `" · Classe <codigo>"` se `imoClass` + `" · ONU <n>"` se `unNumber`.

**D-5 (Q4) - Flag do processo DERIVADA na escrita; legado NAO e copiado.** No repositorio: `itemDangerous = itemsHaveDangerousGoods(items normalizados)`; `legacyDangerous = !itemDangerous && Boolean(raw.dangerousGoods)`; grava `dangerousGoods = itemDangerous || legacyDangerous`, `unNumber/imoClass = legacyDangerous ? normalizado : ''`. Ou seja: enquanto nenhum item for classificado, o trio de nivel-processo e mantido (compat de leitura 1 release, sem perda); ao classificar o 1o item, o trio de processo e zerado e a flag passa a refletir os itens. Pendencia nova `dangerousGoodsPerItem` ("Classificar carga perigosa por item") enquanto `isLegacyProcessDangerousGoods`. Para processo legado que NAO e perigoso de fato, o form mostra o botao "Descartar classificação do processo" (`onDraftChange('dangerousGoods', false)` -> pagina zera o trio). `dangerousGoods/unNumber/imoClass` de processo NAO estao em `sanitizeProcessForComparison` (`shared.js:304-368`) - derivar a flag nao notifica.

**D-6 (Q4, notificacao) - `items[]` comparavel ganha IMO com default.** `shared.js:360-366` passa a mapear tambem `dangerousGoods: item?.dangerousGoods === true`, `unNumber: normalizeString(item?.unNumber)`, `imoClass: normalizeString(item?.imoClass)`. Legado (sem chaves) x 1o save (esparso, D-3) -> JSON identico -> sem espuria; marcar/desmarcar IMO de um item -> notifica ("itens vinculados atualizados" via `shared.js:274`). Marcos: NAO se aplica (IMO nao e marco do spec).

**D-7 (Q2) - Cubagem opcional em FCL/CONSOLIDADO.** `sanitizeCargoAndTransitFields` (`processesRepository.js:391`) passa a aceitar `volumeM3` em `LCL`, `FCL` e `CONSOLIDADO`; UI em `ProcessCargoFields` so com o campo "Cubagem (m³)" para FCL/CONSOL (peso bruto continua so LCL/AEREO). Pendencia `volumeM3` (`pendingFields.js:151-158`) continua SO LCL (evita badge "Dados pendentes" novo em todo FCL/CONSOL de producao). Leitura (`ProcessOperationalDetails.jsx:106,150-155`) ja e agnostica de categoria.

**D-8 (Q3) - `transshipmentEtd` = data pura `YYYY-MM-DD`.** Gravado so com `transshipment` (`normalizeIsoDate`, senao `''`), payload fixo -> entra na allowlist (76 -> 77) e no create completo do emulador. Opcional (sem pendencia), fora da comparacao de notificacao (igual a `transshipmentPort`, que tambem nao esta la). Todos os modais.

**D-9 - Nenhum CSS novo.** Reusar `checkbox-field`, `detail-card`, `detail-card--split`, `inline-badge--warn`, `field-hint` (ja cobertos em mobile/tema escuro). Nenhum `.css` no diff.

---

## Arquivos afetados (todos confirmados via Glob/Grep neste commit)
- `src/features/processes/shipmentConfirmation.js` - **NOVO** (D-1).
- `src/features/processes/operationalOptions.js` (62 l.) - helpers de IMO por item (D-4).
- `src/features/processes/ProcessItemDangerousGoodsFields.jsx` - **NOVO**: bloco de carga perigosa de UM item (checkbox + Numero ONU com aviso `isValidUnNumber` + select `IMO_CLASS_OPTIONS`). Importa so `SelectField` e `./operationalOptions`.
- `src/features/processes/ProcessForm.jsx` (610 l.) - Q5 no passo "Datas e previsão" (l.221-288); hint do status (l.302-304); Q4 por item no passo "Itens" (l.445-494).
- `src/features/processes/ProcessCargoFields.jsx` (139 l.) - Q2 cubagem FCL/CONSOL; bloco IMO de processo (l.90-136) vira aviso de legado + "Descartar".
- `src/features/processes/ProcessTransitFields.jsx` (146 l.) - remove "Data de embarque" (l.8-19, 28-41); Q3 ETD do transbordo (l.132-142).
- `src/features/processes/ProcessOperationalDetails.jsx` (378 l.) - card "Carga perigosa" (l.171-179) por item + legado; card "Transbordo" (l.197-202) com ETD.
- `src/features/processes/ProcessDetailView.jsx` (518 l.) - aba Itens (l.416-421): badge IMO por item.
- `src/features/processes/ProcessListView.jsx` (581 l.) - chips do card (l.166-170): badge "Carga perigosa".
- `src/features/processes/pendingFields.js` (436 l.) - regras `unNumber`/`imoClass` (l.175-190) substituidas; label `shippedAt` (l.191-197).
- `src/pages/ProcessesPage.jsx` (**1585 l.**) - `emptyDraft` (l.133-156), `sanitizeProcessItems` (l.240-258), `handleDraftChange` (l.810-873).
- `src/services/processesRepository.js` (**1186 l.**) - `normalizeProcessItems` (l.97-116), `sanitizeCargoAndTransitFields` (l.364-400), `normalizeProcess` (l.563-589, 626), `toFirestorePayload` (l.693-719, 750).
- `functions/src/core/shared.js` (699 l.) - `sanitizeProcessForComparison` items (l.360-366) (D-6).
- `firestore.rules` (580 l.) - `isAdminProcessFields` (l.169-224): `+ 'transshipmentEtd'` + comentario F17.2d.
- `tests/fixtures/expected-counts.json` - `"transshipmentEtd"` entre `"transshipment"` e `"transshipmentPort"` (l.~214).
- `tests/scripts/audit-vault-counts.test.js` - l.158 `= 76 campos` -> `= 77 campos`.
- `tests/firebase/rules.structure.test.js` - novo caso `transshipmentEtd` (bloco l.173-190).
- `tests/firebase/rules.emulator.test.js` - create completo l.488 (76 -> 77, `transshipmentEtd: ''`) + caso "logistica NAO atualiza transshipmentEtd".
- `tests/unit/shipmentConfirmation.test.js` - **NOVO**.
- `tests/unit/operationalOptions.test.js` - casos dos helpers D-4.
- `tests/unit/pendingFields.test.js` - l.118-130 reescritos para as regras por item.
- `tests/services/processesRepository.test.js` - Q2/Q3/Q4 (l.371-425 e vizinhanca).
- `tests/ui/ProcessForm.test.jsx` - l.153-161 (shippedAt sai do Transito) + casos Q5/Q4/Q2/Q3.
- `tests/ui/ProcessDetailView.test.jsx`, `tests/ui/ProcessListView.test.jsx` - badge IMO.
- `tests/functions/createProcessUpdateNotifications.test.js` - casos D-6.

## Passos
1. **Puros (sem UI):** criar `shipmentConfirmation.js` (D-1) e os helpers D-4 em `operationalOptions.js`. Testes: `tests/unit/shipmentConfirmation.test.js` (marcar com/sem ETD; desmarcar; ETD sincronizado -> sincroniza; divergente -> NAO sincroniza; ETD limpo -> `shippedAt` mantido; `isFutureShipment` com `today` injetado) e `tests/unit/operationalOptions.test.js` (esparso; `resolveProcessDangerousGoods` nos 3 ramos; `isLegacyProcessDangerousGoods`; label).
2. **Repositorio** (`processesRepository.js`):
   a. `normalizeProcessItems` (l.102-113): `Object.assign(base, normalizeItemDangerousGoods(item))` depois do `poNumber`.
   b. `normalizeProcess`: calcular `const items = normalizeProcessItems(rawProcess.items, { category, purchaseOrders })` UMA vez ANTES de `sanitizeCargoAndTransitFields` (ids aleatorios - nao chamar 2x) e usar em l.626; passar `itemsHaveDangerousGoods: itemsHaveDangerousGoods(items)` e `transshipmentEtd: rawProcess.transshipmentEtd` para l.563-589. Mesmo em `toFirestorePayload` (l.693-719 e l.750).
   c. `sanitizeCargoAndTransitFields` (l.364-400): regra D-5 para `dangerousGoods/unNumber/imoClass`; `transshipmentEtd: transshipment ? normalizeIsoDate(process.transshipmentEtd) : ''`; `volumeM3` para LCL/FCL/CONSOLIDADO (D-7).
   d. Testes em `tests/services/processesRepository.test.js`: FCL grava `volumeM3`, AEREO zera; `transshipmentEtd` gravado so com transbordo; item perigoso -> chaves esparsas + processo `dangerousGoods: true` e trio de processo `''`; legado sem item perigoso -> trio preservado; item nao-perigoso SEM chaves IMO; payload tem `transshipmentEtd` definido.
3. **Rules + contagens:** `'transshipmentEtd'` na allowlist (junto de `'transshipmentPort'`, l.208) + comentario `// F17.2d-1: ETD do transbordo.`; fixture; `audit-vault-counts.test.js:158` -> 77; `rules.structure.test.js` (contem `transshipmentEtd`); `rules.emulator.test.js` (create 77 campos + logistica negada). Rodar `npm run audit:vault` (espera `= 77 campos`, 0 mismatches) e `npm run test:rules`.
4. **Notificacao (paridade functions):** `shared.js:360-366` conforme D-6. Testes em `tests/functions/createProcessUpdateNotifications.test.js`: (i) before legado `items:[{commercialName,quantity}]` x after com o mesmo item sem chaves IMO + `transshipmentEtd: ''` + `volumeM3: 0` -> NAO notifica; (ii) item passa a `dangerousGoods: true, imoClass: '3'` -> notifica com "itens vinculados atualizados"; (iii) so `dangerousGoods` de processo muda (derivacao) -> NAO notifica. Rodar `npm run test:notifications`.
5. **Pendencias** (`pendingFields.js`): remover as regras `unNumber`/`imoClass` (l.175-190) e adicionar (stage 0, todas as categorias, import de `./operationalOptions.js` com extensao): `dangerousGoodsPerItem` (field `dangerousGoods`, label "Classificar carga perigosa por item", `when: isLegacyProcessDangerousGoods`, `isMissing: () => true`); `itemUnNumber` (field `items`, "Número ONU do item", algum item perigoso sem `unNumber`); `itemImoClass` (field `items`, "Classe IMO do item", algum item perigoso sem `imoClass`). Label da regra `shippedAt` (l.194) -> "Embarque confirmado". Atualizar `tests/unit/pendingFields.test.js:118-130` + casos novos (legado -> `dangerousGoodsPerItem`; item classificado completo -> nenhuma; item sem ONU -> `itemUnNumber`).
6. **Pagina** (`ProcessesPage.jsx`):
   a. `emptyDraft` (l.133-156): `transshipmentEtd: ''`.
   b. `sanitizeProcessItems` (l.244-256): preservar cru `...(item?.dangerousGoods === true ? { dangerousGoods: true, unNumber: String(item.unNumber ?? '').trim(), imoClass: String(item.imoClass ?? '') } : {})`.
   c. `handleDraftChange` (l.810-873), ANTES da lista generica: `'etd'` -> `applyEtdEdit(current, value)`; `'shipmentConfirmed'` -> `applyShipmentConfirmation(current, Boolean(value))`; `'items'` -> `sanitizeDraft(current, { items: value, ...resolveProcessDangerousGoods(current, value) })` (e tirar `'items'` da lista da l.866); `'dangerousGoods'` com `value === false` -> `{ ...current, dangerousGoods: false, unNumber: '', imoClass: '' }`.
7. **Form / campos:**
   a. `ProcessForm.jsx` passo "Datas e previsão": envolver o ETD num `<div className="field">` com o input e, logo abaixo, `<label className="checkbox-field">` "Embarque confirmado" (`checked={isShipmentConfirmed(draft)}`, `disabled={!draft.etd && !isShipmentConfirmed(draft)}`, `onChange -> onDraftChange('shipmentConfirmed', checked)`); hint "Informe o ETD para confirmar o embarque." quando ETD vazio; aviso `inline-badge--warn` "Embarque confirmado com ETD no futuro." se `isFutureShipment`; bloco de divergencia D-2 com botao "Usar esta data como ETD". Hint do status (l.302-304) -> "Marque \"Embarque confirmado\" no passo Datas e previsão para o status avançar."
   b. `ProcessForm.jsx` passo "Itens" (dentro do card de cada item, depois do bloco PO l.473-491): `<ProcessItemDangerousGoodsFields item={item} onChange={(field, value) => onItemChange(item.id, field, value)} />`.
   c. `ProcessItemDangerousGoodsFields.jsx`: checkbox "Carga perigosa (IMO)"; se marcado, split com "Número ONU" (aviso "Número ONU deve ter 4 dígitos." igual a `ProcessCargoFields.jsx:111-117`) e "Classe IMO".
   d. `ProcessCargoFields.jsx`: FCL/CONSOL ganham card com "Cubagem (m³)" (mesmo input da l.38-48); bloco l.90-136 substituido: se `isLegacyProcessDangerousGoods(draft)` -> card "Carga perigosa (cadastro antigo)" com ONU/classe lidos (`getImoClassLabel`) + texto "Classifique a carga perigosa em cada item no passo Itens." + botao "Descartar classificação do processo"; senao nada (a classificacao e so por item).
   e. `ProcessTransitFields.jsx`: remover `getLocalDateKey`/`isFutureLocalDate`/campo "Data de embarque"; dentro do bloco de transbordo, split com o porto + "ETD do transbordo" (`type="date"`, `onDraftChange('transshipmentEtd', ...)`).
8. **Leitura:** `ProcessOperationalDetails.jsx` - card "Carga perigosa" se `hasDangerousGoods`: uma linha por item perigoso (`commercialName` + `getItemDangerousGoodsLabel`) e, se legado, "Cadastro antigo do processo: ONU x · Classe y"; card "Transbordo": `Sim — <porto>` + ` · ETD <dd/mm/aaaa>` via `formatDate` local (l.32-37). `ProcessDetailView.jsx` aba Itens: `<span className="inline-badge inline-badge--warn">{getItemDangerousGoodsLabel(item)}</span>` quando `item.dangerousGoods`. `ProcessListView.jsx` chips: `hasDangerousGoods(item)` -> `<span className="inline-badge inline-badge--warn">Carga perigosa</span>`.
9. **Testes de UI:** `ProcessForm.test.jsx` - substituir l.153-161 (Transito NAO tem mais "Data de embarque"; tem "ETD do transbordo" com transbordo marcado); Datas: marcar checkbox -> `onDraftChange('shipmentConfirmed', true)`; checkbox desabilitado sem ETD; divergencia mostra "Usar esta data como ETD"; Itens: checkbox IMO do item -> `onItemChange(id, 'dangerousGoods', true)`; FCL mostra "Cubagem (m³)"; legado mostra "Descartar classificação do processo". `ProcessDetailView.test.jsx` e `ProcessListView.test.jsx`: badge por item / "Carga perigosa". `ProcessesPage.test.jsx`: so ajustar se quebrar (mocks fechados nao incluem os modulos novos).
10. **Gates** (um por linha, sem `&&`) - ver Criterios.

## Criterios de aceite (cada um e um COMANDO)
- [ ] `npm test` sai 0 (pretest `audit-vault-counts` com `isAdminProcessFields() = 77 campos`, 0 mismatches; >= 1357 verdes, 0 falhas)
- [ ] `npx vitest run tests/unit/shipmentConfirmation.test.js tests/unit/operationalOptions.test.js tests/unit/pendingFields.test.js` sai 0
- [ ] `npx vitest run tests/services/processesRepository.test.js tests/functions/createProcessUpdateNotifications.test.js` sai 0
- [ ] `npx vitest run tests/ui/ProcessForm.test.jsx tests/ui/ProcessDetailView.test.jsx tests/ui/ProcessListView.test.jsx tests/ui/ProcessesPage.test.jsx` sai 0
- [ ] `npm run build` sai 0
- [ ] `npx vitest run tests/firebase/rules.structure.test.js` sai 0 (nao existe script npm "rules-structure")
- [ ] `npm run test:rules` sai 0 (emulador; create com 77 campos + logistica negada em `transshipmentEtd`)
- [ ] `npm run test:notifications` sai 0
- [ ] `npm run audit:vault` sai 0
- [ ] `npm run lint` sai 0
- [ ] `powershell -NoProfile -Command "if ((Get-Content src/features/processes/ProcessForm.jsx).Count -le 900) { exit 0 } else { exit 1 }"` sai 0
- [ ] `git diff --stat` toca SOMENTE os arquivos listados em "Arquivos afetados" (+ `PLAN.md`/`REVIEW.md`; nenhum `.css`, nenhum `scripts/*`, nenhum `functions/src/process/*`)

## Riscos
- **Arquivos >900 linhas (inevitavel):** `src/pages/ProcessesPage.jsx` (1585) - `emptyDraft`, `sanitizeProcessItems` e `handleDraftChange` so existem la; crescimento liquido esperado <= 25 linhas. `src/services/processesRepository.js` (1186) - toda normalizacao/payload vive la; nao extrair nada neste PR.
- **Notificacao espuria no 1o save de legado:** chaves IMO esparsas (D-3) e defaults na comparacao (D-6) sao o que evita. Caso (i) do passo 4 e obrigatorio. `transshipmentEtd`/`volumeM3` nao estao em `sanitizeProcessForComparison` - nao notificam.
- **Chamar `normalizeProcessItems` 2x** gera ids novos (`processesRepository.js:103-106`) -> "itens vinculados atualizados" espurio. Calcular uma vez (passo 2b).
- **Regressao de status por Q5:** limpar o ETD nao apaga `shippedAt` (D-1); desmarcar apaga (acao explicita). `deriveProcessStatus.js:82-92` (legado sem `shippedAt`) intocado.
- **Mock fechado de `tests/ui/ProcessesPage.test.jsx:68-125`:** nao adicionar export novo em `processLabels`, `processStatus`, `deriveProcessStatus`, `pendingFields`, `processCategories`, `utils/collectionWindows` - os helpers novos ficam em `shipmentConfirmation.js`/`operationalOptions.js` (nao mockados).
- **Rules:** mexe em `firestore.rules` (mandato deste plano: +1 chave na allowlist admin). Logistica INTOCADA (`isLogisticsCollectionStatusUpdate` l.318-329, `isLogisticsPostReceiptUpdate` l.282-309). Guardas de lista existentes (l.225-253) inalteradas.
- **Dual schema `collectionScheduledAt`/`collectionWindows`:** NAO tocado neste PR. Soft-delete/landed cost/scoring: nao se aplicam (Portal COMEX).
- **Vault:** o fixture muda (`transshipmentEtd`); `Inventário/Coleções.md` do vault (fora do repo) precisa ganhar o campo - tarefa do orquestrador, nao do dev.

## Fora de escopo
- Q1, Q6, Q7, Q8 (ANEXO - F17.2d-2).
- Pendencia de cubagem para FCL/CONSOL; pendencia de ETD do transbordo.
- Remover de vez `dangerousGoods/unNumber/imoClass` de nivel-processo (release seguinte, junto com `mapaStatus`).
- Passo de migracao (nenhum: Q4 legado vira pendencia na leitura; Q5 nao reescreve dado).
- Exportar IMO/transbordo no Excel; colunas novas no import de planilha.
- Qualquer mudanca em `milestones.js`, `deriveProcessStatus.js`, CSS, `CollectionWindowsEditor.jsx`, `ContainersEditor.jsx`, `PurchaseOrdersEditor.jsx`, `purchaseOrders.js`.
- Deploy (ZONA VERMELHA - do Lucas, lote unico F17.3a+F17.3b+F17.2d).

---

## ANEXO - F17.2d-2 (Q1, Q6, Q7, Q8) - planejar apos o merge do 2d-1 (reler linhas)

Decisoes ja fechadas para o 2d-2 (linhas lidas em `af46201`; o planner do 2d-2 revalida):

**Q6 - `purchaseOrders[]` vira `{ po, reference, supplierName }`.**
- `purchaseOrders.js` (78 l., zero imports): `normalizePurchaseOrders` aceita string OU objeto (string `s` -> `{ po: s, reference: '', supplierName: '' }`), trim, dedup case-insensitive por `po`, teto 50. Novo `getPurchaseOrderNumbers(list)` (strings) usado por `formatPurchaseOrdersSummary`, `normalizeItemPoNumber`, `clearRemovedPurchaseOrderLinks`, select de PO do item (`ProcessForm.jsx:476-486`) e `processLabels.js:22`. `items[].poNumber` continua referenciando `po` (string).
- **Migracao: NAO.** Compat de leitura converte strings; o 1o save grava objetos. Rules: `purchaseOrders` continua `is list` + `size() <= 50` (`firestore.rules:243-247`) - lista de maps passa; adicionar caso emulador "admin grava purchaseOrders como objetos".
- **Notificacao:** `shared.js:67-69` (`normalizePurchaseOrderList`) passa a extrair SO o `po` (string ou objeto). Referencia/fornecedor NAO notificam (sao dados mascarados; e o legado string x objeto fica JSON identico - sem espuria). Testes em `createProcessUpdateNotifications.test.js:531-600`.
- **Mascara:** helper `canSeePurchaseOrderDetails(canSeeName)` = `Boolean(canSeeName)` em `purchaseOrders.js` (NAO em `processLabels.js` - mock fechado em `ProcessesPage.test.jsx:103-107`). ATENCAO: `canShowProcessName` libera nome de CONSOLIDADO para todos (`processLabels.js:3,9-11`); a instrucao do Lucas e "admin/logistica veem" -> a mascara de `reference`/`supplierName` usa o ROLE (`canSeeName`), NAO `canShowProcessName`. Superficies: detalhe (`ProcessDetailView.jsx:244-249` vira lista PO · referencia · fornecedor), card (subtitulo continua so numeros de PO - nada a mascarar), Excel (`exportProcesses.js:59` + colunas "Referências das POs"/"Fornecedores das POs" vazias sem `canSeeName`), busca da pagina (`ProcessesPage.jsx:630`: `po` sempre, `reference`/`supplierName` so com `canSeeName`), busca global (`processesRepository.js:1158-1186` ganha `{ canSeeName }`, repassado por `useGlobalSearch.js:71`).
- **Editor** (`PurchaseOrdersEditor.jsx`, 93 l.): linha de adicao com PO + Referência + Fornecedor; Enter em qualquer input chama `handleAdd` (`preventDefault`); lista com `reference`/`supplierName` editaveis in-place (`po` nao renomeavel); remover por `po`.
- Pendencia nova `purchaseOrderSupplier` ("Fornecedor da PO", CONSOLIDADO, algum PO sem `supplierName`); `reference` opcional.

**Q1 - fornecedor sai do CONSOLIDADO.** `ProcessForm.jsx:173-192` esconde "Fornecedor" em CONSOLIDADO; `pendingFields.js:122-128` ganha `when: category !== 'CONSOLIDADO'`; `sanitizeCargoAndTransitFields` grava `supplierName: ''` em CONSOLIDADO; `ProcessIdentificationDetails` (`ProcessOperationalDetails.jsx:81-99`) nao mostra fornecedor de processo em CONSOLIDADO. **Nao perder dado:** na conversao de compat string -> objeto (so doc pre-Q6, todas as POs sem fornecedor), `supplierName` de cada PO e pre-preenchido com o `supplierName` de nivel-processo, que era o unico dado disponivel antes do Q1 (o admin corrige por PO). Diferente do Q4 (IMO por item nao e copiado por ser dado de seguranca), fornecedor nao e critico e zerar no 1o save perderia o dado em silencio. `supplierName` de processo nao esta na comparacao de notificacao - sem espuria.

**Q7 - janelas automaticas por conteiner (FCL/CONSOL com `containers.length >= 1`).** `CollectionWindowsEditor.jsx` (218 l.): uma linha por conteiner (rotulo `getContainerOptionLabel`), sem select de conteiner, sem "Adicionar container"/"Adicionar primeira janela"/"Remover". Helper puro `getContainerWindowRows(windows, containers)` em `containers.js` -> `[{ container, index, window|null }]` + janelas orfas legadas no fim (rotulo "Contêiner removido", unicas com "Remover"). Editar horario de linha sem janela CRIA a janela (`containerId`, `containerNumber = index+1`); limpar o horario de janela sem observacao REMOVE a janela; observacao desabilitada enquanto a linha nao tem janela. **Janelas vazias nunca sao persistidas pelo editor** - protege `hasScheduledCollection` (`firestore.rules:117-127`, que olha SO `collectionWindows[0].scheduledAt`) e a ordenacao por data de `normalizeCollectionWindows` (`utils/collectionWindows.js:54-57`, que com data vazia compara NaN). LCL/AEREO e FCL/CONSOL sem conteiner: comportamento atual (janela unica). `collectionScheduledAt` legado e logistica intocados.

**Q8 - conteiner com janela agendada nao pode ser removido.** Helper `isContainerRemovalLocked(containerId, windows)` em `containers.js` (janela com esse `containerId` e `scheduledAt` nao-vazio). `ContainersEditor.jsx:106-113` desabilita "Remover" + hint "Contêiner com coleta agendada — só pode ser editado."; `ProcessCargoFields` repassa `draft.collectionWindows`. Remove o aviso de janela orfa (`CollectionWindowsEditor.jsx:163-168`).

Arquivos previstos do 2d-2: `purchaseOrders.js`, `PurchaseOrdersEditor.jsx`, `processLabels.js`, `ProcessForm.jsx`, `ProcessCargoFields.jsx`, `ContainersEditor.jsx`, `CollectionWindowsEditor.jsx`, `containers.js`, `ProcessOperationalDetails.jsx`, `ProcessDetailView.jsx`, `pendingFields.js`, `ProcessesPage.jsx`, `processesRepository.js`, `exportProcesses.js`, `useGlobalSearch.js`, `functions/src/core/shared.js` + testes (`purchaseOrders`, `containers`, `pendingFields`, `processesRepository`, `ProcessForm`, `ProcessDetailView`, `exportProcesses`, `useGlobalSearch`, `createProcessUpdateNotifications`, `rules.emulator`). Sem mudanca de allowlist (continua 77). Gates: os mesmos deste plano.
