// S11-C (D-20): selo da leitura automática do COA na lista de COAs (só admin). Puro.
// Sem leitura, ou leitura em andamento: sem selo (null).

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural
}

export function describeReadBadge(read) {
  if (!read) return null
  if (read.status === 'failed') return { text: 'Falhou: tente de novo', tone: ' inline-badge--warn' }
  if (read.status !== 'done') return null
  if (read.documentType === 'not_coa') return { text: 'Não é COA', tone: '' }
  const count = read.certificates.length
  return {
    text: `Lido · ${count === 0 ? 'nenhum certificado' : `${count} ${pluralize(count, 'certificado', 'certificados')}`}`,
    tone: ' inline-badge--ok',
  }
}
