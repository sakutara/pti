## ADDED Requirements

### Requirement: Connect Gmail
The app SHALL let the user connect a Gmail account from the claim settings and from the send step, after showing an explanation that the permission only allows sending email the user confirms and cannot read the mailbox, with a link to the privacy policy; once connected it SHALL show the connected email address.

#### Scenario: gmail-connection.connect.success
- **GIVEN** a configured client ID and an online device
- **WHEN** the user taps "Kết nối Gmail" and grants permission
- **THEN** the connected email address is shown and the send step offers sending by Gmail

#### Scenario: gmail-connection.connect.explanation
- **WHEN** the user taps "Kết nối Gmail" for the first time in a session
- **THEN** an explanation of the send-only permission and a link to `/privacy/` are shown before the Google consent window opens

#### Scenario: gmail-connection.connect.denied
- **WHEN** the user closes or denies the Google consent window
- **THEN** the app stays disconnected, shows that nothing was connected, and the send step still offers the mailto fallback

#### Scenario: gmail-connection.connect.offline
- **GIVEN** the device is offline
- **WHEN** the user taps "Kết nối Gmail"
- **THEN** the app says a network connection is needed to connect and does not open any window

#### Scenario: gmail-connection.connect.not-configured
- **GIVEN** `src/config.ts` has an empty Google client ID
- **WHEN** the claim settings and the send step render
- **THEN** no Gmail connect or Gmail send control is shown and only the mailto fallback is offered

### Requirement: Least privilege
The app SHALL request exactly the scopes `openid`, `email` and `https://www.googleapis.com/auth/gmail.send` for Gmail and SHALL NOT request any scope that reads, composes, modifies or manages the mailbox.

#### Scenario: gmail-connection.scopes.exact
- **WHEN** the token request is built
- **THEN** its scope string is exactly `openid email https://www.googleapis.com/auth/gmail.send`

### Requirement: Token handling
The access token SHALL be kept only in memory for the current page session, SHALL expire with Google's token lifetime, and SHALL NOT be written to IndexedDB, local or session storage, the outbox, backup files or logs.

#### Scenario: gmail-connection.token.memory-only
- **GIVEN** the user is connected
- **WHEN** the page is reloaded
- **THEN** the app shows disconnected

#### Scenario: gmail-connection.token.not-persisted
- **GIVEN** the user is connected
- **WHEN** a backup is exported and all browser storage is inspected
- **THEN** the token string appears nowhere

#### Scenario: gmail-connection.token.expired
- **GIVEN** Gmail answers a send with HTTP 401
- **WHEN** the user is still on the send step
- **THEN** the app asks for a new token on the user's next tap and does not retry silently in the background

### Requirement: Disconnect
The user SHALL be able to disconnect Gmail, which revokes the token with Google and clears the in-memory state.

#### Scenario: gmail-connection.disconnect.revoke
- **GIVEN** the user is connected
- **WHEN** the user taps "Ngắt kết nối"
- **THEN** the token is revoked through Google's revoke call, the connected address disappears and the app shows disconnected
