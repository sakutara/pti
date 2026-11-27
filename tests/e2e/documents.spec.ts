import { test, expect, type BrowserContext, type Locator, type Page, type Request } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The synthetic receipt as an upload (a buffer, so it can be mixed with generated files in one pick). */
const RECEIPT = {
  name: 'receipt.jpg',
  mimeType: 'image/jpeg',
  buffer: readFileSync(fileURLToPath(new URL('../fixtures/receipt.jpg', import.meta.url))),
}
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])
const PROPOSED = '2.718.900 đ'

/** Completes onboarding with the fixed holder and closes the install hint when it appears. */
async function onboard(page: Page) {
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

/** Online first visit, then wait until the service worker controls the page (precache and runtime cache in place). */
async function warmServiceWorker(page: Page) {
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
}

/** Opens #/documents inside the running app, the way the Home link does. */
async function openDocuments(page: Page) {
  await page.evaluate(() => {
    location.hash = '#/documents'
  })
  await expect(page.getByRole('heading', { level: 2, name: 'Chứng từ', exact: true })).toBeVisible()
}

/** Picks files through the device file input of the add bar (hidden in the DOM, like a real picker). */
async function addFiles(page: Page, files: Parameters<Locator['setInputFiles']>[0]) {
  await page.locator('input[type="file"]:not([capture])').setInputFiles(files)
}

const list = (page: Page) => page.getByRole('list', { name: 'Danh sách chứng từ' })

/** Opens the newest card once the list holds `count` documents (the live list lags the pick by a moment). */
async function openNewest(page: Page, count: number) {
  await expect(list(page).getByRole('listitem')).toHaveCount(count)
  await list(page).getByRole('listitem').first().getByRole('button').click()
}

/** Box of a locator, failing the test if it is not rendered. */
async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element has no box')
  return box
}

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

/** A fake e-invoice: plain text in a PDF made by Chromium's own print engine (text layer, no image). */
async function makeEInvoicePdf(context: BrowserContext): Promise<Buffer> {
  const scratch = await context.newPage()
  try {
    await scratch.setContent(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><style>
      body { font-family: Arial, Helvetica, sans-serif; font-size: 16px; padding: 40px; }
    </style></head><body>
      <h2>HÓA ĐƠN GIÁ TRỊ GIA TĂNG ĐIỆN TỬ (GIẢ)</h2>
      <p>Ngày 04 tháng 10 năm 2026</p>
      <p>Người mua: Nguyễn Văn Mẫu</p>
      <p>Tổng tiền thanh toán: 2.718.900</p>
    </body></html>`)
    return await scratch.pdf({ format: 'A4', printBackground: false })
  } finally {
    await scratch.close()
  }
}

test.describe('document-library.layout: documents page layout', () => {
  test('document-library.layout.narrow: at 360 px documents are a two-column grid and an opened one fills the screen', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto('./')
    await onboard(page)
    await openDocuments(page)
    await addFiles(page, [
      RECEIPT,
      { name: 'second.jpg', mimeType: 'image/jpeg', buffer: await page.screenshot({ type: 'jpeg', quality: 60 }) },
    ])
    await expect(list(page).getByRole('listitem')).toHaveCount(2)

    const columns = await list(page).evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    expect(columns).toBe(2)
    const [first, second] = await list(page).getByRole('listitem').evaluateAll((items) =>
      items.map((li) => li.getBoundingClientRect()),
    )
    expect(Math.abs(first.top - second.top)).toBeLessThan(1)
    expect(first.left).toBeLessThan(second.left)
    await expectNoHorizontalScroll(page)

    await list(page).getByRole('listitem').first().getByRole('button').click()
    await expect(list(page)).toBeHidden()
    const editor = page.locator('article')
    await expect(editor).toBeVisible()
    const editorBox = await boxOf(editor)
    expect(editorBox.x + editorBox.width).toBeLessThanOrEqual(360)
    expect(editorBox.width).toBeGreaterThan(300)
    await expectNoHorizontalScroll(page)
  })

  test('document-library.layout.wide: at 1280 px the grid is on the left and the editor is a right pane', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('./')
    await onboard(page)
    await openDocuments(page)
    await addFiles(page, [RECEIPT])
    await expect(list(page).getByRole('listitem')).toHaveCount(1)

    await list(page).getByRole('listitem').first().getByRole('button').click()
    const editor = page.locator('article')
    await expect(editor).toBeVisible()
    await expect(list(page)).toBeVisible()

    const gridBox = await boxOf(list(page))
    const paneBox = await boxOf(editor)
    const titleBox = await boxOf(page.getByRole('heading', { level: 2, name: 'Chứng từ', exact: true }))
    expect(gridBox.x + gridBox.width).toBeLessThanOrEqual(paneBox.x)
    expect(Math.abs(titleBox.y - paneBox.y)).toBeLessThan(80)
    await expectNoHorizontalScroll(page)
  })

  test('document-ocr.review.layout.narrow: at 360 px the image sits above the amount field, without horizontal scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto('./')
    await onboard(page)
    await openDocuments(page)
    await addFiles(page, [RECEIPT])
    await list(page).getByRole('listitem').first().getByRole('button').click()

    const image = await boxOf(page.locator('article figure'))
    const amount = await boxOf(page.getByLabel('Số tiền', { exact: true }))
    expect(image.y + image.height).toBeLessThanOrEqual(amount.y)
    expect(amount.x + amount.width).toBeLessThanOrEqual(360)
    await expectNoHorizontalScroll(page)
  })

  test('document-ocr.review.layout.wide: at 1280 px the image and the amount field are side by side', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('./')
    await onboard(page)
    await openDocuments(page)
    await addFiles(page, [RECEIPT])
    await list(page).getByRole('listitem').first().getByRole('button').click()

    const image = await boxOf(page.locator('article figure'))
    const amount = await boxOf(page.getByLabel('Số tiền', { exact: true }))
    expect(image.x + image.width).toBeLessThanOrEqual(amount.x)
    await expectNoHorizontalScroll(page)
  })
})

test.describe('document-ocr: reading on the device', () => {
  test('document-ocr.model.offline-ready: with the model downloaded and the device offline, a photo is read to 2.718.900', async ({
    page,
    context,
  }) => {
    test.setTimeout(480_000)
    await warmServiceWorker(page)
    await onboard(page)
    await openDocuments(page)

    // A first photo that is not the receipt (the same bytes would be refused as a duplicate). Its pending invoice is what
    // makes the model offer appear.
    const warmup = await page.screenshot({ type: 'jpeg', quality: 60 })
    await addFiles(page, [{ name: 'warmup.jpg', mimeType: 'image/jpeg', buffer: warmup }])
    const download = page.getByRole('button', { name: 'Tải bộ đọc chữ', exact: true })
    await expect(download).toBeVisible()
    await download.click()
    // The banner leaves the page once the model is ready (the button only changes label while downloading).
    await expect(page.getByRole('region', { name: 'Bộ đọc chữ hóa đơn' })).toBeHidden({ timeout: 300_000 })
    await expect(page.getByText('Đang chờ đọc', { exact: true })).toBeHidden({ timeout: 300_000 })

    // Network requests only: blob: previews of the photo stay in memory and never reach the network.
    const network: Request[] = []
    page.on('request', (req) => {
      if (req.url().startsWith('http:') || req.url().startsWith('https:')) network.push(req)
    })

    await context.setOffline(true)
    await addFiles(page, [RECEIPT])
    await openNewest(page, 2)

    await expect(page.getByRole('button', { name: PROPOSED, exact: true })).toBeVisible({ timeout: 300_000 })
    expect(network.filter((req) => !LOCAL_HOSTS.has(new URL(req.url()).hostname)).map((req) => req.url())).toEqual([])
    expect(network.filter((req) => req.postData() !== null).map((req) => req.url())).toEqual([])
  })

  test('document-ocr.pdf.text: an e-invoice PDF is read offline without the model and its first page is previewed', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000)
    await warmServiceWorker(page)
    await onboard(page)
    const pdf = await makeEInvoicePdf(context)
    await openDocuments(page)

    await context.setOffline(true)
    await addFiles(page, [{ name: 'einvoice.pdf', mimeType: 'application/pdf', buffer: pdf }])
    await openNewest(page, 1)

    await expect(page.getByRole('button', { name: PROPOSED, exact: true })).toBeVisible()
    await expect(page.getByText('Theo nhãn tổng tiền', { exact: true })).toBeVisible()

    const preview = page.getByRole('img', { name: 'Trang 1', exact: true })
    await expect(preview).toBeVisible()
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  })
})
