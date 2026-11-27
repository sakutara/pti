import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { Blob as NodeBlob } from 'node:buffer'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccount } from '../../src/data/account-repo'
import { accountState, loadAccount } from '../../src/data/account-state'
import { downloadOcrModel, initOcrModel, ocrModel, OCR_MODEL_BYTES } from '../../src/data/ocr-model'
import { startOcrQueue } from '../../src/data/ocr-queue'
import { db, newId, now } from '../../src/db/db'
import type { DocumentRecord } from '../../src/domain/document-types'
import type { PersonInput } from '../../src/domain/types'
import { DocumentsPage } from '../../src/pages/DocumentsPage'
import { HomePage } from '../../src/pages/HomePage'
import { route, type Route } from '../../src/router'

// fake-indexeddb keeps Node's native Blob intact but drops jsdom Blob bytes (same as documents-repo.test.ts).
vi.stubGlobal('Blob', NodeBlob)
afterAll(() => vi.unstubAllGlobals())

const { fakeDownscale, fakePdf } = vi.hoisted(() => ({
  // Fake decoder: "bad.jpg" cannot be decoded, every other image is stored as its own bytes.
  fakeDownscale: async (file: Blob & { name?: string }) => {
    if (file.name === 'bad.jpg') throw new Error('decode failed')
    return { blob: new Blob([await file.text()], { type: 'image/jpeg' }), width: 2000, height: 1500 }
  },
  fakePdf: async () => ({ pages: 1, encrypted: false, textLines: [] as string[] }),
}))

// The page adds files through the real repo; only the browser-only decoders are replaced.
vi.mock('../../src/data/documents-repo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/data/documents-repo')>()
  return {
    ...actual,
    addFiles: (...args: Parameters<typeof actual.addFiles>) =>
      actual.addFiles(args[0], args[1], args[2], { downscale: fakeDownscale, readPdf: fakePdf }),
  }
})

vi.mock('../../src/data/ocr-queue', () => ({ startOcrQueue: vi.fn(async () => {}) }))
vi.mock('../../src/data/ocr-model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/data/ocr-model')>()
  return {
    ...actual,
    initOcrModel: vi.fn(async () => {}),
    downloadOcrModel: vi.fn(async () => {}),
  }
})

const TODAY = '2026-11-26'

const holderInput = (): PersonInput => ({
  role: 'holder',
  relation: 'self',
  memberType: 'employee',
  fullName: 'Nguyễn Văn A',
  dateOfBirth: '1990-05-01',
  idNumber: null,
  phone: null,
  email: null,
  address: null,
  employeeCode: null,
  jobTitle: null,
  tier: 2,
  policyholderName: null,
  contractCode: null,
  cardNumber: null,
  cardValidFrom: null,
  cardValidTo: null,
  bank: null,
})

function picked(name: string, text: string, type = 'image/jpeg'): File {
  return Object.assign(new NodeBlob([text], { type }), { name }) as unknown as File
}

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

function setRoute(next: Route) {
  route.value = next
}

beforeEach(async () => {
  await Promise.all([
    db.account.clear(),
    db.persons.clear(),
    db.outbox.clear(),
    db.documents.clear(),
    db.files.clear(),
    db.settings.clear(),
  ])
  accountState.value = { status: 'loading' }
  const result = await createAccount(db, holderInput(), TODAY)
  if (!result.ok) throw new Error('seed failed')
  await loadAccount(db)

  ocrModel.value = { state: 'absent', loaded: 0, total: OCR_MODEL_BYTES }
  vi.mocked(startOcrQueue).mockClear()
  vi.mocked(downloadOcrModel).mockClear()
  vi.mocked(initOcrModel).mockClear()
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
  setRoute({ path: '/documents', params: {}, query: {} })
})

const list = () => screen.getByRole('list', { name: 'Danh sách chứng từ' })

describe('document-library.add: adding photos from the documents page', () => {
  it('document-library.add.capture: one document with one page is stored and listed first', async () => {
    await seed({ category: 'prescription', createdAt: now() - 60_000 })
    const { container } = render(<DocumentsPage />)
    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(1))

    const capture = container.querySelector('input[capture]') as HTMLInputElement
    fireEvent.change(capture, { target: { files: [picked('photo.jpg', 'receipt-photo')] } })

    await vi.waitFor(async () => {
      const rows = await db.documents.toArray()
      expect(rows).toHaveLength(2)
    })
    const stored = (await db.documents.toArray()).find((d) => d.category === 'invoice')!
    expect(stored.fileIds).toHaveLength(1)
    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(2))
    expect(within(list()).getAllByRole('listitem')[0]).toHaveTextContent('Hóa đơn')
    expect(startOcrQueue).toHaveBeenCalled()
  })

  it('document-library.add.unreadable: one of 3 picked files fails and the other two are stored', async () => {
    const { container } = render(<DocumentsPage />)
    const pick = container.querySelector('input[type="file"]:not([capture])') as HTMLInputElement
    fireEvent.change(pick, {
      target: { files: [picked('a.jpg', 'A'), picked('bad.jpg', 'B'), picked('c.jpg', 'C')] },
    })

    await vi.waitFor(async () => expect(await db.documents.count()).toBe(2))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('bad.jpg')
  })

  it('document-ocr.model.consent: offers the download with its size and downloads nothing until accepted', async () => {
    await seed({ category: 'invoice', ocrStatus: 'pending' })
    render(<DocumentsPage />)

    expect(await screen.findByText(/111 MB/)).toBeInTheDocument()
    expect(downloadOcrModel).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Tải bộ đọc chữ' }))
    await waitFor(() => expect(downloadOcrModel).toHaveBeenCalledTimes(1))
  })

  it('document-library.add.a11y: the editor add-page control is an icon-only button with a name', async () => {
    const record = await seed({ category: 'invoice' })
    setRoute({ path: `/documents/${record.id}`, params: { id: record.id }, query: {} })
    render(<DocumentsPage />)

    expect(await screen.findByRole('button', { name: 'Thêm trang' })).toBeInTheDocument()
  })

  it('document-library.add.a11y: the add-bar and the filter category selects have distinct names', async () => {
    render(<DocumentsPage />)

    expect(await screen.findByRole('combobox', { name: 'Loại chứng từ khi thêm' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Lọc theo loại' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Loại chứng từ' })).not.toBeInTheDocument()
  })

  it('document-library.add.capture: Trang chủ has a Chứng từ link to the documents page', async () => {
    render(<HomePage />)
    expect(await screen.findByRole('link', { name: 'Chứng từ' })).toHaveAttribute('href', '#/documents')
  })
})

describe('document-library.edit: filtering and merging on the documents page', () => {
  it('document-library.edit.filter: "Chưa vào hồ sơ" lists only documents with no claim', async () => {
    await seed({ docDate: '2026-11-20', claimId: null })
    await seed({ docDate: '2026-11-21', claimId: 'claim-1' })
    render(<DocumentsPage />)

    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(2))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chưa vào hồ sơ' }))

    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(1))
    expect(within(list()).getByRole('button', { name: /20\/11\/2026/ })).toBeInTheDocument()
    expect(route.value.query).toEqual({ n: '1' })
  })

  it('document-library.edit.merge: merges the selected documents in selection order', async () => {
    const a = await seed({ docDate: '2026-11-20', fileIds: ['file-a'] })
    const b = await seed({ docDate: '2026-11-21', fileIds: ['file-b'] })
    render(<DocumentsPage />)
    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(2))

    const mergeButton = screen.getByRole('button', { name: 'Ghép' })
    expect(screen.queryByRole('button', { name: /Ghép \d+ chứng từ/ })).not.toBeInTheDocument()
    fireEvent.click(mergeButton)

    fireEvent.click(within(list()).getByRole('button', { name: /21\/11\/2026/ }))
    const runMerge = screen.getByRole('button', { name: 'Ghép 1 chứng từ' })
    expect(runMerge).toBeDisabled()

    fireEvent.click(within(list()).getByRole('button', { name: /20\/11\/2026/ }))
    const run = screen.getByRole('button', { name: 'Ghép 2 chứng từ' })
    expect(run).toBeEnabled()
    fireEvent.click(run)

    await vi.waitFor(async () => {
      const head = await db.documents.get(b.id)
      expect(head?.fileIds).toEqual(['file-b', 'file-a'])
    })
    expect((await db.documents.get(a.id))?.deleted).toBe(1)
  })

  it('document-library.delete.in-claim: a document in a claim names its claim and offers no delete', async () => {
    const record = await seed({ category: 'invoice', claimId: 'claim-1' })
    setRoute({ path: `/documents/${record.id}`, params: { id: record.id }, query: {} })
    render(<DocumentsPage />)

    expect(await screen.findByText('Thuộc một hồ sơ')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xóa' })).not.toBeInTheDocument()
  })
})
