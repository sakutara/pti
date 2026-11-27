/*
 * Gmail API send client. Findings used for the design (checked against the Gmail API reference from memory,
 * since this build makes no network calls; re-check when the API changes):
 * - Size: Gmail rejects a sent message over 25 MB including attachments (base64 adds about 33%), and the
 *   media upload endpoint accepts up to 35 MB. The app keeps both PDFs under 15 MB (attachments-pdf), so the
 *   25 MB guard below is a backstop, not the normal path.
 * - threadId: with uploadType=media the body is raw RFC 822 only, so no metadata (threadId, labelIds) can be
 *   sent. The app never replies into a thread, so the threadId in the answer is only stored for the link
 *   to the thread.
 */

export const GMAIL_SEND_URL =
  'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media'
export const GMAIL_MAX_MESSAGE_BYTES = 25 * 1024 * 1024

/** HTTP 401: the access token is missing, expired or revoked. The caller asks the user for a new token. */
export class TokenExpiredError extends Error {
  constructor() {
    super('Gmail access token expired')
    this.name = 'TokenExpiredError'
  }
}

/** Any other failure of the send. `status` is 0 when the request never got an answer (network). */
export class GmailError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'GmailError'
    this.status = status
  }
}

export interface SentMessage {
  id: string
  threadId: string
}

/** Sends one RFC 822 message as the signed-in user. Never retries; a 401 surfaces as TokenExpiredError. */
export async function sendMessage(token: string, mime: Uint8Array<ArrayBuffer>): Promise<SentMessage> {
  if (mime.byteLength > GMAIL_MAX_MESSAGE_BYTES) throw new GmailError(0, 'message too large for Gmail')

  let res: Response
  try {
    res = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'message/rfc822' },
      body: mime,
    })
  } catch {
    throw new GmailError(0, 'network error while sending')
  }

  if (res.status === 401) throw new TokenExpiredError()
  if (!res.ok) throw new GmailError(res.status, `Gmail answered ${res.status}`)

  const data = (await res.json().catch(() => null)) as { id?: unknown; threadId?: unknown } | null
  if (!data || typeof data.id !== 'string' || typeof data.threadId !== 'string') {
    throw new GmailError(res.status, 'Gmail answer has no message id')
  }
  return { id: data.id, threadId: data.threadId }
}
