import { test, expect, type Page } from '@playwright/test'

const LABELS = ['Trang chủ', 'Hồ sơ', 'Cơ sở y tế', 'Tài khoản']

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

test('app-shell.layout.narrow: four destinations as bottom tab bar with icon and label, no side nav', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'narrow layout is checked on the mobile project')
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('./')
  await onboard(page)

  const tabs = page.getByRole('navigation', { name: 'Thanh tab', exact: true })
  // Role queries skip hidden elements, so the hidden side nav is located by its aria-label.
  const side = page.locator('nav[aria-label="Điều hướng chính"]')
  await expect(tabs).toBeVisible()
  await expect(side).toBeHidden()

  await expect(tabs.getByRole('link')).toHaveCount(4)
  await expect(side.locator('a')).toHaveCount(4)
  for (const [i, label] of LABELS.entries()) {
    const link = tabs.getByRole('link').nth(i)
    await expect(link).toContainText(label)
    await expect(link.locator('svg')).toHaveCount(1)
  }

  await expectNoHorizontalScroll(page)
})

test('app-shell.layout.wide: four destinations as side nav with icon and label, bottom tab bar hidden', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'wide layout is checked on the desktop project')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./')
  await onboard(page)

  const side = page.getByRole('navigation', { name: 'Điều hướng chính', exact: true })
  // Role queries skip hidden elements, so the hidden tab bar is located by its aria-label.
  const tabs = page.locator('nav[aria-label="Thanh tab"]')
  await expect(side).toBeVisible()
  await expect(tabs).toBeHidden()

  await expect(side.getByRole('link')).toHaveCount(4)
  for (const [i, label] of LABELS.entries()) {
    const link = side.getByRole('link').nth(i)
    await expect(link).toContainText(label)
    await expect(link.locator('svg')).toHaveCount(1)
  }

  await expectNoHorizontalScroll(page)
})
