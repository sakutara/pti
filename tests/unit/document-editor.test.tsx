import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { Blob as NodeBlob } from 'node:buffer'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { startOcrQueue } from '../../src/data/ocr-queue'
import { db, newId, now } from '../../src/db/db'
import type { DocumentRecord, OcrCandidate } from '../../src/domain/document-types'
import { DocumentEditor } from '../../src/ui/DocumentEditor'

// fake-indexeddb keeps Node's native Blob intact but drops jsdom Blob bytes (same as documents-repo.test.ts).
vi.stubGlobal('Blob', NodeBlob)
afterAll(() => vi.unstubAllGlobals())

vi.mock('../../src/data/ocr-queue', () => ({ startOcrQueue: vi.fn(async () => {}) }))

const CANDIDATES: OcrCandidate[] = [
  { amount: 2718900, label: 'tong thanh toan', confidence: 'high' },
  { amount: 120000, label: '', confidence: 'low' },
]

function doc(over: Partial<DocumentRecord> = {}): DocumentRecord {
  const t = now()
  return {
    id: newId(),
    personId: null,
    claimId: null,
    category: 'invoice',
    fileIds: [],
    docDate: null,
    amount: null,
    amountSource: null,
    amountConfirmed: false,
    ocrStatus: 'none',
    ocrText: null,
    ocrCandidates: [],
    lowResolution: false,
    createdAt: t,
    updatedAt: t,
    deleted: 0,
    ...over,
  }
}

async function seed(over: Partial<DocumentRecord> = {}): Promise<DocumentRecord> {
  const record = doc(over)
  await db.documents.put(record)
  return record
}

beforeEach(async () => {
  await Promise.all([db.documents.clear(), db.files.clear(), db.outbox.clear()])
  vi.mocked(startOcrQueue).mockClear()
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
})

describe('document-ocr.review: confirming the proposed amount', () => {
  it('document-ocr.review.confirm: "Đúng" stores the proposal as a confirmed OCR amount', async () => {
    const record = await seed({
      ocrStatus: 'done',
      amount: 2718900,
      amountSource: 'ocr',
      ocrCandidates: CANDIDATES,
    })
    render(<DocumentEditor id={record.id} persons={[]} onDeleted={() => {}} />)

    expect(await screen.findByText('Gợi ý chưa xác nhận')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Đúng' }))

    await waitFor(async () => {
      const stored = await db.documents.get(record.id)
      expect(stored?.amount).toBe(2718900)
      expect(stored?.amountSource).toBe('ocr')
      expect(stored?.amountConfirmed).toBe(true)
    })
    await waitFor(() => expect(screen.queryByText('Gợi ý chưa xác nhận')).not.toBeInTheDocument())
  })

  it('document-ocr.review.other-candidate: picking the second candidate makes it the confirmed amount', async () => {
    const record = await seed({
      ocrStatus: 'done',
      amount: 2718900,
      amountSource: 'ocr',
      ocrCandidates: CANDIDATES,
    })
    render(<DocumentEditor id={record.id} persons={[]} onDeleted={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: '120.000 đ' }))

    await waitFor(async () => {
      const stored = await db.documents.get(record.id)
      expect(stored?.amount).toBe(120000)
      expect(stored?.amountSource).toBe('ocr')
      expect(stored?.amountConfirmed).toBe(true)
    })
  })

  it('document-ocr.queue.failure: a failed reading offers to read it again', async () => {
    const record = await seed({ ocrStatus: 'failed' })
    render(<DocumentEditor id={record.id} persons={[]} onDeleted={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Đọc lại' }))

    await waitFor(async () => {
      expect((await db.documents.get(record.id))?.ocrStatus).toBe('pending')
    })
    expect(startOcrQueue).toHaveBeenCalled()
  })
})

describe('document-library.edit: editing an invoice', () => {
  it('document-library.edit.invoice: category invoice, date and amount are stored, amount manual and confirmed', async () => {
    const record = await seed({ category: 'other' })
    render(<DocumentEditor id={record.id} persons={[]} onDeleted={() => {}} />)

    fireEvent.change(await screen.findByLabelText('Loại chứng từ'), { target: { value: 'invoice' } })
    fireEvent.change(await screen.findByLabelText('Ngày chứng từ'), { target: { value: '2026-11-20' } })
    fireEvent.change(await screen.findByLabelText('Số tiền'), { target: { value: '750000' } })

    await waitFor(async () => {
      const stored = await db.documents.get(record.id)
      expect(stored?.category).toBe('invoice')
      expect(stored?.docDate).toBe('2026-11-20')
      expect(stored?.amount).toBe(750000)
      expect(stored?.amountSource).toBe('manual')
      expect(stored?.amountConfirmed).toBe(true)
    })
  })

  it('document-library.edit.invalid-amount: zero is refused, nothing is saved and an error is shown', async () => {
    const record = await seed({ category: 'invoice' })
    render(<DocumentEditor id={record.id} persons={[]} onDeleted={() => {}} />)

    fireEvent.change(await screen.findByLabelText('Số tiền'), { target: { value: '0' } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Số tiền phải là số nguyên dương')
    expect((await db.documents.get(record.id))?.amount).toBeNull()
  })
})

describe('document-library.delete: deleting a free document', () => {
  it('document-library.delete.free: asks for confirmation, then soft-deletes and queues the delete', async () => {
    const record = await seed({ category: 'other', fileIds: [] })
    const onDeleted = vi.fn()
    render(<DocumentEditor id={record.id} persons={[]} onDeleted={onDeleted} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Xóa' }))
    expect(onDeleted).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Xóa chứng từ' }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect((await db.documents.get(record.id))?.deleted).toBe(1)
    const ops = await db.outbox.toArray()
    expect(ops.map((op) => op.type)).toContain('document.delete')
  })
})
