import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { Blob as NodeBlob } from 'node:buffer'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, newId, now } from '../../src/db/db'
import type { Claim } from '../../src/domain/claim-types'
import type { DocumentRecord } from '../../src/domain/document-types'
import type { Requirement } from '../../src/domain/requirements-schema'
import { RequirementRow } from '../../src/ui/RequirementRow'

// fake-indexeddb keeps Node's native Blob intact but drops jsdom Blob bytes (same as documents-page.test.tsx).
vi.stubGlobal('Blob', NodeBlob)
afterAll(() => vi.unstubAllGlobals())

const { fakeDownscale, fakePdf } = vi.hoisted(() => ({
  fakeDownscale: async (file: Blob & { name?: string }) => ({
    blob: new Blob([await file.text()], { type: 'image/jpeg' }),
    width: 2000,
    height: 1500,
  }),
  fakePdf: async () => ({ pages: 1, encrypted: false, textLines: [] as string[] }),
}))

vi.mock('../../src/data/documents-repo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/data/documents-repo')>()
  return {
    ...actual,
    addFiles: (...args: Parameters<typeof actual.addFiles>) =>
      actual.addFiles(args[0], args[1], args[2], { downscale: fakeDownscale, readPdf: fakePdf }),
  }
})
vi.mock('../../src/data/ocr-queue', () => ({ startOcrQueue: vi.fn(async () => {}) }))

const PERSON_ID = 'person-holder'

const PRESCRIPTION: Requirement = {
  id: 'outpatient.prescription',
  claimTypes: ['outpatient'],
  categories: ['prescription', 'medical-record'],
  title: 'Đơn thuốc hoặc sổ khám',
  required: true,
  when: null,
  checklist: ['Chẩn đoán', 'Ngày khám', 'Chữ ký và dấu của bác sĩ'],
}

const LAB: Requirement = {
  id: 'outpatient.lab-result',
  claimTypes: ['outpatient'],
  categories: ['lab-result'],
  title: 'Kết quả cận lâm sàng (nếu có)',
  required: false,
  when: null,
  checklist: ['Kết quả có tên bệnh nhân'],
}

function claimOf(over: Partial<Claim> = {}): Claim {
  return {
    id: newId(),
    personId: PERSON_ID,
    type: 'outpatient',
    status: 'draft',
    treatmentDate: '2026-11-20',
    facilityId: null,
    facilityName: '',
    reason: 'Đau họng',
    originalsSubmittedAt: null,
    daysOff: 0,
    admissionDate: null,
    dischargeDate: null,
    bank: null,
    notApplicable: [],
    diagnosis: null,
    flags: {},
    totalClaimed: 0,
    approvedAmount: null,
    rejectionReason: null,
    submittedAt: null,
    bundleFileIds: [],
    wizardStep: 4,
    sentVia: null,
    gmailThreadId: null,
    lastSubmittedFileIds: [],
    updatedAt: now(),
    deleted: 0,
    ...over,
  }
}

function docOf(over: Partial<DocumentRecord> = {}): DocumentRecord {
  const t = now()
  return {
    id: newId(),
    personId: PERSON_ID,
    claimId: null,
    category: 'prescription',
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

function picked(name: string, text: string): File {
  return Object.assign(new NodeBlob([text], { type: 'image/jpeg' }), { name }) as unknown as File
}

const inputs = (container: HTMLElement) => ({
  capture: container.querySelector('input[type="file"][capture]') as HTMLInputElement,
  pick: container.querySelector('input[type="file"]:not([capture])') as HTMLInputElement,
})

beforeEach(async () => {
  await Promise.all([db.claims.clear(), db.documents.clear(), db.files.clear(), db.outbox.clear()])
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
})

describe('claims.docs.a11y: the requirement row controls', () => {
  it('claims.docs.a11y: camera, pick-image and remove controls are buttons whose names include the requirement title', () => {
    const claim = claimOf()
    const doc = docOf({ claimId: claim.id })
    render(
      <RequirementRow
        claim={claim}
        requirement={PRESCRIPTION}
        docs={[doc]}
        notApplicable={false}
        readOnly={false}
        onBeforeEdit={async () => {}}
        onToggleNotApplicable={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Chụp Đơn thuốc hoặc sổ khám' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chọn ảnh Đơn thuốc hoặc sổ khám' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gỡ Đơn thuốc hoặc sổ khám khỏi hồ sơ, chứng từ 1' })).toBeInTheDocument()
  })

  it('claims.docs.optional: a required row has no "Không có" control and an optional row toggles it', () => {
    const claim = claimOf()
    const onToggle = vi.fn()
    const { rerender } = render(
      <RequirementRow
        claim={claim}
        requirement={PRESCRIPTION}
        docs={[]}
        notApplicable={false}
        readOnly={false}
        onBeforeEdit={async () => {}}
        onToggleNotApplicable={onToggle}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Không có' })).toBeNull()
    expect(screen.getByText('Bắt buộc')).toBeInTheDocument()

    rerender(
      <RequirementRow
        claim={claim}
        requirement={LAB}
        docs={[]}
        notApplicable={false}
        readOnly={false}
        onBeforeEdit={async () => {}}
        onToggleNotApplicable={onToggle}
      />,
    )
    const toggle = screen.getByRole('button', { name: 'Không có' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(onToggle).toHaveBeenCalledWith('outpatient.lab-result')
  })
})

describe('claims.docs.attach: adding documents from the row', () => {
  it('claims.docs.attach: two photos for the prescription requirement become two prescription documents of the claim', async () => {
    const claim = claimOf()
    await db.claims.put(claim)
    const { container } = render(
      <RequirementRow
        claim={claim}
        requirement={PRESCRIPTION}
        docs={[]}
        notApplicable={false}
        readOnly={false}
        onBeforeEdit={async () => {}}
        onToggleNotApplicable={() => {}}
      />,
    )

    fireEvent.change(inputs(container).capture, {
      target: { files: [picked('a.jpg', 'page-1'), picked('b.jpg', 'page-2')] },
    })

    await waitFor(async () => {
      const docs = await db.documents.where('claimId').equals(claim.id).toArray()
      expect(docs).toHaveLength(2)
      expect(docs.every((d) => d.category === 'prescription' && d.personId === PERSON_ID)).toBe(true)
    })
  })

  it('claims.docs.reuse: picking a library prescription attaches it without storing its image again', async () => {
    const claim = claimOf()
    await db.claims.put(claim)
    const library = docOf({ fileIds: ['file-1'], claimId: null })
    await db.documents.put(library)
    const filesBefore = await db.files.count()

    render(
      <RequirementRow
        claim={claim}
        requirement={PRESCRIPTION}
        docs={[]}
        notApplicable={false}
        readOnly={false}
        onBeforeEdit={async () => {}}
        onToggleNotApplicable={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Chọn từ kho' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Đơn thuốc' }))
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào hồ sơ' }))

    await waitFor(async () => {
      const stored = await db.documents.get(library.id)
      expect(stored).toMatchObject({ claimId: claim.id, fileIds: ['file-1'] })
    })
    expect(await db.files.count()).toBe(filesBefore)
  })

  it('claims.docs.detach: removing a document returns it to the library with its files', async () => {
    const claim = claimOf()
    await db.claims.put(claim)
    const attached = docOf({ claimId: claim.id, fileIds: ['file-9'] })
    await db.documents.put(attached)

    render(
      <RequirementRow
        claim={claim}
        requirement={PRESCRIPTION}
        docs={[attached]}
        notApplicable={false}
        readOnly={false}
        onBeforeEdit={async () => {}}
        onToggleNotApplicable={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ Đơn thuốc hoặc sổ khám khỏi hồ sơ, chứng từ 1' }))

    await waitFor(async () => {
      expect(await db.documents.get(attached.id)).toMatchObject({ claimId: null, fileIds: ['file-9'] })
    })
  })

  it('claims.docs.a11y: a read-only row shows its documents but no controls', () => {
    const claim = claimOf()
    render(
      <RequirementRow
        claim={claim}
        requirement={PRESCRIPTION}
        docs={[docOf({ claimId: claim.id })]}
        notApplicable={false}
        readOnly
        onBeforeEdit={async () => {}}
        onToggleNotApplicable={() => {}}
      />,
    )
    const row = screen.getByRole('region', { name: 'Đơn thuốc hoặc sổ khám' })
    expect(within(row).queryByRole('button', { name: 'Chụp Đơn thuốc hoặc sổ khám' })).toBeNull()
  })
})
