import { test, expect } from '@playwright/test'
import { completeProfile, fillOutpatientUpToReview, noShot, onboard, warmServiceWorker } from './helpers'

/** Fake Google Identity Services: the consent answers at once with a token, no window and no Google account. */
const FAKE_GIS = `window.google = { accounts: { oauth2: { initTokenClient(cfg) { return { requestAccessToken() {
  cfg.callback({ access_token: 'fake-access-token', expires_in: 3600 })
} } } } } };`

/** Any request to a Google host that no fake answers is aborted and recorded. */
const GOOGLE_HOSTS = /^https:\/\/([\w-]+\.)*(google\.com|googleapis\.com|gstatic\.com)\//

test.describe('claim-submission.gmail: the Gmail confirmation', () => {
  test.setTimeout(240_000)

  test('claim-submission.gmail.offline: the confirm screen lists the sender, recipient and files; Gửi is disabled offline and nothing is sent', async ({
    page,
    context,
  }) => {
    const blocked: string[] = []
    const sends: string[] = []
    // Playwright answers with the last matching route, so the catch-all goes first and the fakes after it.
    await context.route(GOOGLE_HOSTS, (route) => {
      blocked.push(route.request().url())
      return route.abort()
    })
    await context.route(/accounts\.google\.com\/gsi\/client/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_GIS }),
    )
    await context.route(/www\.googleapis\.com\/oauth2\/v3\/userinfo/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ email: 'me@gmail.com' }) }),
    )
    await context.route(/gmail\.googleapis\.com\/upload\/gmail\/v1\/users\/me\/messages\/send/, (route) => {
      sends.push(route.request().url())
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'm1', threadId: 't1' }) })
    })

    await warmServiceWorker(page)
    await onboard(page)
    await completeProfile(page)
    await fillOutpatientUpToReview(page, noShot)
    await page.getByRole('button', { name: 'Dựng hai tệp PDF', exact: true }).click()

    // Connect Gmail from the send step: explanation, then consent (faked).
    await page.getByRole('button', { name: 'Kết nối Gmail', exact: true }).click()
    await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click()

    // The confirmation: sender, recipient, copy, subject and both files with sizes.
    await expect(page.getByText('Gửi từ me@gmail.com', { exact: true })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('Gửi bằng Gmail', { exact: true })).toBeVisible()
    await expect(page.getByText('nhanhsbt.mn@pti.com.vn', { exact: true })).toBeVisible()
    await expect(page.getByText('vietnamMMBclaims@marsh.com', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Tiêu đề', { exact: true })).not.toHaveValue('')
    await expect(page.getByText(/^GYC .+\.pdf$/)).toBeVisible()
    await expect(page.getByText(/^Chứng từ .+\.pdf$/)).toBeVisible()
    await expect(page.getByText(/ (KB|MB)$/).first()).toBeVisible()
    expect(sends).toEqual([])

    await context.setOffline(true)
    await expect(page.getByText(/^Đang ngoại tuyến nên chưa gửi được/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Gửi', exact: true })).toBeDisabled()
    expect(sends).toEqual([])
    expect(blocked).toEqual([])
  })
})
