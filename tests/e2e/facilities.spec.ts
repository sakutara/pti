import { test, expect, type Page } from '@playwright/test'

const SEARCH_LABEL = 'Tìm theo tên hoặc địa chỉ'
const BACH_MAI_HREF = '#/facilities/f-76c24651ba2f'
const RESULT_LINKS = 'a[href^="#/facilities/"]'

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

/** Opens #/facilities inside the running app and waits for the list. */
async function openFacilities(page: Page) {
  await page.evaluate(() => {
    location.hash = '#/facilities'
  })
  await expect(page.getByRole('searchbox', { name: SEARCH_LABEL })).toBeVisible()
  await expect(page.getByText(/^\d+ cơ sở$/)).toBeVisible()
}

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test.describe('narrow layout', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  test('facilities.layout.narrow: 360 px has a sticky search, a filter sheet and a single-column list', async ({ page }) => {
    await page.goto('./')
    await onboard(page)
    await openFacilities(page)

    await expect(page.getByRole('searchbox', { name: SEARCH_LABEL })).toBeVisible()
    const filterButton = page.getByRole('button', { name: 'Mở bộ lọc' })
    await expect(filterButton).toBeVisible()
    await expect(page.getByLabel('Tỉnh/thành')).toBeHidden()

    const boxes = await page.locator(RESULT_LINKS).evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y }
      }),
    )
    expect(boxes.length).toBeGreaterThan(1)
    for (const box of boxes) expect(Math.abs(box.x - boxes[0].x)).toBeLessThan(1)
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].y).toBeGreaterThan(boxes[i - 1].y)

    await filterButton.click()
    const sheet = page.getByRole('dialog', { name: 'Bộ lọc' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByLabel('Tỉnh/thành')).toBeVisible()
    await sheet.getByRole('button', { name: 'Đóng bộ lọc' }).click()
    await expect(page.getByRole('dialog', { name: 'Bộ lọc' })).toBeHidden()

    await expectNoHorizontalScroll(page)
  })

  test('facilities.detail.open: on narrow the detail is its own page with a way back to the list', async ({ page }) => {
    await page.goto('./')
    await onboard(page)
    await openFacilities(page)

    await page.locator(RESULT_LINKS).first().click()
    await expect(page.getByRole('link', { name: 'Bản đồ', exact: true })).toBeVisible()
    await expect(page.locator(RESULT_LINKS).first()).toBeHidden()

    await page.getByRole('button', { name: 'Quay lại danh sách' }).click()
    await expect(page.locator(RESULT_LINKS).first()).toBeVisible()
    await expectNoHorizontalScroll(page)
  })
})

test.describe('wide layout', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('facilities.layout.wide: 1280 px shows filters, list and detail as three columns with the nav highlighted', async ({ page }) => {
    await page.goto('./')
    await onboard(page)
    await page.evaluate((hash) => {
      location.hash = hash
    }, BACH_MAI_HREF)
    await expect(page.getByRole('searchbox', { name: SEARCH_LABEL })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Bản đồ', exact: true })).toBeVisible()

    await expect(page.getByRole('button', { name: 'Mở bộ lọc' })).toBeHidden()
    const province = await page.getByLabel('Tỉnh/thành').boundingBox()
    const result = await page.locator(`a[href="${BACH_MAI_HREF}"]`).boundingBox()
    const detail = await page.getByRole('link', { name: 'Bản đồ', exact: true }).boundingBox()
    expect(province && result && detail).toBeTruthy()
    expect(province!.x).toBeLessThan(result!.x)
    expect(result!.x).toBeLessThan(detail!.x)

    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' })
    await expect(nav.getByRole('link', { name: 'Cơ sở y tế' })).toHaveAttribute('aria-current', 'page')
    await expectNoHorizontalScroll(page)
  })

  test('facilities.detail.phones: the Bạch Mai detail offers a call link per number and a map link', async ({ page }) => {
    await page.goto('./')
    await onboard(page)
    await page.evaluate((hash) => {
      location.hash = hash
    }, BACH_MAI_HREF)

    await expect(page.getByRole('link', { name: /0969851616/ })).toHaveAttribute('href', 'tel:0969851616')
    await expect(page.getByRole('link', { name: /1900888866/ })).toHaveAttribute('href', 'tel:1900888866')
    await expect(page.getByRole('link', { name: 'Bản đồ', exact: true })).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/)
  })

  test('facilities.search.combined: filters survive a detail round trip through Back', async ({ page }) => {
    await page.goto('./')
    await onboard(page)
    await openFacilities(page)

    await page.getByLabel('Tỉnh/thành').selectOption({ label: 'Thành phố Hà Nội' })
    await page.getByRole('button', { name: 'Nha khoa', exact: true }).click()
    await expect(page).toHaveURL(/#\/facilities\?p=01&s=dental$/)
    const count = await page.getByText(/^\d+ cơ sở$/).textContent()

    await page.locator(RESULT_LINKS).first().click()
    await expect(page.getByRole('link', { name: 'Bản đồ', exact: true })).toBeVisible()
    await page.goBack()

    await expect(page).toHaveURL(/#\/facilities\?p=01&s=dental$/)
    await expect(page.getByText(count ?? '', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nha khoa', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })

  test('facilities.search.diacritics: typing updates the list after the debounce and adds no history entries', async ({ page }) => {
    await page.goto('./')
    await onboard(page)
    await openFacilities(page)
    const before = await page.evaluate(() => history.length)

    await page.getByRole('searchbox', { name: SEARCH_LABEL }).pressSequentially('bach mai', { delay: 40 })

    await expect(page.locator(`a[href="${BACH_MAI_HREF}"]`)).toBeVisible()
    await expect(page).toHaveURL(/#\/facilities\?q=bach%20mai$/)
    expect(await page.evaluate(() => history.length)).toBe(before)
  })

  test('facilities.blacklist.view: the excluded view shows the warning and marks the toggle pressed', async ({ page }) => {
    await page.goto('./')
    await onboard(page)
    await openFacilities(page)

    const toggle = page.getByRole('button', { name: 'Cơ sở loại trừ', exact: true })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText(/PTI không chi trả chi phí khám, điều trị tại các cơ sở loại trừ/)).toBeVisible()
    await expectNoHorizontalScroll(page)
  })
})

test.describe('wide layout', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('facilities.layout.wide: at 1280 px the province filter sits directly under the search box', async ({ page }) => {
    await page.goto('./')
    await onboard(page)
    await openFacilities(page)

    const search = page.getByRole('searchbox', { name: SEARCH_LABEL })
    const province = page.getByLabel('Tỉnh/thành')
    await expect(province).toBeVisible()
    const searchBox = await search.boundingBox()
    const provinceBox = await province.boundingBox()
    expect(searchBox).not.toBeNull()
    expect(provinceBox).not.toBeNull()
    expect(provinceBox!.y - searchBox!.y).toBeLessThan(200)
    await expectNoHorizontalScroll(page)
  })
})
