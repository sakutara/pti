import { test, expect } from '@playwright/test'

test('app-shell.offline.reload: shell renders offline after first visit', async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Sync status' })).toContainText('Offline')
})

test('app-shell.layout: bottom tabs on mobile, side nav on desktop, no horizontal scroll', async ({ page }, info) => {
  await page.goto('./')
  const tabs = page.getByRole('navigation', { name: 'Tabs' })
  const side = page.getByRole('navigation', { name: 'Primary' })
  if (info.project.name === 'mobile') { await expect(tabs).toBeVisible(); await expect(side).toBeHidden() }
  else { await expect(side).toBeVisible(); await expect(tabs).toBeHidden() }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
