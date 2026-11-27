import { render, screen } from '@testing-library/preact'
import { describe, expect, it } from 'vitest'
import { IconButton } from '../../src/ui/IconButton'
import { Icon, icons } from '../../src/ui/Icon'

const iconMarkup = (root: HTMLElement) => root.querySelector('[aria-hidden="true"]')!.innerHTML

describe('ui.icon-button', () => {
  it('ui.icon-button.a11y: icon-only button exposes its label as accessible name', () => {
    render(<IconButton icon="reload" label="Reload" />)
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  it('ui.icon-button.label: showLabel renders visible text', () => {
    render(<IconButton icon="reload" label="Reload app" showLabel />)
    expect(screen.getByRole('button', { name: 'Reload app' })).toHaveTextContent('Reload app')
  })

  it('ui.icon-button.state: toggle sets aria-pressed', () => {
    render(<IconButton icon="reload" label="Pin" pressed />)
    expect(screen.getByRole('button', { name: 'Pin' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('ui.icon-button.pressed.fallback: pressed without an <icon>-filled file keeps the base icon', () => {
    expect(icons['ban-filled']).toBeUndefined()
    const { container } = render(<IconButton icon="ban" label="Chặn" pressed />)
    const { container: plain } = render(<Icon name="ban" />)
    expect(iconMarkup(container)).toBe(iconMarkup(plain))
    expect(iconMarkup(container)).not.toBe('')
  })

  it('ui.icon-button.pressed.filled: pressed uses <icon>-filled when that file exists', () => {
    icons['ban-filled'] = '<svg data-test="filled"></svg>'
    try {
      const { container } = render(<IconButton icon="ban" label="Chặn" pressed />)
      expect(container.querySelector('[data-test="filled"]')).not.toBeNull()
    } finally {
      delete icons['ban-filled']
    }
  })

  it('ui.icon-button.hit-area: meets 44px minimum via classes', () => {
    render(<IconButton icon="reload" label="Reload" />)
    expect(screen.getByRole('button').className).toMatch(/min-h-11/)
    expect(screen.getByRole('button').className).toMatch(/min-w-11/)
  })
})
