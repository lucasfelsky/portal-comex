import PageFade from './PageFade'

export default {
  title: 'Components/PageFade',
  component: PageFade,
}

export const Default = {
  render: () => (
    <PageFade>
      <div className="card" style={{ padding: 16 }}>
        <p>Conteúdo com fade-in de 180ms ao montar (dispara a cada troca de rota).</p>
      </div>
    </PageFade>
  ),
}
