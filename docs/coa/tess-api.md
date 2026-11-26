# API da Tess usada na leitura de COA (resumo do contrato)

`TESS_CONTRACT_VERSION = 'docs.tess.im 2026-11-25'` (constante em `functions/src/process/tessClient.js`).

Fonte: páginas de referência de https://docs.tess.im lidas em 2026-11-25 (llms.txt, api-overview, api-quickstart, upload-file, process-file, delete-file, execute-agent, agent-response, errors, rate-limits, Privacy). `docs.tess.pareto.io` redireciona (301) para `docs.tess.im`.

Legenda: **[DOC]** = está escrito na documentação; **[INF]** = inferência do Portal, ainda NÃO confirmada contra a API real (a fatia D do plano confirma com COAs reais).

Este arquivo não contém chave, identificador de agente nem identificador de workspace da conta. Esses três valores vivem só no Secret Manager (`TESS_API_KEY`, `TESS_AGENT_ID`, `TESS_WORKSPACE_ID`).

## Base e autenticação
- [DOC] Base: `https://api.tess.im`. Sem número de versão nas páginas lidas.
- [DOC] `Authorization: Bearer <API_KEY>` (chave criada em "User Tokens" no painel da Tess).
- [DOC] Cabeçalho `x-workspace-id` OBRIGATÓRIO desde 2026-09-01. Sem ele: 403 (execute-agent) ou 422 (errors); a documentação diverge.

## POST /files (upload)
- [DOC] `multipart/form-data`; campo do arquivo `file`; parâmetro opcional `process` (boolean, padrão `false`; "this will consume credits"). O Portal NÃO envia `process`.
- [DOC] Resposta: `{ "id": <inteiro>, "object": "file", "bytes": ..., "filename": "...", "credits": 0, "status": "waiting" }`. O identificador é `id` (inteiro); NÃO existe `file_id`.
- [DOC] Limite de 32 MB por arquivo neste endpoint (200 MB via upload grande v2, não usado). Limite de armazenamento: **30 arquivos por workspace**.
- [DOC] Aceita PDF e imagens (jpg, jpeg, png, gif, bmp, svg, tiff, webp). O Portal envia só PDF, com nome genérico `coa.pdf`.
- [DOC] `DELETE /files/{fileId}` -> `{ "id": ..., "object": "file", "deleted": true }`.
- [INF] A documentação não diz se a execução do agente exige `process=true`. O Portal não usa; se o teste real mostrar que o escaneado só funciona com `process=true`, a decisão é do Lucas (custo).

## POST /agents/{id}/execute
- [DOC] `id` inteiro do agente. Cabeçalhos: Authorization, x-workspace-id, Content-Type: application/json.
- [DOC] Corpo: `messages` (roles `user`/`assistant`/`developer`; `system` NÃO suportado), `file_ids` (array de inteiros), `waitExecution` (boolean, camelCase, padrão `false`; prazo documentado de 100 s), `temperature`, `model`, `tools`, `root_id`, `memory_collections`.
- [DOC] Resposta: `{ "template_id": "...", "responses": [{ "id": <inteiro>, "status": "starting", "input": "...", "output": "", "credits": 0.000337, "root_id": ... }] }`; o texto gerado vem em `responses[].output`.
- [DOC] Sem `waitExecution` (ou passado o prazo) o status vem em andamento e `output` vazio; o resultado é consultado em `GET /agent-responses/{id}` (`succeeded` nos exemplos; a lista completa de status não é documentada).
- [INF] Concluído = `status == "succeeded"`, ou qualquer outro status que não indique falha com `output` preenchido. Em andamento = outro status com `output` vazio. Falha = status contendo "fail" ou "error" (-> `tess-error`).

## Erros, limites e custo
- [DOC] Erros: JSON `{ "error": "..." }` (422: `{ "message": "..." }`); códigos 200, 201, 400, 403, 413, 422, 429, 500.
- [DOC] Rate limit: **1 requisição por segundo por organização**, todos os endpoints; excedido -> 429 com `retry_after: 60`. O Portal espaça as requisições em >= 1,1 s dentro de uma instância única (`maxInstances: 1`, `concurrency: 1`).
- [DOC] Custo: campo `credits` na resposta (cálculo não explicado). O Portal soma `credits` do upload, da execução e das consultas em `tessCredits`.
- [DOC] Saída estruturada/JSON garantido: não encontrado. O Portal valida estritamente o texto de `output`.
- [DOC] Sem menção a OCR/visão para PDF escaneado nas páginas lidas (há páginas de OCR no índice, não lidas).

## Mapeamento de erros usado pelo cliente (`TessError.code`)
| Situação | Código | Origem |
|---|---|---|
| 401/403 | `tess-auth` | [DOC] |
| 422 que cita workspace/credencial/token/autorização | `tess-auth` | [INF] |
| 413 no upload com mensagem de tamanho (e arquivo > 32 MB) | `tess-too-large` | [INF] |
| 413 no upload sem mensagem de tamanho, arquivo < 32 MB | `tess-storage-full` | [INF] |
| 422 no upload que não é credencial | `tess-storage-full` | [INF] |
| 429 | `tess-rate-limit` (`retryAfterSeconds`, padrão 60) | [DOC] |
| 500/502/503/504 ou erro de rede | `tess-unavailable` | [DOC]/[INF] |
| abort por prazo | `tess-timeout` | local |
| JSON fora do esperado, `id` não inteiro, resposta > 1 MB | `tess-bad-response` | local |
| demais 4xx | `tess-error` | [INF] |
| `DELETE` com 404 | tratado como já apagado | [INF] |

## Privacidade
- [DOC] "we do not use customer content to train Tess's own models."
- [DOC] Retenção e criptografia remetem a "Data Protection" (não lida). Prazo de retenção de arquivos e de execuções (o `output` fica nas respostas do agente): NÃO encontrado. Risco aceito pelo Lucas (plano, seção J).
- [DOC] Contatos: dpo@tess.im, support@tess.im.
- Medidas do Portal: só o PDF vai (nome `coa.pdf`, nenhuma informação do processo, mensagem `user` fixa); arquivo apagado na Tess ao fim de TODA leitura (`DELETE /files/{id}`); logs sem conteúdo.

## Lacunas (não lidas; não bloqueiam)
Get File (status do arquivo), Upload Large File (v2), Data Protection (retenção), páginas de OCR.
