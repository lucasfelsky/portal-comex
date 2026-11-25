// S9-E do Relatório de Carga: várias NFs na conferência. A lista fica no MESMO campo `conference.nfNumber`, como
// texto separado por "; " (até 1.000 caracteres). Funções puras e sem imports (evita ciclo com cargoReportFormModel).
//
// Regras:
//   - Ao DIGITAR ou COLAR, `;`, `,`, quebra de linha e tab separam NFs (`splitCargoNfInput`).
//   - Ao LER o valor gravado, só `;` separa (`readCargoNfList`): um valor antigo de até 40 caracteres sem `;`
//     (inclusive "123, 124" ou "NF 12/1") é UMA NF, sem reinterpretar dado legado.
//   - Ponto, barra e hífen nunca separam ("000.123.456" é uma NF).
//   - Duplicada = mesma NF ignorando maiúsculas/minúsculas e espaços; zeros à esquerda contam ("000123" ≠ "123").

export const CARGO_NF_SEPARATOR = '; '
export const CARGO_NF_LIST_MAX_CHARS = 1000
export const CARGO_NF_MAX_CHARS = 40
export const CARGO_NF_MAX_COUNT = 100

// Caracteres invisíveis comuns ao colar do WhatsApp/PDF: espaço de largura zero (U+200B), não-juntador e juntador
// (U+200C, U+200D), junção de palavras (U+2060) e hífen condicional (U+00AD). São removidos; o BOM (U+FEFF) e o
// espaço sem quebra (U+00A0) já contam como espaço no `\s`.
const INVISIBLE_CHARS = /[​-‍⁠­]/g

// Remove invisíveis, apara as pontas e colapsa os espaços internos (inclusive quebras de linha, tabs e NBSP).
export function normalizeCargoNf(value) {
  return String(value ?? '')
    .replace(INVISIBLE_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Chave de duplicidade: sem diferença de caixa nem de espaços.
export function cargoNfKey(value) {
  return normalizeCargoNf(value).toLocaleLowerCase('pt-BR').replace(/\s+/g, '')
}

// Lista de NFs a partir do texto GRAVADO: só `;` separa. Sem vazias nem duplicadas (fica a 1ª). Tipo errado = [].
export function readCargoNfList(stored) {
  if (typeof stored !== 'string') return []
  const seen = new Set()
  const list = []
  for (const part of stored.split(';')) {
    const nf = normalizeCargoNf(part)
    if (!nf) continue
    const key = cargoNfKey(nf)
    if (seen.has(key)) continue
    seen.add(key)
    list.push(nf)
  }
  return list
}

// Pedaços de um texto DIGITADO/COLADO (sem normalizar, sem filtrar).
export function splitCargoNfInput(text) {
  return String(text ?? '').split(/[;,\n\r\t]+/)
}

export function formatCargoNfList(list) {
  return (Array.isArray(list) ? list : []).join(CARGO_NF_SEPARATOR)
}

// Acrescenta as NFs de `rawInput` à `list` (sem mutar nenhuma das duas). Nada é cortado ao meio:
//   - `tooLong`: NF com mais de 40 caracteres;
//   - `duplicates`: já está na lista ou apareceu antes no próprio texto colado;
//   - `overflow`: a NF que faria o texto passar de 1.000 caracteres (ou a lista de 100 NFs) e todas as seguintes;
//   - `rejected`: todas as recusadas, na ordem em que vieram.
export function addCargoNfs(list, rawInput) {
  const current = Array.isArray(list) ? list.slice() : []
  const keys = new Set(current.map(cargoNfKey))
  const result = { list: current, added: [], duplicates: [], tooLong: [], overflow: [], rejected: [] }
  let length = formatCargoNfList(current).length
  let full = false

  for (const piece of splitCargoNfInput(rawInput)) {
    const nf = normalizeCargoNf(piece)
    if (!nf) continue
    if (full) {
      result.overflow.push(nf)
      result.rejected.push(nf)
      continue
    }
    if (nf.length > CARGO_NF_MAX_CHARS) {
      result.tooLong.push(nf)
      result.rejected.push(nf)
      continue
    }
    const key = cargoNfKey(nf)
    if (keys.has(key)) {
      result.duplicates.push(nf)
      result.rejected.push(nf)
      continue
    }
    const nextLength = current.length === 0 ? nf.length : length + CARGO_NF_SEPARATOR.length + nf.length
    if (current.length >= CARGO_NF_MAX_COUNT || nextLength > CARGO_NF_LIST_MAX_CHARS) {
      full = true
      result.overflow.push(nf)
      result.rejected.push(nf)
      continue
    }
    keys.add(key)
    current.push(nf)
    result.added.push(nf)
    length = nextLength
  }
  return result
}

export function removeCargoNfAt(list, index) {
  return (Array.isArray(list) ? list : []).filter((_, position) => position !== index)
}

// Texto canônico a gravar/ler: lista lida (`;`), sem vazias nem duplicadas, no máximo 1.000 caracteres por NF
// INTEIRA (descarta do fim a NF que não cabe; defensivo: com a tela isso nunca acontece).
export function canonicalCargoNfText(stored) {
  const kept = []
  let length = 0
  for (const nf of readCargoNfList(stored)) {
    const nextLength = kept.length === 0 ? nf.length : length + CARGO_NF_SEPARATOR.length + nf.length
    if (nextLength > CARGO_NF_LIST_MAX_CHARS) break
    kept.push(nf)
    length = nextLength
  }
  return formatCargoNfList(kept)
}
