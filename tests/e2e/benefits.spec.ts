import { test, expect, type Locator, type Page } from '@playwright/test'

/** Fixed clock inside policy year 2026 (2026-06-01 → 2027-05-31) so the page picks that year. */
const NOW = new Date('2026-11-26T10:00:00')

/** Completes onboarding with the fixed holder (tier 2) and closes the install hint when it appears. */
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

/** Adds a voluntary dependent of tier 3 from the Tài khoản page. */
async function addVoluntaryDependent(page: Page, fullName: string) {
  await page.getByRole('link', { name: 'Tài khoản', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Cài đặt nhận hồ sơ', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Thêm người thân', exact: true }).click()

  await page.getByLabel('Họ và tên', { exact: true }).fill(fullName)
  await page.getByLabel('Ngày sinh', { exact: true }).fill('2015-03-02')
  await page.getByLabel('Quan hệ', { exact: true }).selectOption('child')
  await page.getByLabel('Loại người được bảo hiểm', { exact: true }).selectOption('voluntary')
  await page.getByLabel('Hạng bảo hiểm', { exact: true }).selectOption('3')
  await page.getByRole('button', { name: 'Lưu', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Cài đặt nhận hồ sơ', exact: true })).toBeVisible()
}

/** Opens #/benefits inside the already-running app (same as the wallet e2e does). */
async function openBenefits(page: Page) {
  await page.evaluate(() => {
    location.hash = '#/benefits'
  })
  await expect(page.getByRole('heading', { level: 2, name: /Nguyễn Văn A|Trần Thị B/ })).toBeVisible()
}

/** The <section> that holds a category heading (BenefitGroup). */
function groupSection(page: Page, category: string): Locator {
  return page.getByRole('heading', { name: category, exact: true }).locator('xpath=ancestor::section[1]')
}

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
})

test('benefits.person.default-holder: holder tier 2 shows tier, member type and employee outpatient values', async ({ page }) => {
  await page.goto('./')
  await onboard(page)
  await openBenefits(page)

  await expect(page.getByRole('heading', { level: 2, name: 'Nguyễn Văn A', exact: true })).toBeVisible()
  await expect(page.getByText('Hạng 2', { exact: true })).toBeVisible()
  await expect(page.getByText('Nhân viên', { exact: true })).toBeVisible()

  // benefits.person.format: outpatient group for an employee of tier 2.
  const outpatient = groupSection(page, 'Ngoại trú')
  await expect(outpatient.getByText('16.000.000 đ/năm', { exact: true })).toBeVisible()
  await expect(outpatient.getByText('4.000.000 đ/lần khám', { exact: true })).toBeVisible()
  // benefits.person.copay: no co-pay is shown for an employee.
  await expect(outpatient.getByText(/Đồng chi trả/)).toHaveCount(0)
})

test('benefits.person.switch: a voluntary dependent of tier 3 shows its tier, member type, values and co-pay', async ({ page }) => {
  await page.goto('./')
  await onboard(page)
  await addVoluntaryDependent(page, 'Trần Thị B')
  await openBenefits(page)

  await page.getByRole('button', { name: 'Trần Thị B', exact: true }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Trần Thị B', exact: true })).toBeVisible()
  await expect(page.getByText('Hạng 3', { exact: true })).toBeVisible()
  await expect(page.getByText('Người thân tự nguyện', { exact: true })).toBeVisible()

  const outpatient = groupSection(page, 'Ngoại trú')
  await expect(outpatient.getByText('16.500.000 đ/năm', { exact: true })).toBeVisible()
  await expect(outpatient.getByText('Đồng chi trả 30%', { exact: true })).toBeVisible()
})

test('benefits.compare.layout.wide: at 1280 px the comparison is a 4-tier table with the person tier marked', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'wide layout is checked on the desktop project')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./')
  await onboard(page)
  await openBenefits(page)

  // Two columns at lg: the person (left) comes before the policy-year info (right), and both start in the first viewport.
  const personHeading = page.getByRole('heading', { level: 2, name: 'Nguyễn Văn A', exact: true })
  const policyYearHeading = page.getByRole('heading', { level: 3, name: /^Năm hợp đồng/ })
  const personBox = await personHeading.boundingBox()
  const policyYearBox = await policyYearHeading.boundingBox()
  if (!personBox || !policyYearBox) throw new Error('person or policy-year heading has no box')
  expect(personBox.x).toBeLessThan(policyYearBox.x)
  expect(personBox.y).toBeLessThan(800)
  expect(policyYearBox.y).toBeLessThan(800)
  expect(Math.abs(personBox.y - policyYearBox.y)).toBeLessThanOrEqual(100)

  await page.getByRole('button', { name: 'So sánh hạng', exact: true }).click()

  const table = page.locator('table[aria-label="So sánh hạng"]')
  await expect(table).toBeVisible()
  for (const tier of ['Hạng 1', 'Hạng 2', 'Hạng 3', 'Hạng 4']) {
    await expect(table.getByRole('columnheader', { name: tier, exact: true })).toBeVisible()
  }
  await expect(table.getByRole('columnheader', { name: 'Hạng 2', exact: true })).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('[role="tablist"]')).toBeHidden()

  // The table uses the full content width of the benefits section, not one of its two columns.
  const section = page.getByRole('heading', { level: 2, name: 'Nguyễn Văn A', exact: true }).locator('xpath=ancestor::section[1]')
  const sectionBox = await section.boundingBox()
  const tableBox = await table.boundingBox()
  if (!sectionBox || !tableBox) throw new Error('section or table has no box')
  expect(tableBox.width).toBeGreaterThanOrEqual(sectionBox.width * 0.95)
  await expectNoHorizontalScroll(page)
})

test('benefits.compare.layout.narrow: at 360 px the comparison is a 4-tab sheet without horizontal scroll', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'narrow layout is checked on the mobile project')
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('./')
  await onboard(page)
  await openBenefits(page)
  await expectNoHorizontalScroll(page)

  await page.getByRole('button', { name: 'So sánh hạng', exact: true }).click()

  const tablist = page.getByRole('tablist', { name: 'So sánh hạng', exact: true })
  await expect(tablist).toBeVisible()
  await expect(tablist.getByRole('tab')).toHaveCount(4)
  for (const tier of ['Hạng 1', 'Hạng 2', 'Hạng 3', 'Hạng 4']) {
    await expect(tablist.getByRole('tab', { name: tier, exact: true })).toBeVisible()
  }
  await expect(page.locator('table[aria-label="So sánh hạng"]')).toBeHidden()
  await expectNoHorizontalScroll(page)
})
