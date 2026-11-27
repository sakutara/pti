## MODIFIED Requirements

### Requirement: Home summary
Trang chủ SHALL show the holder's name and tier, a shortcut to open the card wallet, a shortcut to create a new claim, a shortcut to the invoice guidance card, and the number of claims in status `submitted` or `need_info`, with the number of overdue claims when there are any.

#### Scenario: app-shell.home.summary
- **GIVEN** an account whose holder is "Nguyễn Văn A", tier 2, with 2 claims in status `submitted` and 1 in `paid`
- **WHEN** the user opens Trang chủ
- **THEN** it shows "Nguyễn Văn A", "Hạng 2" and "2 hồ sơ đang xử lý"

#### Scenario: app-shell.home.overdue
- **GIVEN** one of the 2 submitted claims is overdue
- **WHEN** the user opens Trang chủ
- **THEN** it also shows "1 hồ sơ quá hạn phản hồi"

#### Scenario: app-shell.home.no-account
- **GIVEN** no account exists on the device
- **WHEN** the user opens any route
- **THEN** the onboarding screen is shown instead
