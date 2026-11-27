import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const CARD_IMAGE = fileURLToPath(new URL('../fixtures/card.png', import.meta.url))
const BACKUP_NAME = /^pti-backup-\d{8}-\d{4}\.ptibackup$/
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

/** Records every http(s) request that leaves the local origin. */
function trackExternalRequests(page: Page): string[] {
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
async function warmServiceWorker(page: Page) {
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
}

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

test('app-shell.offline.reload: shell renders offline after first visit', async ({ page, context }) => {
  await warmServiceWorker(page)
  await onboard(page)

  await context.setOffline(true)
  await page.reload()

  await expect(page.getByRole('heading', { level: 1, name: 'PTI Claim' })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Trạng thái đồng bộ' })).toContainText('Ngoại tuyến')
})

test('account.onboarding.no-network: onboarding works offline and makes no network request', async ({ page, context }) => {
  await warmServiceWorker(page)
  const external = trackExternalRequests(page)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Bắt đầu', exact: true })).toBeVisible()

  await onboard(page)

  expect(external).toEqual([])
})

test('backup.export.offline: backup file is produced and downloaded without network', async ({ page, context }) => {
  await warmServiceWorker(page)
  await onboard(page)
  const external = trackExternalRequests(page)

  await context.setOffline(true)
  await page.reload()
  await page.getByRole('link', { name: 'Tài khoản', exact: true }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Sao lưu', exact: true }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(BACKUP_NAME)
  expect(await download.failure()).toBeNull()
  expect(external).toEqual([])
})

test('offline.preview.wallet: offline onboarding, card image and card wallet work with no network', async ({ page, context }) => {
  await warmServiceWorker(page)
  const external = trackExternalRequests(page)

  await context.setOffline(true)
  await page.reload()
  await onboard(page)

  // Open the holder's edit page from the account page.
  await page.getByRole('link', { name: 'Tài khoản', exact: true }).click()
  await page.getByRole('link', { name: /Nguyễn Văn A/ }).click()
  await expect(page.getByRole('heading', { name: 'Nguyễn Văn A', exact: true })).toBeVisible()

  // Front card image through the gallery (non-capture) input.
  await page.getByTestId('card-scan-pick').setInputFiles(CARD_IMAGE)
  await expect(page.getByRole('img', { name: 'Ảnh thẻ bảo hiểm' })).toBeVisible()

  await page.evaluate(() => {
    location.hash = '#/wallet'
  })
  await expect(page.getByRole('img', { name: 'Thẻ bảo hiểm của Nguyễn Văn A' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nguyễn Văn A', exact: true })).toBeVisible()

  expect(external).toEqual([])
})

test('benefits.dataset.offline: after one online visit, #/benefits shows the bundled benefits offline', async ({ page, context }) => {
  await page.clock.setFixedTime(new Date('2026-11-26T10:00:00'))
  await warmServiceWorker(page)
  await onboard(page)
  // Load the page once online so the app has read the benefits dataset.
  await page.evaluate(() => {
    location.hash = '#/benefits'
  })
  await expect(page.getByText('16.000.000 đ/năm', { exact: true }).first()).toBeVisible()

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Nguyễn Văn A', exact: true })).toBeVisible()
  await expect(page.getByText('Hạng 2', { exact: true })).toBeVisible()
  await expect(page.getByText('16.000.000 đ/năm', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('4.000.000 đ/lần khám', { exact: true }).first()).toBeVisible()
})

test('facilities.search.offline: after one online visit, "bach mai" finds Bệnh viện Bạch Mai offline with no network request', async ({ page, context }) => {
  await warmServiceWorker(page)
  await onboard(page)
  // One online visit reads the facilities dataset, so the app has it before the device goes offline.
  await page.evaluate(() => {
    location.hash = '#/facilities'
  })
  await expect(page.getByText(/^\d+ cơ sở$/)).toBeVisible()
  const external = trackExternalRequests(page)

  await context.setOffline(true)
  await page.reload()
  await page.getByRole('searchbox', { name: 'Tìm theo tên hoặc địa chỉ' }).pressSequentially('bach mai', { delay: 40 })

  await expect(page.locator('a[href="#/facilities/f-76c24651ba2f"]')).toContainText('Bệnh viện Bạch Mai')
  expect(external).toEqual([])
})
