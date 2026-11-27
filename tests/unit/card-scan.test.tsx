import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ocrModel, OCR_MODEL_BYTES } from '../../src/data/ocr-model'
import { readCardFields } from '../../src/data/card-scan'
import { CardScan } from '../../src/ui/CardScan'

vi.mock('../../src/data/card-scan', () => ({ readCardFields: vi.fn() }))
vi.mock('../../src/data/ocr-model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/ocr-model')>()),
  initOcrModel: vi.fn(async () => {}),
}))

URL.createObjectURL = vi.fn(() => 'blob:x')
URL.revokeObjectURL = vi.fn()

function pick(container: HTMLElement) {
  const input = container.querySelector('[data-testid="card-scan-pick"]') as HTMLInputElement
  const photo = new File(['x'], 'front.jpg', { type: 'image/jpeg' })
  Object.defineProperty(input, 'files', { value: [photo], configurable: true })
  fireEvent.change(input)
  return photo
}

beforeEach(() => {
  vi.mocked(readCardFields).mockReset()
})
afterEach(() => {
  ocrModel.value = { state: 'absent', loaded: 0, total: OCR_MODEL_BYTES }
})

describe('card-scan', () => {
  it('card-scan.front-only: offers the card front only, with no back side', () => {
    render(<CardScan fileId={null} onImage={vi.fn()} onFields={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Chụp thẻ' })).toBeInTheDocument()
    expect(screen.queryByText(/mặt sau/i)).toBeNull()
  })

  it('card-scan.ocr.autofill: stores the photo, reads it and hands the fields to the form', async () => {
    ocrModel.value = { state: 'ready', loaded: OCR_MODEL_BYTES, total: OCR_MODEL_BYTES }
    vi.mocked(readCardFields).mockResolvedValue({ fullName: 'Nguyễn Văn A', cardNumber: 'PTI1234' })
    const onImage = vi.fn()
    const onFields = vi.fn()
    const { container } = render(<CardScan fileId={null} onImage={onImage} onFields={onFields} />)

    const photo = pick(container)

    await waitFor(() => expect(onFields).toHaveBeenCalledWith({ fullName: 'Nguyễn Văn A', cardNumber: 'PTI1234' }))
    expect(onImage).toHaveBeenCalledWith(photo)
    expect(screen.getByRole('status')).toHaveTextContent('Đã điền 2 mục từ thẻ')
  })

  it('card-scan.ocr.no-model: keeps the photo and offers the reading model instead of reading', async () => {
    const onImage = vi.fn()
    const { container } = render(<CardScan fileId={null} onImage={onImage} onFields={vi.fn()} />)

    pick(container)

    await waitFor(() => expect(onImage).toHaveBeenCalledTimes(1))
    expect(readCardFields).not.toHaveBeenCalled()
    expect(screen.getByText(/Tự điền từ ảnh thẻ cần bộ đọc chữ/)).toBeInTheDocument()
  })
})
