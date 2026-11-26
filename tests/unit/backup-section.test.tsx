import { render, screen, fireEvent, waitFor } from '@testing-library/preact'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../../src/db/db'
import { BackupSection } from '../../src/ui/BackupSection'
import { exportBackup } from '../../src/data/backup'

vi.mock('../../src/data/backup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/data/backup')>()
  return { ...actual, exportBackup: vi.fn(actual.exportBackup) }
})

const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL

beforeEach(async () => {
  await db.settings.clear()
  URL.createObjectURL = vi.fn(() => 'blob:test-url')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
  vi.restoreAllMocks()
})

describe('ui.backup-section', () => {
  it('ui.backup-section.render: renders no missing translation markers', async () => {
    const { container } = render(<BackupSection />)
    expect(screen.getByRole('heading', { name: 'Sao lưu và khôi phục' })).toBeInTheDocument()
    await waitFor(() => expect(container.textContent).toContain('Chưa sao lưu lần nào'))
    expect(container.textContent).not.toContain('⟦')
  })

  it('backup.export.warning: tells the user the file holds health and personal data after export', async () => {
    render(<BackupSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Sao lưu' }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('sức khỏe')
    expect(status).toHaveTextContent('cất ở nơi an toàn')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url')
  })

  it('backup.export.warning: records lastBackupAt in settings after export', async () => {
    render(<BackupSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Sao lưu' }))

    await screen.findByRole('status')
    const row = await db.settings.get('lastBackupAt')
    expect(typeof row?.value).toBe('number')
  })

  it('backup.export.error: shows an alert when the backup file cannot be created', async () => {
    vi.mocked(exportBackup).mockRejectedValueOnce(new Error('disk full'))
    render(<BackupSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Sao lưu' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Không tạo được file sao lưu')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('backup.storage.last-export: shows the date of the last export as dd/MM/yyyy', async () => {
    await db.settings.put({
      key: 'lastBackupAt',
      value: new Date(2026, 10, 20, 10, 0).getTime(),
      updatedAt: 0,
    })
    render(<BackupSection />)
    expect(await screen.findByText('Sao lưu gần nhất: 20/11/2026')).toBeInTheDocument()
  })

  it('backup.storage.persist: shows the persisted storage result from settings', async () => {
    await db.settings.put({ key: 'persisted', value: true, updatedAt: 0 })
    render(<BackupSection />)
    expect(await screen.findByText('Bộ nhớ được giữ lâu dài')).toBeInTheDocument()
  })

  it('backup.storage.persist: warns when storage is not persisted', async () => {
    await db.settings.put({ key: 'persisted', value: false, updatedAt: 0 })
    render(<BackupSection />)
    expect(await screen.findByText('Trình duyệt có thể xóa dữ liệu khi thiếu bộ nhớ')).toBeInTheDocument()
  })

  it('backup.import.corrupt: shows the corrupt-file alert for a file that is not a zip', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { container } = render(<BackupSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục' }))

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toHaveAttribute('accept', '.ptibackup,application/zip')
    const file = new File(['not a zip'], 'broken.ptibackup', { type: 'application/zip' })
    fireEvent.change(input, { target: { files: [file] } })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('File sao lưu bị hỏng')
  })
})
