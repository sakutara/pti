import { test, expect, type Locator, type Page } from '@playwright/test'

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

/** The <section> that contains the heading with this text. */
function sectionByHeading(page: Page, heading: string): Locator {
  return page.getByRole('heading', { name: heading, exact: true }).locator('xpath=ancestor::section[1]')
}

async function openAccount(page: Page) {
  await page.getByRole('link', { name: 'Tài khoản', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Cài đặt nhận hồ sơ', exact: true })).toBeVisible()
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element has no bounding box')
  return box
}

test('account.layout.narrow: holder, dependents, claim settings and backup stacked in one column', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'narrow layout is checked on the mobile project')
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('./')
  await onboard(page)
  await openAccount(page)

  const people = sectionByHeading(page, 'Người được bảo hiểm và người thân')
  const claim = sectionByHeading(page, 'Cài đặt nhận hồ sơ')
  const backup = sectionByHeading(page, 'Sao lưu và khôi phục')
  await expect(people.getByRole('link', { name: /Nguyễn Văn A/ })).toBeVisible()
  await expect(claim).toBeVisible()
  await expect(backup).toBeVisible()

  const peopleBox = await boxOf(people)
  const claimBox = await boxOf(claim)
  const backupBox = await boxOf(backup)
  expect(Math.abs(peopleBox.x - claimBox.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(claimBox.x - backupBox.x)).toBeLessThanOrEqual(1)
  expect(peopleBox.y).toBeLessThan(claimBox.y)
  expect(claimBox.y).toBeLessThan(backupBox.y)

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('account.layout.wide: person list in left pane, claim settings and backup in right pane', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'wide layout is checked on the desktop project')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./')
  await onboard(page)
  await openAccount(page)

  const people = sectionByHeading(page, 'Người được bảo hiểm và người thân')
  const claim = sectionByHeading(page, 'Cài đặt nhận hồ sơ')
  const backup = sectionByHeading(page, 'Sao lưu và khôi phục')
  await expect(people.getByRole('link', { name: /Nguyễn Văn A/ })).toBeVisible()

  const peopleBox = await boxOf(people)
  const claimBox = await boxOf(claim)
  const backupBox = await boxOf(backup)
  // Left pane: person list. Right pane: claim settings, with backup below it.
  expect(peopleBox.x).toBeLessThan(claimBox.x)
  expect(claimBox.x).toBeCloseTo(backupBox.x, 0)
  // Same row: the person list overlaps the claim settings vertically.
  expect(peopleBox.y).toBeLessThan(claimBox.y + claimBox.height)
  expect(claimBox.y).toBeLessThan(peopleBox.y + peopleBox.height)
  expect(claimBox.y).toBeLessThan(backupBox.y)

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
