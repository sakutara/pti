import { fireEvent, render, screen, within } from '@testing-library/preact'
import { describe, expect, it } from 'vitest'
import { parseBenefits, type BenefitsDataset } from '../../src/domain/benefits-schema'
import { TierCompare } from '../../src/ui/TierCompare'
import fixture from '../fixtures/benefits-2026.json'

function dataset(): BenefitsDataset {
  const result = parseBenefits(fixture)
  if (!result.ok) throw new Error(`fixture invalid: ${result.error}`)
  return result.data
}

/** Opens the comparison with its own button, the way the page does. */
function openCompare() {
  fireEvent.click(screen.getByRole('button', { name: 'So sánh hạng' }))
}

describe('benefits.compare.layout.wide', () => {
  it('benefits.compare.layout.wide: a 4-tier table with one row per benefit and the person tier marked aria-current', () => {
    render(<TierCompare dataset={dataset()} memberType="voluntary" tier={3} />)
    openCompare()

    const table = screen.getByRole('table', { name: 'So sánh hạng' })
    expect(table).toHaveClass('hidden', 'lg:table')

    const headers = within(table).getAllByRole('columnheader')
    expect(headers.map((h) => h.textContent)).toEqual(['Quyền lợi', 'Hạng 1', 'Hạng 2', 'Hạng 3', 'Hạng 4'])
    expect(within(table).getByRole('columnheader', { name: 'Hạng 3' })).toHaveAttribute('aria-current', 'true')
    expect(within(table).getByRole('columnheader', { name: 'Hạng 2' })).not.toHaveAttribute('aria-current')

    // 9 benefits are open to voluntary members; the header row is the tenth.
    expect(within(table).getAllByRole('row')).toHaveLength(10)
  })

  it('benefits.compare.layout.wide: a row shows each tier value for the member type', () => {
    render(<TierCompare dataset={dataset()} memberType="voluntary" tier={3} />)
    openCompare()

    const table = screen.getByRole('table', { name: 'So sánh hạng' })
    const row = within(table).getByRole('row', { name: /Giới hạn ngoại trú/ })
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent)
    expect(cells).toEqual(['9.000.000 đ/năm', '10.000.000 đ/năm', '11.000.000 đ/năm', '12.000.000 đ/năm'])
  })

  it('benefits.compare.layout.wide: a benefit the member type lacks is not a row', () => {
    render(<TierCompare dataset={dataset()} memberType="voluntary" tier={3} />)
    openCompare()

    const table = screen.getByRole('table', { name: 'So sánh hạng' })
    expect(within(table).queryByRole('rowheader', { name: 'Kính mắt' })).not.toBeInTheDocument()
  })
})

describe('benefits.compare.layout.narrow', () => {
  it('benefits.compare.layout.narrow: a tablist of 4 tabs starts on the person tier', () => {
    render(<TierCompare dataset={dataset()} memberType="voluntary" tier={3} />)
    openCompare()

    const tablist = screen.getByRole('tablist')
    expect(tablist).toHaveClass('lg:hidden')
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Hạng 1', 'Hạng 2', 'Hạng 3', 'Hạng 4'])
    expect(within(tablist).getByRole('tab', { name: 'Hạng 3' })).toHaveAttribute('aria-selected', 'true')

    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveTextContent('11.000.000 đ/năm')
    expect(panel).not.toHaveTextContent('12.000.000 đ/năm')
  })

  it('benefits.compare.layout.narrow: choosing a tab shows only that tier', () => {
    render(<TierCompare dataset={dataset()} memberType="voluntary" tier={3} />)
    openCompare()

    fireEvent.click(screen.getByRole('tab', { name: 'Hạng 4' }))

    expect(screen.getByRole('tab', { name: 'Hạng 4' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Hạng 3' })).toHaveAttribute('aria-selected', 'false')
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveTextContent('12.000.000 đ/năm')
    expect(panel).not.toHaveTextContent('11.000.000 đ/năm')
  })

  it('benefits.compare.layout.narrow: the comparison is a full-screen sheet with a close button', () => {
    render(<TierCompare dataset={dataset()} memberType="voluntary" tier={3} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    openCompare()
    const dialog = screen.getByRole('dialog', { name: 'So sánh hạng' })
    expect(dialog).toHaveClass('fixed', 'inset-0')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
