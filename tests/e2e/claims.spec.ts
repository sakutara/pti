import { test, expect, type Download, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RECEIPT,
  attachReceipt,
  fillOutpatientUpToReview,
  noShot,
  onboard,
  startClaim,
  completeProfile,
  trackExternalRequests,
  warmServiceWorker,
} from './helpers'

/** Set PTI_SHOT_DIR to save full-page screenshots of each step; unset in normal runs. */
const SHOT_DIR = process.env.PTI_SHOT_DIR

const NARROW = { width: 360, height: 800 }
const WIDE = { width: 1280, height: 800 }

/** Fails when the page is wider than the viewport: the layout must not scroll sideways. */
async function expectNoHorizontalScroll(page: Page) {
  const { overflow, culprits } = await page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const wide = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => el.getBoundingClientRect().right > width + 1)
      .slice(0, 6)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} "${el.textContent?.trim().slice(0, 30)}"`)
    return { overflow: document.documentElement.scrollWidth - width, culprits: wide }
  })
  expect(overflow, `horizontal overflow in px; wider than the viewport: ${culprits.join(' | ')}`).toBeLessThanOrEqual(0)
}

/** Checks the layout does not scroll sideways and, when PTI_SHOT_DIR is set, saves a full-page screenshot. */
async function probe(page: Page, viewport: string, name: string) {
  await expectNoHorizontalScroll(page)
  if (SHOT_DIR) await page.screenshot({ path: join(SHOT_DIR, `${viewport}-${name}.png`), fullPage: true })
}

/** Reads a downloaded PDF: the bytes must start with %PDF and pdf-lib must load them. */
async function readPdf(download: Download): Promise<{ name: string; pages: number; bytes: number }> {
  const path = await download.path()
  expect(path).not.toBeNull()
  const bytes = readFileSync(path!)
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  const doc = await PDFDocument.load(bytes)
  return { name: download.suggestedFilename(), pages: doc.getPageCount(), bytes: bytes.byteLength }
}

/**
 * An oversize photo (6000 x 4000 px, generated in the page) attached through the file input's DataTransfer. Intake
 * downscales it with the canvas encoder before it is stored, so the attachments are built from the smaller copy.
 */
async function attachOversizePhoto(page: Page, title: string) {
  await page.locator(`section[aria-label="${title}"] input[type="file"]:not([capture])`).first().evaluate(async (input) => {
    const canvas = document.createElement('canvas')
    canvas.width = 6000
    canvas.height = 4000
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    const gradient = ctx.createLinearGradient(0, 0, 6000, 4000)
    gradient.addColorStop(0, '#2b6cb0')
    gradient.addColorStop(1, '#f6ad55')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 6000, 4000)
    ctx.fillStyle = '#1a202c'
    for (let y = 200; y < 4000; y += 320) ctx.fillRect(300, y, 5400, 18)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
    )
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], 'oversize.png', { type: 'image/png' }))
    const fileInput = input as HTMLInputElement
    fileInput.files = transfer.files
    fileInput.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(page.locator(`section[aria-label="${title}"]`).getByRole('button', { name: /^Gỡ / })).toHaveCount(1, {
    timeout: 60_000,
  })
}

/**
 * Random-pixel photos (2400 x 1800 px) attached as invoices through the file input's DataTransfer. Noise keeps the JPEG
 * large, so the stored originals stay above the attachment limit.
 */
async function attachNoisyPhotos(page: Page, count: number) {
  await page
    .locator('section[aria-labelledby="claim-step-invoices"] input[type="file"][multiple]')
    .evaluate(async (input, count) => {
      const transfer = new DataTransfer()
      for (let n = 1; n <= count; n++) {
        const canvas = document.createElement('canvas')
        canvas.width = 2400
        canvas.height = 1800
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('no 2d context')
        const image = ctx.createImageData(2400, 1800)
        for (let i = 0; i < image.data.length; i++) image.data[i] = i % 4 === 3 ? 255 : Math.random() * 256
        ctx.putImageData(image, 0, 0)
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.95),
        )
        transfer.items.add(new File([blob], `noise-${n}.jpg`, { type: 'image/jpeg' }))
      }
      const fileInput = input as HTMLInputElement
      fileInput.files = transfer.files
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    }, count)
  await expect(page.getByLabel(`Số tiền hóa đơn ${count}`, { exact: true })).toBeVisible({ timeout: 120_000 })
}

/** Bytes of the stored photos (not PDFs) in the app's IndexedDB, read in the page. */
async function storedPhotoBytes(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('pti')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const request = db.transaction('files', 'readonly').objectStore('files').getAll()
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            db.close()
            const files = request.result as Array<{ mime: string; deleted: number; bytes: number }>
            resolve(files.filter((f) => f.mime !== 'application/pdf' && f.deleted === 0).reduce((sum, f) => sum + f.bytes, 0))
          }
        }
      }),
  )
}

/** Builds the two PDFs, saves both (checking names and that they parse) and confirms the mailto send. */
async function buildAndSendByMailto(
  page: Page,
  shoot: (name: string) => Promise<void>,
  offline: boolean,
): Promise<{ form: { name: string; pages: number; bytes: number }; attachments: { name: string; pages: number; bytes: number } }> {
  await page.getByRole('button', { name: 'Dựng hai tệp PDF', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Lưu hai tệp PDF', exact: true })).toBeVisible({ timeout: 60_000 })
  await shoot('review-built')

  const downloads: Download[] = []
  page.on('download', (download) => downloads.push(download))
  await page.getByRole('button', { name: 'Lưu hai tệp PDF', exact: true }).click()
  await expect.poll(() => downloads.length, { timeout: 15_000 }).toBe(2)
  const [form, attachments] = [await readPdf(downloads[0]), await readPdf(downloads[1])]
  expect(form.name).toMatch(/^GYC .+\.pdf$/)
  expect(form.pages).toBeGreaterThanOrEqual(1)
  expect(attachments.name).toMatch(/\.pdf$/)
  expect(attachments.pages).toBeGreaterThanOrEqual(2)

  await page.getByRole('button', { name: 'Mở email đã điền', exact: true }).click()
  await page.getByRole('button', { name: 'Tôi đã gửi email', exact: true }).click()
  // The claim is locked as sent; the sync badge counts the queued offline writes.
  await expect(page.getByText(/^Hồ sơ đã gửi\./)).toBeVisible()
  if (offline) await expect(page.getByRole('status', { name: 'Trạng thái đồng bộ' })).toContainText('đang chờ')
  return { form, attachments }
}

test.describe('claims.wizard: outpatient claim offline', () => {
  test.setTimeout(180_000)

  test('claims.wizard.create-draft: an outpatient claim is built, its PDFs are saved and sent by mailto offline', async ({
    page,
    context,
  }) => {
    await warmServiceWorker(page)
    await onboard(page)
    await completeProfile(page)
    const external = trackExternalRequests(page)
    await context.setOffline(true)
    await page.reload()

    await fillOutpatientUpToReview(page, noShot)
    await buildAndSendByMailto(page, noShot, true)

    await page.evaluate(() => {
      location.hash = '#/claims'
    })
    await expect(page.getByRole('link', { name: /Nguyễn Văn A · Ngoại trú/ })).toContainText('Đã gửi')
    expect(external).toEqual([])
  })

  test('claim-submission.attachments.offline: an oversize photo is encoded in the page and the attachments still parse offline', async ({
    page,
    context,
  }) => {
    await warmServiceWorker(page)
    await onboard(page)
    await completeProfile(page)
    const external = trackExternalRequests(page)
    await context.setOffline(true)
    await page.reload()

    await startClaim(page, 'Ngoại trú')
    await page.getByLabel('Lý do (ngắn gọn)', { exact: true }).fill('Đau họng')
    await page.getByLabel('Ngày khám', { exact: true }).fill('2026-11-20')
    await page.getByLabel('Cơ sở y tế', { exact: true }).fill('Bệnh viện Mẫu')
    await page.getByLabel('Chẩn đoán', { exact: true }).fill('Viêm họng cấp')
    await page.getByRole('button', { name: 'Tiếp', exact: true }).click()
    await page.locator('section[aria-labelledby="claim-step-invoices"] input[type="file"][multiple]').setInputFiles(RECEIPT)
    await page.getByLabel('Số tiền hóa đơn 1', { exact: true }).fill('750000')
    await page.getByLabel('Số tiền hóa đơn 1', { exact: true }).press('Tab')
    await page.getByRole('button', { name: 'Tiếp', exact: true }).click()

    await attachOversizePhoto(page, 'Đơn thuốc hoặc sổ khám')
    await attachReceipt(page, 'Bảng kê chi tiết', 120)
    await page.getByRole('button', { name: 'Tiếp', exact: true }).click()

    await buildAndSendByMailto(page, noShot, true)
    expect(external).toEqual([])
  })

  test('claim-submission.attachments.ladder: photos above 15 MB are re-encoded in the page and the PDF is at most 15 MB', async ({
    page,
    context,
  }) => {
    await warmServiceWorker(page)
    await onboard(page)
    await completeProfile(page)
    const external = trackExternalRequests(page)
    await context.setOffline(true)
    await page.reload()

    await startClaim(page, 'Ngoại trú')
    await page.getByLabel('Lý do (ngắn gọn)', { exact: true }).fill('Đau họng')
    await page.getByLabel('Ngày khám', { exact: true }).fill('2026-11-20')
    await page.getByLabel('Cơ sở y tế', { exact: true }).fill('Bệnh viện Mẫu')
    await page.getByLabel('Chẩn đoán', { exact: true }).fill('Viêm họng cấp')
    await page.getByRole('button', { name: 'Tiếp', exact: true }).click()

    // Six noisy 2400 x 1800 photos (about 2.9 MB each stored): random pixels keep their JPEG large, so the originals pass 15 MB.
    await attachNoisyPhotos(page, 6)
    for (let n = 1; n <= 6; n++) {
      await page.getByLabel(`Số tiền hóa đơn ${n}`, { exact: true }).fill(String(100000 * n))
      await page.getByLabel(`Số tiền hóa đơn ${n}`, { exact: true }).press('Tab')
    }
    // Stored photos total: the ladder only runs when the originals alone exceed the limit.
    expect(await storedPhotoBytes(page)).toBeGreaterThan(15_000_000)
    await page.getByRole('button', { name: 'Tiếp', exact: true }).click()
    await attachReceipt(page, 'Đơn thuốc hoặc sổ khám', 60)
    await attachReceipt(page, 'Bảng kê chi tiết', 120)
    await page.getByRole('button', { name: 'Tiếp', exact: true }).click()

    const { attachments } = await buildAndSendByMailto(page, noShot, true)
    expect(attachments.bytes).toBeLessThanOrEqual(15_000_000)
    expect(attachments.pages).toBeGreaterThanOrEqual(8)
    expect(external).toEqual([])
  })
})

for (const [viewport, size] of [
  ['narrow', NARROW],
  ['wide', WIDE],
] as const) {
  test.describe(`claims.wizard.layout.${viewport}: the wizard, send step, list and detail at ${size.width} px`, () => {
    test.use({ viewport: size })
    test.setTimeout(180_000)

    test(`claims.wizard.layout.${viewport}, claim-submission.layout.${viewport}, claim-tracking.layout.${viewport}: each step, the send step, the list and the detail have no horizontal scroll`, async ({
      page,
    }) => {
      await warmServiceWorker(page)
      await onboard(page)
      await completeProfile(page)

      const shoot = (name: string) => probe(page, viewport, name)
      await fillOutpatientUpToReview(page, shoot)
      await buildAndSendByMailto(page, shoot, false)

      await page.evaluate(() => {
        location.hash = '#/claims'
      })
      await expect(page.getByRole('link', { name: /Nguyễn Văn A · Ngoại trú/ })).toBeVisible()
      await shoot('list')
      await page.getByRole('link', { name: /Nguyễn Văn A · Ngoại trú/ }).click()
      await expect(page.getByRole('heading', { name: 'Ngoại trú', exact: true })).toBeVisible()
      await shoot('detail')
    })
  })
}

test.describe('claim-submission.originals: an inpatient claim reaches the originals step', () => {
  test.setTimeout(180_000)

  test('claim-submission.originals.confirm: an inpatient claim is sent and the originals are recorded on its detail', async ({
    page,
  }) => {
    await warmServiceWorker(page)
    await onboard(page)
    await completeProfile(page)

    await startClaim(page, 'Nội trú')
    await page.getByLabel('Lý do (ngắn gọn)', { exact: true }).fill('Viêm ruột thừa')
    await page.getByLabel('Ngày nhập viện', { exact: true }).fill('2026-11-20')
    await page.getByLabel('Ngày ra viện', { exact: true }).fill('2026-11-22')
    await page.getByLabel('Cơ sở y tế', { exact: true }).fill('Bệnh viện Mẫu')
    await page.getByLabel('Chẩn đoán', { exact: true }).fill('Viêm ruột thừa cấp')
    await page.getByRole('button', { name: 'Tiếp', exact: true }).click()
    await page.locator('section[aria-labelledby="claim-step-invoices"] input[type="file"][multiple]').setInputFiles(RECEIPT)
    await page.getByLabel('Số tiền hóa đơn 1', { exact: true }).fill('12000000')
    await page.getByLabel('Số tiền hóa đơn 1', { exact: true }).press('Tab')
    await page.getByRole('button', { name: 'Tiếp', exact: true }).click()

    await attachReceipt(page, 'Bảng kê chi tiết viện phí', 120)
    await attachReceipt(page, 'Giấy ra viện', 200)
    await page.getByRole('button', { name: 'Tiếp', exact: true }).click()

    await buildAndSendByMailto(page, noShot, false)
    await page.evaluate(() => {
      location.hash = '#/claims'
    })
    await page.getByRole('link', { name: /Nguyễn Văn A · Nội trú/ }).click()
    await expect(page.getByRole('heading', { name: 'Nộp bản gốc' })).toBeVisible()
    await expect(page.getByText(/Tầng 2, Tòa nhà Thủy Lợi 4/)).toBeVisible()
    await page.getByRole('button', { name: 'Đã nộp bản gốc hôm nay', exact: true }).click()
    await expect(page.getByText(/Đã ghi nhận ngày nộp bản gốc/)).toBeVisible()
  })
})
