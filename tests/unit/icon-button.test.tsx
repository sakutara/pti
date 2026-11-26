import { render, screen } from '@testing-library/preact'
import { describe, expect, it } from 'vitest'
import { IconButton } from '../../src/ui/IconButton'

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

  it('ui.icon-button.hit-area: meets 44px minimum via classes', () => {
    render(<IconButton icon="reload" label="Reload" />)
    expect(screen.getByRole('button').className).toMatch(/min-h-11/)
    expect(screen.getByRole('button').className).toMatch(/min-w-11/)
  })
})
