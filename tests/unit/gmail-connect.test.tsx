import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { connect, disconnect, gmailSession, GmailSessionError } from '../../src/data/gmail-session'
import { GisError, loadGis } from '../../src/lib/gis'
import { forgetExplanation, GmailConnect } from '../../src/ui/GmailConnect'
import { setOnline } from '../setup'

const flags = vi.hoisted(() => ({ enabled: true }))

vi.mock('../../src/config', () => ({
  GOOGLE_CLIENT_ID: 'test-client-id',
  gmailEnabled: () => flags.enabled,
}))

vi.mock('../../src/lib/gis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/gis')>()),
  loadGis: vi.fn(async () => {}),
}))

vi.mock('../../src/data/gmail-session', async () => {
  const { signal } = await import('@preact/signals')
  class FakeSessionError extends Error {
    readonly code: string
    constructor(code: string) {
      super(code)
      this.code = code
    }
  }
  return {
    gmailSession: signal<{ status: 'disconnected' } | { status: 'connected'; email: string; expiresAt: number }>({
      status: 'disconnected',
    }),
    GmailSessionError: FakeSessionError,
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
  }
})

const EXPLAIN = 'Ứng dụng chỉ xin quyền gửi thư. Không đọc hộp thư và chỉ gửi khi bạn bấm Gửi.'

beforeEach(() => {
  setOnline(true)
  forgetExplanation()
  flags.enabled = true
  gmailSession.value = { status: 'disconnected' }
  vi.mocked(connect).mockReset().mockImplementation(async () => {})
  vi.mocked(disconnect).mockClear()
  vi.mocked(loadGis).mockClear()
})

describe('gmail-connection.connect: the explanation and the consent window', () => {
  it('gmail-connection.connect.explanation: the first tap shows the send-only explanation and the privacy link before any consent window', async () => {
    render(<GmailConnect />)
    expect(loadGis).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Kết nối Gmail' }))

    expect(await screen.findByText(EXPLAIN)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Chính sách quyền riêng tư' })).toHaveAttribute('href', '/privacy/')
    expect(connect).not.toHaveBeenCalled()
    expect(loadGis).toHaveBeenCalledTimes(1)
  })

  it('gmail-connection.connect.success: after the explanation, the tap opens consent and shows the connected address', async () => {
    vi.mocked(connect).mockImplementation(async () => {
      gmailSession.value = { status: 'connected', email: 'me@gmail.com', expiresAt: Date.now() + 3_600_000 }
    })
    render(<GmailConnect />)

    fireEvent.click(screen.getByRole('button', { name: 'Kết nối Gmail' }))
    const cont = await screen.findByRole('button', { name: 'Tiếp tục' })
    await waitFor(() => expect(cont).toBeEnabled())
    fireEvent.click(cont)

    expect(connect).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Đang kết nối: me@gmail.com')).toBeInTheDocument()
  })

  it('gmail-connection.connect.denied: a closed or refused consent window leaves the app disconnected and says so', async () => {
    vi.mocked(connect).mockRejectedValue(new GisError('consent_denied'))
    render(<GmailConnect />)

    fireEvent.click(screen.getByRole('button', { name: 'Kết nối Gmail' }))
    const cont = await screen.findByRole('button', { name: 'Tiếp tục' })
    await waitFor(() => expect(cont).toBeEnabled())
    fireEvent.click(cont)

    expect(await screen.findByText('Bạn đã từ chối cấp quyền. Có thể dùng email khác.')).toBeInTheDocument()
    expect(gmailSession.value.status).toBe('disconnected')
    expect(screen.getByRole('button', { name: 'Kết nối Gmail' })).toBeInTheDocument()
  })

  it('gmail-connection.connect.offline: offline the tap says a network is needed and opens no window', async () => {
    setOnline(false)
    render(<GmailConnect />)

    fireEvent.click(screen.getByRole('button', { name: 'Kết nối Gmail' }))

    expect(await screen.findByText('Cần mạng để kết nối Gmail.')).toBeInTheDocument()
    expect(screen.queryByText(EXPLAIN)).not.toBeInTheDocument()
    expect(loadGis).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
  })

  it('gmail-connection.connect.not-configured: without a client ID nothing is rendered', () => {
    flags.enabled = false
    const { container } = render(<GmailConnect />)

    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('button', { name: 'Kết nối Gmail' })).not.toBeInTheDocument()
  })

  it('gmail-connection.connect.failed: a session error other than consent says connecting failed', async () => {
    vi.mocked(connect).mockRejectedValue(new GmailSessionError('userinfo'))
    render(<GmailConnect />)

    fireEvent.click(screen.getByRole('button', { name: 'Kết nối Gmail' }))
    const cont = await screen.findByRole('button', { name: 'Tiếp tục' })
    await waitFor(() => expect(cont).toBeEnabled())
    fireEvent.click(cont)

    expect(await screen.findByText('Không kết nối được Gmail. Hãy thử lại.')).toBeInTheDocument()
  })
})

describe('gmail-connection.disconnect: the connected state', () => {
  it('gmail-connection.disconnect.revoke: disconnecting calls the session disconnect and hides the address', async () => {
    gmailSession.value = { status: 'connected', email: 'me@gmail.com', expiresAt: Date.now() + 3_600_000 }
    vi.mocked(disconnect).mockImplementation(async () => {
      gmailSession.value = { status: 'disconnected' }
    })
    render(<GmailConnect />)

    expect(screen.getByText('Đang kết nối: me@gmail.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ngắt kết nối' }))

    await waitFor(() => expect(screen.queryByText('Đang kết nối: me@gmail.com')).not.toBeInTheDocument())
    expect(disconnect).toHaveBeenCalledTimes(1)
  })
})

describe('gmail-connection.connect: the claim settings', () => {
  const account = {
    id: 'account-1',
    displayName: 'Tài khoản mẫu',
    administrator: 'marsh' as const,
    claimEmail: null,
    claimCc: [],
    defaultBank: null,
    onboardedAt: 1,
    updatedAt: 1,
    deleted: 0 as const,
  }

  it('gmail-connection.connect.not-configured: the claim settings show no Gmail control without a client ID', async () => {
    flags.enabled = false
    const { ClaimSettingsForm } = await import('../../src/ui/ClaimSettingsForm')
    render(<ClaimSettingsForm account={account} />)

    expect(screen.getByRole('heading', { name: 'Cài đặt nhận hồ sơ' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kết nối Gmail' })).not.toBeInTheDocument()
  })

  it('gmail-connection.connect.explanation: the claim settings offer the Gmail connection when configured', async () => {
    const { ClaimSettingsForm } = await import('../../src/ui/ClaimSettingsForm')
    render(<ClaimSettingsForm account={account} />)

    expect(screen.getByRole('button', { name: 'Kết nối Gmail' })).toBeInTheDocument()
  })
})
