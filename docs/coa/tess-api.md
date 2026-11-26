# API da Tess usada na leitura de COA (resumo do contrato)

`TESS_CONTRACT_VERSION = 'docs.tess.im 2026-11-25'` (constante em `functions/src/process/tessClient.js`).

Fonte: páginas de referência de https://docs.tess.im lidas em 2026-11-25 (llms.txt, api-overview, api-quickstart, upload-file, process-file, delete-file, execute-agent, agent-response, errors, rate-limits, Privacy). `docs.tess.pareto.io` redireciona (301) para `docs.tess.im`.

Legenda: **[DOC]** = está escrito na documentação; **[OBS]** = OBSERVADO contra a API real (fluxo rodado à mão em 2026-11-26); **[INF]** = inferência do Portal, ainda NÃO confirmada contra a API real.

Este arquivo não contém chave, identificador de agente nem identificador de workspace da conta. Esses três valores vivem só no Secret Manager (`TESS_API_KEY`, `TESS_AGENT_ID`, `TESS_WORKSPACE_ID`).

## Base e autenticação
- [DOC] Base: `https://api.tess.im`. Sem número de versão nas páginas lidas.
- [DOC] `Authorization: Bearer <API_KEY>` (chave criada em "User Tokens" no painel da Tess).
- [DOC] Cabeçalho `x-workspace-id` OBRIGATÓRIO desde 2026-09-01. Sem ele: 403 (execute-agent) ou 422 (errors); a documentação diverge.

## POST /files (upload)
- [DOC] `multipart/form-data`; campo do arquivo `file`; parâmetro opcional `process` (boolean, padrão `false`; "this will consume credits"). **O Portal envia `process=true`** (campo de formulário `process` = `true`).
- [OBS 2026-11-26] Com `process=false` o upload devolve 201 `"status":"waiting"`, `credits: 0`, mas a execução do agente com esse arquivo falha com **422** `File <id> is not processed yet` (`errors.file_ids`): **a Tess EXIGE arquivo processado para o agente usá-lo**. A premissa anterior ("sem `process=true` para economizar créditos", decisão D-7 do plano S11-B) estava errada e está superada.
- [OBS 2026-11-26] Com `process=true` o upload devolve 201 já com `"status":"completed"` e `"credits":1` (~1 crédito por COA), sem espera nem consulta no caso observado (~35 s entre upload e processamento).
- [DOC] Resposta: `{ "id": <inteiro>, "object": "file", "bytes": ..., "filename": "...", "credits": 0, "status": "waiting" }`. O identificador é `id` (inteiro); NÃO existe `file_id`.
- [DOC] Limite de 32 MB por arquivo neste endpoint (200 MB via upload grande v2, não usado). Limite de armazenamento: **30 arquivos por workspace**.
- [DOC] Aceita PDF e imagens (jpg, jpeg, png, gif, bmp, svg, tiff, webp). O Portal envia só PDF, com nome genérico `coa.pdf`.
- [DOC] `DELETE /files/{fileId}` -> `{ "id": ..., "object": "file", "deleted": true }`.
- [INF] `GET /files/{id}` (página "Get File" não lida): o Portal só consulta se o upload NÃO vier `completed`; espera crescente 3, 5, 10, 15 s (mais o pacer de 1,1 s), no máximo 60 s e dentro do teto de 240 s. `completed` libera o execute; status com "fail"/"error" -> `tess-error` (estágio `process`); qualquer outro status continua esperando. A forma do corpo (objeto com `status` e `credits`, como o do upload) é inferida.

## POST /agents/{id}/execute
- [DOC] `id` inteiro do agente. Cabeçalhos: Authorization, x-workspace-id, Content-Type: application/json.
- [DOC] Corpo: `messages` (roles `user`/`assistant`/`developer`; `system` NÃO suportado), `file_ids` (array de inteiros), `waitExecution` (boolean, camelCase, padrão `false`; prazo documentado de 100 s), `temperature`, `model`, `tools`, `root_id`, `memory_collections`.
- [DOC] Resposta: `{ "template_id": "...", "responses": [{ "id": <inteiro>, "status": "starting", "input": "...", "output": "", "credits": 0.000337, "root_id": ... }] }`; o texto gerado vem em `responses[].output`.
- [OBS 2026-11-26] Com `waitExecution: true` e arquivo processado: 200 em ~25 s, `responses[0]` com `status: "succeeded"`, `input` (texto da mensagem + menção `@[coa.pdf](doc://file_...)`), `output` (texto com UM objeto JSON do schema do prompt), `credits` ~40,7, `root_id`, `created_at`, `updated_at`, `answers`, `template_id`, `generated_files: []`, `workspace_files: []`. O texto do JSON pode ter números com zeros à direita (`"value": 3750.00`, JSON válido). O Portal lê só `id`, `status`, `output` e `credits`. Fixture com dados inventados no mesmo formato: `tests/fixtures/coa/tessSamples.js` (`TESS_REAL_FORMAT_SAMPLE`).
- [OBS 2026-11-26] `DELETE /files/{id}` -> 200 `{ "id": "...", "object": "file", "deleted": true }` (o `id` volta como texto).
- [DOC] Sem `waitExecution` (ou passado o prazo) o status vem em andamento e `output` vazio; o resultado é consultado em `GET /agent-responses/{id}` (`succeeded` nos exemplos; a lista completa de status não é documentada).
- [INF] Concluído = `status == "succeeded"`, ou qualquer outro status que não indique falha com `output` preenchido. Em andamento = outro status com `output` vazio. Falha = status contendo "fail" ou "error" (-> `tess-error`).

## Erros, limites e custo
- [DOC] Erros: JSON `{ "error": "..." }` (422: `{ "message": "..." }`); códigos 200, 201, 400, 403, 413, 422, 429, 500.
- [DOC] Rate limit: **1 requisição por segundo por organização**, todos os endpoints; excedido -> 429 com `retry_after: 60`. O Portal espaça as requisições em >= 1,1 s dentro de uma instância única (`maxInstances: 1`, `concurrency: 1`).
- [DOC] Custo: campo `credits` na resposta (cálculo não explicado).
- [OBS 2026-11-26] Custo por COA: ~1 crédito (upload processado) + ~40,7 (execução) = ~41,7. O Portal grava em `tessCredits` = `credits` do ARQUIVO + `credits` da RESPOSTA DO AGENTE. Cada um é o custo acumulado do próprio objeto, não um incremento: para a resposta, vale o MAIOR valor visto entre o execute e as consultas `GET /agent-responses/{id}` (e, para o arquivo, entre o upload e a consulta de arquivo), então nada é somado duas vezes. (Antes do B2 a soma era `upload + execute + cada consulta`, que duplicaria o parcial do execute em andamento com o total da consulta; no caso observado o execute já volta `succeeded` com o total e não há consulta.)
- [DOC] Saída estruturada/JSON garantido: não encontrado. O Portal valida estritamente o texto de `output`.
- [DOC] Sem menção a OCR/visão para PDF escaneado nas páginas lidas (há páginas de OCR no índice, não lidas).

## Mapeamento de erros usado pelo cliente (`TessError.code`)
| Situação | Código | Origem |
|---|---|---|
| 401/403 | `tess-auth` | [DOC] |
| 422 que cita workspace/credencial/token/autorização | `tess-auth` | [INF] |
| 422 do execute "File ... is not processed yet" (ou arquivo não encontrado) | `tess-error` (httpStatus 422, estágio `execute` no log); **sem retry cego** | [OBS] |
| status de arquivo/resposta com "fail"/"error" | `tess-error` | [INF] |
| espera do processamento do arquivo estourou 60 s ou o prazo total | `tess-timeout` (estágio `process`) | local |
| 413 no upload com mensagem de tamanho (e arquivo > 32 MB) | `tess-too-large` | [INF] |
| 413 no upload sem mensagem de tamanho, arquivo < 32 MB | `tess-storage-full` | [INF] |
| 422 no upload que não é credencial | `tess-storage-full` | [INF] |
| 429 | `tess-rate-limit` (`retryAfterSeconds`, padrão 60) | [DOC] |
| 500/502/503/504 ou erro de rede | `tess-unavailable` | [DOC]/[INF] |
| abort por prazo | `tess-timeout` | local |
| JSON fora do esperado, `id` não inteiro, resposta > 1 MB | `tess-bad-response` | local |
| demais 4xx | `tess-error` | [INF] |
| `DELETE` com 404 | tratado como já apagado | [INF] |

## Diagnóstico nos logs (sem conteúdo)
O log estruturado da leitura (`Leitura de COA.`) leva, SÓ em falha, `stage` (`upload` | `process` | `execute` | `poll` | `delete`), `httpStatus` (número) e `errorCode` (código do `TessError`). Falha ao apagar o arquivo gera `warn` com `stage: 'delete'`. NUNCA corpo ou mensagem da resposta da Tess, nome de arquivo, produto, lote, PO, chave, workspace ou agente (testes em `tests/unit/coaReadRun.test.js` e `coaReadParse.test.js`). O estágio NÃO é gravado no documento `coaReads` (que segue com `error.code`): o cliente só lê esse documento e as regras não mudam.

## Orçamento de tempo (teto 240 s por leitura)
Upload processado: até 90 s (observado ~35 s com o processamento) -> espera do processamento SÓ se não vier `completed` (até 60 s, observado 0) -> execução com `waitExecution` até 110 s (observado ~25 s) -> consultas de resposta com espera 5, 10, 15, 20 s no que sobrar. Cada chamada é limitada também pelo tempo restante dos 240 s; o DELETE roda depois, em `finally`.

## Privacidade
- [DOC] "we do not use customer content to train Tess's own models."
- [DOC] Retenção e criptografia remetem a "Data Protection" (não lida). Prazo de retenção de arquivos e de execuções (o `output` fica nas respostas do agente): NÃO encontrado. Risco aceito pelo Lucas (plano, seção J).
- [DOC] Contatos: dpo@tess.im, support@tess.im.
- Medidas do Portal: só o PDF vai (nome `coa.pdf`, nenhuma informação do processo, mensagem `user` fixa); arquivo apagado na Tess ao fim de TODA leitura (`DELETE /files/{id}`); logs sem conteúdo. O processamento (`process=true`) é feito pela Tess sobre o mesmo PDF; não muda o que sai do Portal.

## Lacunas (não lidas; não bloqueiam)
Get File (corpo exato de `GET /files/{id}`), Upload Large File (v2), Data Protection (retenção), páginas de OCR.
