import Skeleton from './Skeleton'

export default {
  title: 'Components/Skeleton',
  component: Skeleton,
  argTypes: {
    variant: {
      control: 'select',
      options: ['text', 'title', 'subtitle', 'card', 'circle', 'button'],
    },
  },
}

export const Text = {
  args: { variant: 'text' },
}

export const Card = {
  args: { variant: 'card' },
}

export const Circle = {
  args: { variant: 'circle' },
}

export const AllVariants = {
  render: () => (
    <div style={{ display: 'grid', gap: 16, maxWidth: 320 }}>
      <Skeleton variant="title" />
      <Skeleton variant="subtitle" />
      <Skeleton variant="text" />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Skeleton variant="circle" />
        <Skeleton variant="button" />
      </div>
      <Skeleton variant="card" />
    </div>
  ),
}

export const Group = {
  render: () => (
    <div style={{ maxWidth: 320 }}>
      <Skeleton.Group count={4} gap={10} />
    </div>
  ),
}
