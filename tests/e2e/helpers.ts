import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const RECEIPT = fileURLToPath(new URL('../fixtures/receipt.jpg', import.meta.url))
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

/** Records every http(s) request that leaves the local origin. */
export function trackExternalRequests(page: Page): string[] {
  const external: string[] = []
  page.on('request', (req) => {
    const url = new URL(req.url())
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !LOCAL_HOSTS.has(url.hostname)) {
      external.push(req.url())
    }
  })
  return external
}

/** Online first visit, then wait until the service worker controls the page. */
export async function warmServiceWorker(page: Page) {
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
}

/** Completes onboarding with the fixed holder and closes the install hint when it appears. */
export async function onboard(page: Page) {
  await page.getByLabel('Họ và tên', { exact: true }).fill('Nguyễn Văn A')
  await page.getByLabel('Ngày sinh', { exact: true }).fill('1990-05-01')
  await page.getByLabel('Hạng bảo hiểm', { exact: true }).selectOption('2')
  await page.getByRole('button', { name: 'Bắt đầu sử dụng', exact: true }).click()

  const close = page.getByRole('button', { name: 'Đóng', exact: true })
  const home = page.getByRole('heading', { name: 'Nguyễn Văn A', exact: true })
  await expect(close.or(home)).toBeVisible()
  if (await close.isVisible()) await close.click()
  await expect(home).toBeVisible()
}

/** Holder profile and claim bank account: the review step lists these as missing until they are filled. Fake data only. */
export async function completeProfile(page: Page) {
  await page.getByRole('link', { name: 'Tài khoản', exact: true }).click()
  await page.getByRole('link', { name: /Nguyễn Văn A/ }).click()
  await page.getByLabel('Tên công ty (bên mua bảo hiểm)', { exact: true }).fill('Công ty Mẫu')
  await page.getByLabel('Số hợp đồng/GCN', { exact: true }).fill('HD-001')
  await page.getByLabel('Điện thoại', { exact: true }).fill('0900000000')
  await page.getByLabel('Email', { exact: true }).fill('nguyen.a@example.com')
  await page.getByLabel('Mã nhân viên', { exact: true }).fill('NV-001')
  await page.getByLabel('Chức danh', { exact: true }).fill('Kỹ sư')
  // The payout account lives on the employee page only, picked from the bank list.
  const bank = page.getByLabel('Ngân hàng', { exact: true })
  await bank.click()
  await bank.fill('vietcom')
  await page.getByRole('option', { name: /Vietcombank \(VCB\)/ }).click()
  await page.getByLabel('Tên chủ tài khoản', { exact: true }).fill('NGUYEN VAN A')
  await page.getByLabel('Số tài khoản', { exact: true }).fill('000111222333')
  await page.getByRole('button', { name: 'Lưu', exact: true }).click()
  // Saving returns to the account page; wait for that before going on.
  await expect(page).toHaveURL(/#\/account$/)
}

/**
 * A copy of receipt.jpg with a coloured band, drawn and exported by the page's canvas. Documents are deduplicated by
 * the hash of the re-encoded image, so each document needs different pixels, not different trailing bytes.
 */
export async function receiptVariant(page: Page, hue: number): Promise<Buffer> {
  const base64 = readFileSync(RECEIPT).toString('base64')
  const dataUrl = await page.evaluate(
    async ({ base64, hue }) => {
      const img = new Image()
      img.src = `data:image/jpeg;base64,${base64}`
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no 2d context')
      ctx.drawImage(img, 0, 0)
      ctx.fillStyle = `hsl(${hue} 90% 50%)`
      ctx.fillRect(0, 0, canvas.width, Math.round(canvas.height / 8))
      return canvas.toDataURL('image/jpeg', 0.9)
    },
    { base64, hue },
  )
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

/** Attaches a receipt variant to the requirement section with this title; the row shows its remove control once stored. */
export async function attachReceipt(page: Page, title: string, hue: number) {
  const buffer = await receiptVariant(page, hue)
  await page
    .locator(`section[aria-label="${title}"] input[type="file"]:not([capture])`)
    .first()
    .setInputFiles({ name: `${title}.jpg`, mimeType: 'image/jpeg', buffer })
  await expect(page.locator(`section[aria-label="${title}"]`).getByRole('button', { name: /^Gỡ / })).toHaveCount(1, {
    timeout: 30_000,
  })
}

/** Opens the wizard for a new claim, selects the holder and the type, and continues to the treatment step. */
export async function startClaim(page: Page, type: string, shoot: (name: string) => Promise<void> = noShot) {
  await page.goto('./#/claims/new')
  await shoot('wizard-person')
  await page.getByRole('button', { name: /Nguyễn Văn A/ }).click()
  await page.getByRole('button', { name: 'Tiếp', exact: true }).click()
  await shoot('wizard-type')
  await page.getByRole('button', { name: type, exact: true }).click()
  await page.getByRole('button', { name: 'Tiếp', exact: true }).click()
}

export const noShot = async (_name: string) => {}

/** Outpatient treatment, one invoice and two documents, from the treatment step to the review step. */
export async function fillOutpatientUpToReview(page: Page, shoot: (name: string) => Promise<void>) {
  await startClaim(page, 'Ngoại trú', shoot)
  await page.getByLabel('Lý do (ngắn gọn)', { exact: true }).fill('Đau họng')
  await page.getByLabel('Ngày khám', { exact: true }).fill('2026-11-20')
  await page.getByLabel('Cơ sở y tế', { exact: true }).fill('Bệnh viện Mẫu')
  await page.getByLabel('Chẩn đoán', { exact: true }).fill('Viêm họng cấp')
  await shoot('wizard-treatment')
  await page.getByRole('button', { name: 'Tiếp', exact: true }).click()

  // Invoice: one photo from the device, then the amount typed (a typed amount is confirmed).
  await page.locator('section[aria-labelledby="claim-step-invoices"] input[type="file"][multiple]').setInputFiles(RECEIPT)
  const amount = page.getByLabel('Số tiền hóa đơn 1', { exact: true })
  await amount.fill('750000')
  await amount.press('Tab')
  // A typed amount is confirmed by the user, so no "Cần xác nhận" marker remains.
  await expect(page.locator('[data-total]')).toHaveText('750.000 đ')
  await expect(page.getByText('Cần xác nhận', { exact: true })).toHaveCount(0)
  await shoot('wizard-invoices')
  await page.getByRole('button', { name: 'Tiếp', exact: true }).click()

  // Documents: each required section gets a receipt photo.
  await attachReceipt(page, 'Đơn thuốc hoặc sổ khám', 60)
  await attachReceipt(page, 'Bảng kê chi tiết', 120)
  await shoot('wizard-documents')
  await page.getByRole('button', { name: 'Tiếp', exact: true }).click()
}
