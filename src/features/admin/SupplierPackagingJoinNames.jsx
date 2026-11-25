import { useId, useState } from 'react'

// S9-D: "Juntar nomes" do cadastro de embalagens por fornecedor. O Portal reconhece o fornecedor pelo nome sem acento,
// em maiúsculas e sem pontuação; nomes que ainda diferem (ex.: GOOYER CHEMICAL CO e GOOYER CHEMICALS LTD) o admin
// junta aqui. Os parecidos aparecem só como SUGESTÃO: quem junta é o admin. Um nível, sem ciclo.

const formatCount = (value) => Number(value ?? 0).toLocaleString('pt-BR')

// `names`: [{ key, name, entryCount, joined: [{ fromKey, name }] }]; `suggestions`: [{ word, keys }];
// `onJoin(fromKeys, toKey)`: Promise<boolean> (true = juntou).
export default function SupplierPackagingJoinNames({ names, suggestions, busy, onJoin }) {
  const titleId = useId()
  const keepId = useId()
  const [selected, setSelected] = useState([])
  const [keepKey, setKeepKey] = useState('')

  const byKey = new Map(names.map((item) => [item.key, item]))
  const chosen = selected.filter((key) => byKey.has(key))
  const keep = chosen.includes(keepKey) ? keepKey : (chosen[0] ?? '')
  const canJoin = chosen.length >= 2 && !busy

  function toggle(key) {
    setSelected((current) => (current.includes(key) ? current.filter((value) => value !== key) : [...current, key]))
  }

  async function handleJoin() {
    if (!canJoin) return
    const joined = await onJoin(
      chosen.filter((key) => key !== keep),
      keep
    )
    if (joined) setSelected([])
  }

  return (
    <section className="spc-join" aria-labelledby={titleId}>
      <h4 id={titleId}>Juntar nomes</h4>
      <p className="field-hint">
        O Portal compara o fornecedor sem acento, em maiúsculas e sem pontuação. Nomes que ainda diferem valem como um só
        depois de juntados: marque os nomes, escolha o que fica e clique em Juntar.
      </p>

      {names.length < 2 ? (
        <p className="field-hint">Ainda não há dois nomes de fornecedor para juntar.</p>
      ) : (
        <>
          {suggestions.length > 0 ? (
            <ul className="spc-suggest" aria-label="Nomes parecidos (sugestão)">
              {suggestions.map((group) => (
                <li key={group.word}>
                  <span>
                    Parecidos: <b>{group.keys.map((key) => byKey.get(key)?.name ?? key).join(' · ')}</b>
                  </span>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => setSelected(group.keys.filter((key) => byKey.has(key)))}
                  >
                    Selecionar
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <ul className="spc-names">
            {names.map((item) => (
              <li key={item.key}>
                <label>
                  <input
                    type="checkbox"
                    checked={chosen.includes(item.key)}
                    disabled={busy}
                    onChange={() => toggle(item.key)}
                    aria-label={`Juntar ${item.name}`}
                  />
                  <span>
                    <b>{item.name}</b>
                    <small>
                      {`${formatCount(item.entryCount)} ${item.entryCount === 1 ? 'embalagem' : 'embalagens'}`}
                      {item.joined.length > 0 ? ` · já inclui ${item.joined.map((join) => join.name).join(', ')}` : ''}
                    </small>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="spc-join__bar">
            <div className="field">
              <label htmlFor={keepId}>Nome que fica</label>
              <select
                id={keepId}
                value={keep}
                disabled={chosen.length < 2 || busy}
                onChange={(event) => setKeepKey(event.target.value)}
              >
                {chosen.length < 2 ? <option value="">Marque 2 nomes ou mais</option> : null}
                {chosen.map((key) => (
                  <option key={key} value={key}>
                    {byKey.get(key)?.name ?? key}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="primary-button" disabled={!canJoin} onClick={handleJoin}>
              {busy ? 'Juntando…' : 'Juntar'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
