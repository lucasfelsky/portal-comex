// S10-J1b: fotos de avaria de um item (CargoConferencePhotoBlock + CargoPhotoViewer) com os hooks reais e o serviço mockado.
// Câmera (capture), anexo, progresso, falha de rede com "Tentar de novo", remover, limite 5/30, visualizador e somente
// leitura.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockPrepare = vi.fn()
const mockUpload = vi.fn()
const mockDeleteOwn = vi.fn()
const mockDownload = vi.fn()

vi.mock('../../src/features/processes/cargoPhotoResize', async (importOriginal) => ({
  ...(await importOriginal()),
  prepareCargoPhoto: (...args) => mockPrepare(...args),
}))
vi.mock('../../src/services/cargoConferencePhotosRepository', () => ({
  uploadCargoConferencePhoto: (...args) => mockUpload(...args),
  deleteOwnCargoConferencePhotoFiles: (...args) => mockDeleteOwn(...args),
  downloadCargoConferencePhotoBlob: (...args) => mockDownload(...args),
}))

import { addCargoPhoto, removeCargoPhoto } from '../../src/features/processes/cargoConferencePhotos'
import CargoConferencePhotoBlock from '../../src/features/processes/CargoConferencePhotoBlock'
import useCargoPhotoUploads from '../../src/features/processes/useCargoPhotoUploads'
import { clearCargoPhotoCache } from '../../src/features/processes/useCargoPhotoUrls'

const photo = (id) => ({
  id,
  path: `processes/p1/cargo-conference/r-1/1-u1-${id}.jpg`,
  thumbPath: `processes/p1/cargo-conference/r-1/1-u1-${id}-t.jpg`,
  width: 1600,
  height: 1200,
  size: 100,
  uploadedAt: 1,
  byId: 'u1',
})

const withPhotos = (count, rowId = 'r-1') => ({
  damageByRowId: {
    [rowId]: { flagged: true, note: '', photos: Array.from({ length: count }, (_, index) => photo(`s${index + 1}`)) },
  },
})

const prepared = () => ({
  full: { blob: new Blob(['f']), width: 1600, height: 1200 },
  thumb: { blob: new Blob(['t']), width: 400, height: 300 },
})

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function Harness({ initial = { damageByRowId: {} }, editable = true, variant = 'mobile', onState }) {
  const [conference, setConference] = useState(initial)
  onState?.(conference)
  const uploads = useCargoPhotoUploads({
    processId: 'p1',
    uid: 'u1',
    conference,
    enabled: editable,
    onUploaded: (rowId, saved) => setConference((current) => addCargoPhoto(current, rowId, saved)),
  })
  const tools = {
    processId: 'p1',
    ...uploads,
    remove: (rowId, photoId) => setConference((current) => removeCargoPhoto(current, rowId, photoId)),
  }
  return (
    <CargoConferencePhotoBlock
      tools={tools}
      rowId="r-1"
      number={1}
      title="POLIOL PE-3000"
      photos={conference.damageByRowId['r-1']?.photos ?? []}
      editable={editable}
      variant={variant}
    />
  )
}

const jpeg = (name = 'avaria.jpg') => new File(['x'], name, { type: 'image/jpeg' })
const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL
let urlCounter

beforeEach(() => {
  clearCargoPhotoCache()
  mockPrepare.mockReset()
  mockUpload.mockReset()
  mockDeleteOwn.mockReset()
  mockDownload.mockReset()
  mockPrepare.mockImplementation(async () => prepared())
  mockDownload.mockImplementation(async () => new Blob(['img']))
  mockDeleteOwn.mockResolvedValue(0)
  urlCounter = 0
  URL.createObjectURL = vi.fn(() => `blob:foto-${(urlCounter += 1)}`)
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
  vi.restoreAllMocks()
})

const cameraInput = () => screen.getByLabelText('Foto da câmera do item 1')
const fileInput = () => screen.getByLabelText('Arquivos de foto do item 1')

describe('botões e campos de arquivo', () => {
  it('celular: "Tirar foto" abre a câmera traseira (capture) e "Anexar" aceita várias imagens, sem capture', () => {
    render(<Harness />)
    expect(cameraInput()).toHaveAttribute('accept', 'image/*')
    expect(cameraInput()).toHaveAttribute('capture', 'environment')
    expect(cameraInput()).not.toHaveAttribute('multiple')
    expect(fileInput()).toHaveAttribute('accept', 'image/*')
    expect(fileInput()).toHaveAttribute('multiple')
    expect(fileInput()).not.toHaveAttribute('capture')
    expect(screen.getByText('Fotos e avaria deste item')).toBeInTheDocument()
    expect(screen.getByText('0 de 5 fotos')).toBeInTheDocument()
  })

  it('o nome acessível dos botões contém o texto visível e o botão abre o campo certo', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const camera = screen.getByRole('button', { name: 'Tirar foto do item 1' })
    const attach = screen.getByRole('button', { name: 'Anexar fotos ao item 1' })
    expect(camera).toHaveTextContent('Tirar foto')
    expect(attach).toHaveTextContent('Anexar')
    expect(camera.getAttribute('aria-label')).toContain(camera.textContent.trim())
    expect(attach.getAttribute('aria-label')).toContain(attach.textContent.trim())
    const clickCamera = vi.spyOn(cameraInput(), 'click')
    const clickFile = vi.spyOn(fileInput(), 'click')
    await user.click(camera)
    await user.click(attach)
    expect(clickCamera).toHaveBeenCalledTimes(1)
    expect(clickFile).toHaveBeenCalledTimes(1)
  })

  it('computador: sem "Tirar foto" nem campo de câmera; só "Anexar foto"', () => {
    render(<Harness variant="desktop" />)
    expect(screen.queryByRole('button', { name: /Tirar foto/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Foto da câmera do item 1')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anexar foto ao item 1' })).toHaveTextContent('Anexar foto')
    expect(fileInput()).toHaveAttribute('multiple')
  })
})

describe('envio', () => {
  it('foto escolhida: progresso anunciado, miniatura com o blob local (sem baixar) e a foto fica no item', async () => {
    const user = userEvent.setup()
    const gate = deferred()
    let report
    mockUpload.mockImplementation((_process, _row, _prepared, options) => {
      report = options.onProgress
      return gate.promise
    })
    let latest
    render(<Harness onState={(value) => (latest = value)} />)
    await user.upload(cameraInput(), jpeg())
    expect(await screen.findByText('Enviando foto… 0%')).toBeInTheDocument()
    expect(document.querySelector('[aria-live="polite"]')).toContainElement(screen.getByText('Enviando foto… 0%'))
    report(40)
    expect(await screen.findByText('Enviando foto… 40%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Envio da foto do item 1' })).toHaveAttribute('value', '40')

    gate.resolve(photo('novo'))
    const image = await screen.findByRole('img', { name: 'Foto 1 do item 1' })
    expect(image).toHaveAttribute('src', expect.stringMatching(/^blob:foto-/))
    expect(mockDownload).not.toHaveBeenCalled()
    expect(latest.damageByRowId['r-1'].photos.map((item) => item.id)).toEqual(['novo'])
    expect(latest.damageByRowId['r-1'].flagged).toBe(true)
    expect(screen.queryByText(/Enviando foto/)).not.toBeInTheDocument()
    expect(screen.getByText('1 de 5 fotos')).toBeInTheDocument()
  })

  it('falha de rede: mensagem, "Tentar de novo" reenvia sem reduzir de novo e a foto entra', async () => {
    const user = userEvent.setup()
    mockUpload.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    mockUpload.mockResolvedValueOnce(photo('novo'))
    render(<Harness />)
    await user.upload(fileInput(), jpeg())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Sem conexão. A foto não foi enviada: confira o sinal e toque em Tentar de novo.')

    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('img', { name: 'Foto 1 do item 1' })).toBeInTheDocument()
    expect(mockPrepare).toHaveBeenCalledTimes(1)
    expect(mockUpload).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('foto ilegível: mensagem de HEIC/JPG, sem "Tentar de novo"; "Dispensar" libera a vaga', async () => {
    const user = userEvent.setup()
    mockPrepare.mockRejectedValueOnce(
      Object.assign(new Error('Não foi possível ler esta foto. Tire de novo ou escolha uma foto JPG ou PNG.'), {
        code: 'cargoPhoto/unreadable',
      })
    )
    render(<Harness />)
    await user.upload(fileInput(), new File(['x'], 'IMG_9.heic', { type: 'image/heic' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ou escolha uma foto JPG ou PNG.')
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dispensar' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('"Cancelar envio" aborta o envio em andamento', async () => {
    const user = userEvent.setup()
    let signal
    mockUpload.mockImplementation((_process, _row, _prepared, options) => {
      signal = options.signal
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(Object.assign(new Error('x'), { code: 'storage/canceled' })))
      )
    })
    render(<Harness />)
    await user.upload(fileInput(), jpeg())
    await user.click(await screen.findByRole('button', { name: 'Cancelar envio' }))
    expect(signal.aborted).toBe(true)
    expect(screen.queryByText(/Enviando foto/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('várias de uma vez com poucas vagas: entram as que cabem e o resto vira aviso', async () => {
    const user = userEvent.setup()
    mockUpload.mockImplementation(() => new Promise(() => {}))
    render(<Harness initial={withPhotos(4)} />)
    await user.upload(fileInput(), [jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')])
    expect(await screen.findByText('2 fotos não entraram: limite de 5 por item.')).toBeInTheDocument()
    expect(await screen.findByText('Enviando foto… 0%')).toBeInTheDocument()
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
  })

  it('o campo é limpo depois da escolha: escolher o mesmo arquivo de novo dispara de novo', async () => {
    const user = userEvent.setup()
    mockUpload.mockResolvedValue(photo('novo'))
    render(<Harness />)
    await user.upload(fileInput(), jpeg())
    await screen.findByRole('img', { name: 'Foto 1 do item 1' })
    expect(fileInput().value).toBe('')
  })
})

describe('limite de 5 por item', () => {
  it('com 5 fotos os dois botões ficam desabilitados e o motivo aparece em texto', () => {
    render(<Harness initial={withPhotos(5)} />)
    const camera = screen.getByRole('button', { name: 'Tirar foto do item 1' })
    const attach = screen.getByRole('button', { name: 'Anexar fotos ao item 1' })
    expect(camera).toBeDisabled()
    expect(attach).toBeDisabled()
    const hint = screen.getByText('Limite de 5 fotos por item atingido.')
    expect(camera).toHaveAttribute('aria-describedby', hint.id)
    expect(attach).toHaveAttribute('aria-describedby', hint.id)
    expect(screen.getByText('5 de 5 fotos')).toBeInTheDocument()
  })

  it('com 4 fotos ainda cabe uma: botões habilitados e sem aviso; remover devolve a vaga', async () => {
    const user = userEvent.setup()
    render(<Harness initial={withPhotos(5)} />)
    await user.click(screen.getByRole('button', { name: 'Remover foto 2 do item 1' }))
    expect(screen.getByRole('button', { name: 'Anexar fotos ao item 1' })).toBeEnabled()
    expect(screen.queryByText(/Limite de 5/)).not.toBeInTheDocument()
  })
})

describe('miniaturas e remover', () => {
  it('baixa as miniaturas pela function e mostra <img alt="Foto N do item 1"> dentro de botões', async () => {
    render(<Harness initial={withPhotos(3)} />)
    expect(await screen.findByRole('img', { name: 'Foto 3 do item 1' })).toBeInTheDocument()
    expect(mockDownload.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['p1', 's1', 'thumb'],
      ['p1', 's2', 'thumb'],
      ['p1', 's3', 'thumb'],
    ])
    expect(screen.getByRole('button', { name: 'Foto 2 do item 1' })).toBeInTheDocument()
  })

  it('remover tira a foto do estado (vale no Salvar) e o alvo do "×" é um botão com nome', async () => {
    const user = userEvent.setup()
    let latest
    render(<Harness initial={withPhotos(2)} onState={(value) => (latest = value)} />)
    await screen.findByRole('img', { name: 'Foto 2 do item 1' })
    await user.click(screen.getByRole('button', { name: 'Remover foto 1 do item 1' }))
    expect(latest.damageByRowId['r-1'].photos.map((item) => item.id)).toEqual(['s2'])
    expect(screen.getAllByRole('button', { name: /^Remover foto/ })).toHaveLength(1)
  })

  it('"Remover" é um botão com texto visível, fora do botão de abrir (nunca aninhado na miniatura)', async () => {
    render(<Harness initial={withPhotos(2)} />)
    await screen.findByRole('img', { name: 'Foto 2 do item 1' })
    for (const remove of screen.getAllByRole('button', { name: /^Remover foto/ })) {
      expect(remove).toHaveTextContent('Remover')
      expect(remove.getAttribute('aria-label')).toContain(remove.textContent.trim())
      expect(remove.parentElement.closest('button')).toBeNull()
      expect(remove.querySelector('img')).toBeNull()
    }
  })

  it('download que falha: "Foto indisponível" e "Tentar de novo" baixa de novo', async () => {
    const user = userEvent.setup()
    mockDownload.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'permission-denied' }))
    render(<Harness initial={withPhotos(1)} />)
    expect(await screen.findByText('Foto indisponível')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('img', { name: 'Foto 1 do item 1' })).toBeInTheDocument()
    expect(mockDownload).toHaveBeenCalledTimes(2)
  })
})

describe('visualizador', () => {
  async function openViewer(user, count = 3) {
    render(<Harness initial={withPhotos(count)} editable={false} />)
    await screen.findByRole('img', { name: 'Foto 1 do item 1' })
    const thumb = screen.getByRole('button', { name: 'Foto 1 do item 1' })
    await user.click(thumb)
    const dialog = await screen.findByRole('dialog', { name: 'Foto da avaria' })
    return { dialog, thumb }
  }

  it('abre em diálogo (portal) com legenda, foto cheia, foco em Fechar; setas e botões navegam', async () => {
    const user = userEvent.setup()
    const { dialog } = await openViewer(user)
    const close = within(dialog).getByRole('button', { name: 'Fechar' })
    await waitFor(() => expect(close).toHaveFocus())
    expect(dialog.parentElement.parentElement).toBe(document.body)
    expect(within(dialog).getByRole('heading', { name: 'Foto 1 de 3 · Item 1 · POLIOL PE-3000' })).toBeInTheDocument()
    await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('p1', 's1', 'full'))
    expect(await within(dialog).findByRole('img', { name: /Foto 1 de 3/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Anterior' })).toBeDisabled()

    await user.keyboard('{ArrowRight}')
    expect(await within(dialog).findByRole('heading', { name: /^Foto 2 de 3/ })).toBeInTheDocument()
    await user.keyboard('{ArrowRight}')
    expect(await within(dialog).findByRole('heading', { name: /^Foto 3 de 3/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Próxima' })).toBeDisabled()
    await user.keyboard('{ArrowRight}')
    expect(within(dialog).getByRole('heading', { name: /^Foto 3 de 3/ })).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')
    expect(await within(dialog).findByRole('heading', { name: /^Foto 2 de 3/ })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Anterior' }))
    expect(await within(dialog).findByRole('heading', { name: /^Foto 1 de 3/ })).toBeInTheDocument()
  })

  it('Fechar devolve o foco à miniatura; Esc também fecha', async () => {
    const user = userEvent.setup()
    const { dialog, thumb } = await openViewer(user)
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Fechar' })).toHaveFocus())
    await user.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(thumb).toHaveFocus())

    await user.click(thumb)
    const again = await screen.findByRole('dialog', { name: 'Foto da avaria' })
    await waitFor(() => expect(within(again).getByRole('button', { name: 'Fechar' })).toHaveFocus())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('ao chegar na última (ou na primeira) pelo botão, o foco vai para Fechar e as setas continuam valendo', async () => {
    const user = userEvent.setup()
    const { dialog } = await openViewer(user, 2)
    const close = within(dialog).getByRole('button', { name: 'Fechar' })
    const next = within(dialog).getByRole('button', { name: 'Próxima' })
    await waitFor(() => expect(close).toHaveFocus())
    await user.click(next)
    expect(await within(dialog).findByRole('heading', { name: /^Foto 2 de 2/ })).toBeInTheDocument()
    expect(next).toBeDisabled()
    expect(close).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(await within(dialog).findByRole('heading', { name: /^Foto 1 de 2/ })).toBeInTheDocument()
    const previous = within(dialog).getByRole('button', { name: 'Anterior' })
    expect(previous).toBeDisabled()
    expect(close).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Próxima' }))
    await user.click(previous)
    expect(await within(dialog).findByRole('heading', { name: /^Foto 1 de 2/ })).toBeInTheDocument()
    expect(close).toHaveFocus()
  })

  it('foto cheia indisponível: aviso e "Tentar de novo"', async () => {
    const user = userEvent.setup()
    render(<Harness initial={withPhotos(1)} editable={false} />)
    await screen.findByRole('img', { name: 'Foto 1 do item 1' })
    mockDownload.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'storage/object-not-found' }))
    await user.click(screen.getByRole('button', { name: 'Foto 1 do item 1' }))
    const dialog = await screen.findByRole('dialog', { name: 'Foto da avaria' })
    expect(await within(dialog).findByText('Foto indisponível.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Tentar de novo' }))
    expect(await within(dialog).findByRole('img', { name: /Foto 1 de 1/ })).toBeInTheDocument()
  })
})

describe('somente leitura', () => {
  it('só miniaturas: sem botões, sem campos de arquivo e sem "×"; abre o visualizador', async () => {
    render(<Harness initial={withPhotos(2)} editable={false} />)
    await screen.findByRole('img', { name: 'Foto 2 do item 1' })
    expect(screen.queryByRole('button', { name: /Tirar foto|Anexar|Remover/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Arquivos de foto|Foto da câmera/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Foto 1 do item 1' })).toBeEnabled()
  })

  it('somente leitura e sem fotos: não mostra nada', () => {
    const { container } = render(<Harness editable={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})
