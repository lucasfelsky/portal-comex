import { useState } from 'react'
import Modal from '../../components/Modal'
import {
  buildMarineTrafficUrl,
  buildVesselFinderDetailsUrl,
  buildVesselFinderEmbedUrl,
  buildVesselFinderSearchUrl,
  getVesselTrackingTarget,
} from './vesselTracking'

// Botao "Rastrear navio" do bloco "Embarque e transito".
// - IMO valido: abre Modal com iframe do VesselFinder (sem o script aismap.js,
//   que usa document.write) + links externos (MarineTraffic nao embute).
// - So' nome: link para a busca por nome do VesselFinder em nova aba.
// - Sem nome e sem IMO (ou aereo): nao renderiza.
// O `sandbox` do iframe e' validado manualmente no navegador; se o mapa
// quebrar, remover o atributo e registrar a justificativa aqui e no PR.
export default function VesselTrackingButton({ process }) {
  const [open, setOpen] = useState(false)
  const target = getVesselTrackingTarget(process)

  if (!target) return null

  if (target.mode === 'search') {
    return (
      <a
        className="ghost-button"
        href={buildVesselFinderSearchUrl(target.name)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Rastrear navio
      </a>
    )
  }

  const { imo, name, voyage } = target
  const title = [name, voyage && `Viagem ${voyage}`, `IMO ${imo}`].filter(Boolean).join(' · ')

  return (
    <>
      <button type="button" className="ghost-button" onClick={() => setOpen(true)}>
        Rastrear navio
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} wide>
        <div className="vessel-tracking__frame">
          <iframe
            title={`Posição do navio ${name || ''} (IMO ${imo})`}
            src={buildVesselFinderEmbedUrl(imo, { height: 420, referrer: window.location.href })}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
        <div className="vessel-tracking__links">
          <a
            className="ghost-button"
            href={buildVesselFinderDetailsUrl(imo)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir no VesselFinder
          </a>
          <a
            className="ghost-button"
            href={buildMarineTrafficUrl(imo)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir no MarineTraffic
          </a>
        </div>
      </Modal>
    </>
  )
}
