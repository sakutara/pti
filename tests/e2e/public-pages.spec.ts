import { test, expect, type Page } from '@playwright/test'

const ABOUT_TITLE = 'Giới thiệu'
const PRIVACY_LINK = 'Chính sách quyền riêng tư'

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

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test('public-pages.about.links: privacy link is fully visible without scrolling at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('./about/')

  await expect(page.getByRole('link', { name: PRIVACY_LINK, exact: true })).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('link', { name: 'Mở ứng dụng', exact: true })).toHaveAttribute('href', '/')
  await expectNoHorizontalScroll(page)
})

test('public-pages.about.links: about page links to privacy and to the app root', async ({ page }) => {
  await page.goto('./about/')
  await expect(page.getByRole('link', { name: PRIVACY_LINK, exact: true })).toHaveAttribute('href', '/privacy/')
  await expect(page.getByRole('link', { name: 'Mở ứng dụng', exact: true })).toHaveAttribute('href', '/')
})

test('public-pages.layout.narrow: about and privacy pages do not scroll horizontally at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  for (const path of ['./about/', './privacy/']) {
    await page.goto(path)
    await expect(page.locator('main')).toBeVisible()
    await expectNoHorizontalScroll(page)
  }
})

test('public-pages.layout.wide: text column is capped at 42rem and centred at 1280 px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  for (const path of ['./about/', './privacy/']) {
    await page.goto(path)
    const main = page.locator('main')
    const box = await main.boundingBox()
    if (!box) throw new Error('main has no box')
    const style = await main.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { padX: parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), maxWidth: cs.maxWidth }
    })
    expect(style.maxWidth).toBe('672px')
    expect(box.width).toBeLessThanOrEqual(672 + style.padX + 0.5)
    const leftGap = box.x
    const rightGap = 1280 - (box.x + box.width)
    expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(1)
  }
})

test('public-pages.links.onboarding: onboarding shows the two legal links that open /about/ and /privacy/', async ({ page }) => {
  await page.goto('./')
  const nav = page.getByRole('navigation', { name: 'Thông tin pháp lý', exact: true })
  await expect(nav.getByRole('link', { name: ABOUT_TITLE, exact: true })).toHaveAttribute('href', '/about/')
  await expect(nav.getByRole('link', { name: PRIVACY_LINK, exact: true })).toHaveAttribute('href', '/privacy/')

  await nav.getByRole('link', { name: ABOUT_TITLE, exact: true }).click()
  await expect(page).toHaveURL(/\/about\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'PTI Claim' })).toBeVisible()
})

test('public-pages.links.account: Tài khoản page shows the same two legal links', async ({ page }) => {
  await page.goto('./')
  await onboard(page)
  await page.getByRole('link', { name: 'Tài khoản', exact: true }).first().click()

  // Only one legal nav is visible at a time: inside the Account page below lg, the side nav at lg and up.
  const nav = page.getByRole('navigation', { name: 'Thông tin pháp lý', exact: true })
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('link', { name: ABOUT_TITLE, exact: true })).toHaveAttribute('href', '/about/')
  await expect(nav.getByRole('link', { name: PRIVACY_LINK, exact: true })).toHaveAttribute('href', '/privacy/')
  await expect(nav.getByRole('link', { name: PRIVACY_LINK, exact: true })).toBeVisible()
})

test('public-pages.offline: after one online visit, /privacy/ opens offline from precache', async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  // One online visit to the policy, then the page must come from the precache.
  await page.goto('./privacy/')
  await expect(page.getByRole('heading', { level: 1, name: 'Chính sách quyền riêng tư — PTI Claim' })).toBeVisible()

  await context.setOffline(true)
  await page.goto('./privacy/')
  await expect(page.getByRole('heading', { level: 1, name: 'Chính sách quyền riêng tư — PTI Claim' })).toBeVisible()
  await context.setOffline(false)
})
