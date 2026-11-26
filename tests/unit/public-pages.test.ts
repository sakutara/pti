import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const root = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8')

/** Visible text of an HTML document: scripts/styles dropped, block tags become spaces, inline tags vanish, whitespace collapsed. */
function plainText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(p|h[1-6]|li|ul|ol|section|nav|main|div|hr|br)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Whitespace-normalised sentence check, so line wrapping in the source HTML does not matter. */
const normalise = (s: string) => s.replace(/\s+/g, ' ').trim()

const about = read('public/about/index.html')
const privacy = read('public/privacy/index.html')
const aboutText = plainText(about)
const privacyText = plainText(privacy)
const englishAbout = /<section lang="en"[\s\S]*?<\/section>/.exec(about)?.[0] ?? ''
const englishPrivacy = /<section lang="en"[\s\S]*?<\/section>/.exec(privacy)?.[0] ?? ''

describe('public-pages.about', () => {
  it('public-pages.about.content: names the app and describes preparing and sending claims', () => {
    expect(aboutText).toContain('PTI Claim')
    expect(aboutText).toContain(normalise('chuẩn bị và gửi hồ sơ yêu cầu bồi thường bảo hiểm'))
  })

  it('public-pages.about.content: states that data stays on the device', () => {
    expect(aboutText).toContain(normalise('lưu thông tin bảo hiểm trên máy của mình'))
    expect(aboutText).toContain(normalise('Dữ liệu cá nhân, ảnh và hồ sơ được lưu trên thiết bị của bạn'))
  })

  it('public-pages.about.content: states non-affiliation with PTI and Marsh', () => {
    expect(aboutText).toContain(normalise('không liên kết với PTI hay Marsh'))
  })

  it('public-pages.about.gmail-usage: asks only for permission to send email on the user\'s behalf', () => {
    expect(aboutText).toContain(normalise('ứng dụng chỉ xin quyền gửi thư thay mặt bạn'))
  })

  it('public-pages.about.gmail-usage: sends only emails the user composed and confirmed', () => {
    expect(aboutText).toContain(normalise('Ứng dụng chỉ gửi email do bạn soạn và bấm xác nhận'))
  })

  it('public-pages.about.gmail-usage: cannot read the mailbox', () => {
    expect(aboutText).toContain(normalise('không thể đọc hộp thư của bạn'))
  })

  it('public-pages.about.links: links to /privacy/ and to /', () => {
    expect(about).toMatch(/<a [^>]*href="\/privacy\/"/)
    expect(about).toMatch(/<a [^>]*href="\/"/)
  })

  it('public-pages.about.english-summary: has a lang="en" section', () => {
    expect(englishAbout).not.toBe('')
  })

  it('public-pages.about.english-summary: summarises purpose, data handling and Gmail permission use', () => {
    const en = plainText(englishAbout)
    expect(en).toContain('PTI Claim is a web app')
    expect(en).toContain('prepare and send insurance claims')
    expect(en).toContain("Personal data stays on the user's device")
    expect(en).toContain("asks only for permission to send email on the user's behalf")
  })
})

describe('public-pages.privacy', () => {
  it('public-pages.privacy.no-server: personal data is stored only in the browser on the device', () => {
    expect(privacyText).toContain(normalise('Dữ liệu cá nhân chỉ được lưu trong trình duyệt trên thiết bị của bạn'))
  })

  it('public-pages.privacy.no-server: the project operates no server that receives personal data', () => {
    expect(privacyText).toContain(normalise('Dự án không vận hành máy chủ nào nhận dữ liệu này'))
    expect(plainText(englishPrivacy)).toContain('The project operates no server that receives your personal data')
  })

  it('public-pages.privacy.google-data: Gmail permission is used only to send emails the user initiates', () => {
    expect(privacyText).toContain(normalise('chỉ được dùng để gửi những email bạn chủ động gửi và xác nhận'))
  })

  it('public-pages.privacy.google-data: mailbox content is never read', () => {
    expect(privacyText).toContain(normalise('Ứng dụng không bao giờ đọc nội dung hộp thư'))
    expect(plainText(englishPrivacy)).toContain('Mailbox content is never read')
  })

  it('public-pages.privacy.google-data: access token is only kept in memory', () => {
    expect(privacyText).toContain(normalise('chỉ nằm trong bộ nhớ khi ứng dụng đang mở'))
    expect(plainText(englishPrivacy)).toContain('The access token is kept only in memory')
  })

  it('public-pages.privacy.google-data: Google user data is not transferred, sold or used for advertising', () => {
    expect(privacyText).toContain(normalise('không được chuyển cho bên thứ ba, không được bán và không dùng cho quảng cáo'))
    expect(plainText(englishPrivacy)).toContain(
      'Google user data is not transferred to third parties, not sold and not used for advertising',
    )
  })

  it('public-pages.privacy.limited-use: adheres to the Google API Services User Data Policy incl. Limited Use', () => {
    expect(privacyText).toContain(normalise('Việc PTI Claim sử dụng và chuyển giao thông tin nhận được từ Google API tuân thủ'))
    expect(privacyText).toContain('Chính sách Dữ liệu Người dùng của Google API Services')
    expect(privacyText).toContain('yêu cầu Sử dụng Hạn chế (Limited Use)')
    expect(plainText(englishPrivacy)).toContain(
      'adheres to the Google API Services User Data Policy, including the Limited Use requirements',
    )
  })

  it('public-pages.privacy.revoke-delete: explains disconnecting Gmail, revoking and deleting local data', () => {
    expect(privacyText).toContain('Ngắt kết nối Gmail ngay trong ứng dụng')
    expect(privacy).toContain('href="https://myaccount.google.com/permissions"')
    expect(privacyText).toContain(normalise('Xóa toàn bộ dữ liệu trên máy'))
  })

  it('public-pages.privacy.contact: shows a real contact email and no placeholder', () => {
    expect(privacy).not.toContain('__CONTACT_EMAIL__')
    expect(privacy).toMatch(/href="mailto:[^"@\s]+@[^"\s]+\.[a-z]{2,}"/)
    expect(privacy).not.toMatch(/example\.(com|org|net)/)
  })
})

describe('public-pages.routing', () => {
  const config = read('vite.config.ts')

  it('public-pages.routing.not-spa-fallback: navigation fallback denylist contains /about/ and /privacy/', () => {
    expect(config).toContain('navigateFallbackDenylist')
    expect(config).toContain('/^\\/about\\//')
    expect(config).toContain('/^\\/privacy\\//')
  })

  it('public-pages.routing.not-spa-fallback: html pages stay in the precache glob', () => {
    expect(config).toContain("'**/*.{js,css,html,")
  })
})
