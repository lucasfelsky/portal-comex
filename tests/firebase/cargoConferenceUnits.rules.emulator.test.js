// Conferencia por item: `unitsByRowId`, `partialPallets` e `unloadByUnit` no doc `processes/{id}/cargoReport/conference`.
// Chaves OPCIONAIS (fora do hasAll) e "pegajosas" (gravadas, nao podem sumir); as rules so' validam tipo e tamanho.
// Roda com `npm run test:rules` (emulador; JDK 21). Sem FIRESTORE_EMULATOR_HOST o describe e' pulado.
// Dados 100% inventados (repositorio publico).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'

const HERE = dirname(fileURLToPath(import.meta.url))
const RULES_PATH = join(HERE, '..', '..', 'firestore.rules')
const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip

describeEmulator('firestore.rules: conferencia por item (unitsByRowId, partialPallets, unloadByUnit)', () => {
  let testEnv
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({ projectId: 'demo-sqcomex', firestore: { rules: readFileSync(RULES_PATH, 'utf8') } })
  })
  afterAll(async () => {
    if (testEnv) await testEnv.cleanup()
  })
  beforeEach(async () => {
    if (testEnv) await testEnv.clearFirestore()
  })

  const ctx = (uid, role, name) =>
    testEnv.authenticatedContext(uid, { email: `${uid}@sqquimica.com`, role, status: 'Ativo', name }).firestore()
  const admin = () => ctx('admin-1', 'admin', 'Admin')
  const logistics = () => ctx('log-1', 'logistica', 'Logistica')
  const seed = (fn) => testEnv.withSecurityRulesDisabled((c) => fn(c.firestore()))

  const PID = 'p-units'
  const CONF = `processes/${PID}/cargoReport/conference`
  const conference = (overrides = {}) => ({
    schemaVersion: 1,
    revision: 1,
    status: 'aberta',
    okByRowId: { 'r-0': true, 'r-1': false },
    countOkByRowId: { 'r-0': true, 'r-1': false },
    labelsByRowId: {},
    checkedByName: 'Logistica',
    receiptStatus: '',
    receivedDate: '',
    nfNumber: '',
    notes: '',
    unloadStartAt: '',
    unloadEndAt: '',
    labelingOk: false,
    closedDate: '',
    closedById: '',
    closedByName: '',
    closedDocumentId: '',
    updatedAt: serverTimestamp(),
    updatedById: 'log-1',
    updatedByName: 'Logistica',
    ...overrides,
  })
  const closedConference = (overrides = {}) =>
    conference({
      status: 'fechada',
      closedDate: '2026-11-24',
      closedById: 'log-1',
      closedByName: 'Logistica',
      closedDocumentId: 'doc-units',
      ...overrides,
    })
  const seedCurrent = async (status = 'rascunho') => {
    await seed((db) => setDoc(doc(db, `processes/${PID}`), { name: 'DEMO 001' }))
    await seed((db) =>
      setDoc(doc(db, `processes/${PID}/cargoReport/current`), {
        schemaVersion: 1,
        revision: 1,
        status,
        cargoType: 'FCL',
        rows: [],
        updatedAt: new Date('2026-11-01T10:00:00Z'),
        updatedById: 'admin-1',
        updatedByName: 'Admin',
      })
    )
  }
  const seedConference = (data) => seed((db) => setDoc(doc(db, CONF), { ...data, updatedAt: new Date('2026-11-01T11:00:00Z') }))

  const NEW = {
    unitsByRowId: { 'r-0': 12, 'r-1': 0 },
    partialPallets: [{ id: 'pp-1', parts: [{ rowId: 'r-0', units: 4 }, { rowId: 'r-1', units: 6 }] }],
    unloadByUnit: { 'CNT-1': { startAt: '2026-11-27T08:10', endAt: '2026-11-27T09:35' }, unica: { startAt: '', endAt: '' } },
  }
  const KEYS = Object.keys(NEW)
  // Chaves opcionais anteriores (S11): nos testes de pior caso de custo elas entram junto, como no payload real do app.
  const OLD_MAPS = {
    palletsByRowId: { 'r-0': 3 },
    damageByRowId: { 'r-0': { flagged: true, note: 'Tambor amassado', photos: [] } },
  }
  const sized = (count, make) => Array.from({ length: count }, (_, index) => make(index))

  it('doc antigo, sem as 3 chaves, continua gravando e e legivel', async () => {
    await seedCurrent()
    await seedConference(conference())
    await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ revision: 2 })))
    await assertSucceeds(getDoc(doc(admin(), CONF)))
  })

  it('as 3 chaves validas gravam e voltam intactas; vazias tambem passam', async () => {
    await seedCurrent()
    await assertSucceeds(setDoc(doc(logistics(), CONF), conference(NEW)))
    const snapshot = await assertSucceeds(getDoc(doc(admin(), CONF)))
    expect(snapshot.data()).toMatchObject(NEW)
    await assertSucceeds(
      setDoc(doc(logistics(), CONF), conference({ revision: 2, unitsByRowId: {}, partialPallets: [], unloadByUnit: {} }))
    )
  })

  it('cada chave isolada passa (as outras ficam ausentes)', async () => {
    for (const key of KEYS) {
      await testEnv.clearFirestore()
      await seedCurrent()
      await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ [key]: NEW[key] })))
    }
  })

  it('tipo errado falha (texto, numero, null; lista x mapa trocados)', async () => {
    await seedCurrent()
    for (const key of KEYS) {
      for (const wrong of ['x', 5, null, true]) {
        await assertFails(setDoc(doc(logistics(), CONF), conference({ [key]: wrong })))
      }
    }
    await assertFails(setDoc(doc(logistics(), CONF), conference({ unitsByRowId: [1] })))
    await assertFails(setDoc(doc(logistics(), CONF), conference({ unloadByUnit: [] })))
    await assertFails(setDoc(doc(logistics(), CONF), conference({ partialPallets: { 'pp-1': {} } })))
    await assertFails(setDoc(doc(logistics(), CONF), conference({ partialPallets: ['texto'] })))
    await assertFails(setDoc(doc(logistics(), CONF), conference({ partialPallets: [5] })))
  })

  it('tamanho acima do limite falha e no limite passa (units 200, parciais 50, unidades de descarga 50)', async () => {
    await seedCurrent()
    const units = (count) => Object.fromEntries(sized(count, (i) => [`r-${i}`, 1]))
    const partials = (count) => sized(count, (i) => ({ id: `pp-${i}`, parts: [{ rowId: 'r-0', units: 1 }] }))
    const unload = (count) => Object.fromEntries(sized(count, (i) => [`CNT-${i}`, { startAt: '', endAt: '' }]))
    await assertFails(setDoc(doc(logistics(), CONF), conference({ unitsByRowId: units(201) })))
    await assertFails(setDoc(doc(logistics(), CONF), conference({ partialPallets: partials(51) })))
    await assertFails(setDoc(doc(logistics(), CONF), conference({ unloadByUnit: unload(51) })))
    await assertSucceeds(
      setDoc(
        doc(logistics(), CONF),
        conference({ unitsByRowId: units(200), partialPallets: partials(50), unloadByUnit: unload(50) })
      )
    )
  })

  it('pegajosas: depois de gravadas, tirar qualquer uma das 3 chaves falha; mante-las (mesmo vazias) passa', async () => {
    await seedCurrent()
    await assertSucceeds(setDoc(doc(logistics(), CONF), conference(NEW)))
    // Bundle antigo: payload sem as chaves novas.
    await assertFails(setDoc(doc(logistics(), CONF), conference({ revision: 2 })))
    for (const key of KEYS) {
      const { [key]: _removed, ...rest } = NEW
      await assertFails(setDoc(doc(logistics(), CONF), conference({ revision: 2, ...rest })))
    }
    await assertSucceeds(
      setDoc(doc(logistics(), CONF), conference({ revision: 2, unitsByRowId: {}, partialPallets: [], unloadByUnit: {} }))
    )
  })

  it('doc antigo sem as chaves: o primeiro write novo cria as chaves e o seguinte nao pode tira-las', async () => {
    await seedCurrent()
    await seedConference(conference())
    await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ revision: 2, ...NEW })))
    await assertFails(setDoc(doc(logistics(), CONF), conference({ revision: 3 })))
  })

  it('chave desconhecida continua falhando (allowlist hasOnly)', async () => {
    await seedCurrent()
    await assertFails(setDoc(doc(logistics(), CONF), conference({ ...NEW, extra: 1 })))
  })

  it('admin reabre conferencia fechada com as chaves presentes (copia exata); alterar ou tirar as chaves falha', async () => {
    await seedCurrent('concluido')
    await seedConference(closedConference({ ...OLD_MAPS, ...NEW }))
    const reopened = (overrides = {}) =>
      conference({ ...OLD_MAPS, ...NEW, revision: 2, updatedById: 'admin-1', updatedByName: 'Admin', ...overrides })
    await assertFails(setDoc(doc(admin(), CONF), reopened({ unitsByRowId: { 'r-0': 99 } })))
    await assertFails(setDoc(doc(admin(), CONF), reopened({ partialPallets: [] })))
    await assertFails(setDoc(doc(admin(), CONF), reopened({ unloadByUnit: {} })))
    await assertFails(
      setDoc(doc(admin(), CONF), conference({ revision: 2, updatedById: 'admin-1', updatedByName: 'Admin' }))
    )
    await assertSucceeds(setDoc(doc(admin(), CONF), reopened()))
    const snapshot = await assertSucceeds(getDoc(doc(logistics(), CONF)))
    expect(snapshot.data()).toMatchObject({ status: 'aberta', ...OLD_MAPS, ...NEW })
  })

  // CUSTO (limite de 1000 expressoes por avaliacao das rules). O que vale e uma ESCRITA VALIDA falhar; a mensagem
  // "maximum of 1000 expressions" em negacoes legitimas e artefato do trace do emulador. As sondas A/B/C/D sao as escritas
  // reais do app: A = doc sem opcionais; B = doc ja com as 5 chaves; C = doc com so' o conjunto antigo (app atual, sem as
  // chaves novas); D = Salvar repetido em conferencia aberta.
  // MARGEM medida (emulador, 2026-11-27): padding de N x '&& (1 == 1)' em isValidCargoConferenceUnitKeys; A/B/C/D passam com
  // N = 14 e B/C falham com N = 15 (meta do review: N >= 12). Re-meca ao mexer em qualquer funcao do caminho de escrita.
  const TIMES = { unloadStartAt: '2026-11-27T08:10', unloadEndAt: '2026-11-27T09:35', receivedDate: '2026-11-27' }
  const seedClosable = async (resourceExtra) => {
    await seedCurrent('concluido')
    await seed((db) =>
      setDoc(doc(db, `processes/${PID}/documents/doc-units`), {
        type: 'cargoReport',
        slotKey: 'cargoReport',
        uploadedById: 'log-1',
        uploadedAt: new Date('2026-11-01T11:30:00Z'),
      })
    )
    await seedConference(conference({ ...TIMES, ...resourceExtra }))
  }
  const closeWith = (extra) => setDoc(doc(logistics(), CONF), closedConference({ revision: 2, ...TIMES, ...extra }))

  it('custo A: doc sem opcionais, logistica FECHA com as 5 chaves opcionais', async () => {
    await seedClosable({})
    await assertSucceeds(closeWith({ ...OLD_MAPS, ...NEW }))
  })

  it('custo B: doc JA com as 5 chaves, logistica FECHA com as 5 (pior caso real do app novo)', async () => {
    await seedClosable({ ...OLD_MAPS, ...NEW })
    await assertSucceeds(closeWith({ ...OLD_MAPS, ...NEW }))
  })

  it('custo C: doc so com palletsByRowId e damageByRowId, logistica FECHA SEM as chaves novas (app atual nao pode quebrar)', async () => {
    await seedClosable({ ...OLD_MAPS })
    await assertSucceeds(closeWith({ ...OLD_MAPS }))
  })

  it('custo D: Salvar repetido em conferencia ABERTA com resource e payload com as 5 chaves passa', async () => {
    await seedCurrent('concluido')
    await seedConference(conference({ ...OLD_MAPS, ...NEW }))
    await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ revision: 2, ...OLD_MAPS, ...NEW })))
    await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ revision: 3, ...OLD_MAPS, ...NEW })))
  })

  it('custo B: negativas com controle positivo (fechar com nome de outro ator ou documento alheio falha; o valido passa)', async () => {
    await seedClosable({ ...OLD_MAPS, ...NEW })
    await assertFails(closeWith({ ...OLD_MAPS, ...NEW, checkedByName: 'Outra Pessoa' }))
    await assertFails(closeWith({ ...OLD_MAPS, ...NEW, closedByName: 'Outra Pessoa' }))
    await assertFails(closeWith({ ...OLD_MAPS, ...NEW, closedById: 'outro-uid' }))
    // Equivalencia do corte de custo (nomes comparados com updatedByName): ator com updatedByName e nomes iguais entre si, mas != claim, nega.
    const outro = { checkedByName: 'Outra Pessoa', closedByName: 'Outra Pessoa', updatedByName: 'Outra Pessoa' }
    await assertFails(closeWith({ ...OLD_MAPS, ...NEW, ...outro }))
    await assertFails(closeWith({ ...OLD_MAPS, ...NEW, updatedByName: 'Outra Pessoa' }))
    await assertFails(closeWith({ ...OLD_MAPS, ...NEW, closedDocumentId: 'doc-inexistente' }))
    await assertSucceeds(closeWith({ ...OLD_MAPS, ...NEW }))
  })

  it('regressao: logistica nao grava conferencia ja fechada (nem com as chaves novas); delete negado', async () => {
    await seedCurrent('concluido')
    await seedConference(closedConference({ ...NEW }))
    await assertFails(setDoc(doc(logistics(), CONF), conference({ revision: 2, ...NEW })))
    await assertFails(setDoc(doc(logistics(), CONF), closedConference({ revision: 2, ...NEW })))
    await assertFails(deleteDoc(doc(admin(), CONF)))
  })
})
