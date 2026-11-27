# facilities Specification

## Purpose
Tra cứu cơ sở y tế bảo lãnh viện phí và cơ sở loại trừ, dùng được offline.

## Requirements

### Requirement: Browse and search facilities
The Cơ sở y tế page SHALL list direct-billing facilities from the bundled dataset and SHALL filter them by free text matched against name, English name and address ignoring case and Vietnamese diacritics, by province, and by service (nội trú, ngoại trú, nha khoa), with filters combinable and the result count shown.

#### Scenario: facilities.search.diacritics
- **GIVEN** the dataset contains "Bệnh viện Bạch Mai"
- **WHEN** the user types "bach mai"
- **THEN** "Bệnh viện Bạch Mai" is in the results

#### Scenario: facilities.search.combined
- **GIVEN** 3 facilities in Hà Nội of which 1 offers dental direct billing
- **WHEN** the user selects province Hà Nội and service nha khoa
- **THEN** exactly 1 facility is listed and the count reads "1 cơ sở"

#### Scenario: facilities.search.empty
- **WHEN** no facility matches the filters
- **THEN** the page says no facility matches and offers to reset the filters

#### Scenario: facilities.search.offline
- **GIVEN** the device is offline
- **WHEN** the user searches
- **THEN** results come from the bundled dataset with no network request

#### Scenario: facilities.layout.narrow
- **WHEN** the viewport is 360 px wide
- **THEN** filters collapse into a filter sheet and results are a single-column list

#### Scenario: facilities.layout.wide
- **WHEN** the viewport is 1280 px wide
- **THEN** filters are a left column, results a middle list and the selected facility's detail a right pane

### Requirement: Excluded facilities
The page SHALL offer a separate view of excluded (blacklisted) facilities with the same search, explaining that PTI pays nothing for costs incurred there, and excluded facilities SHALL NOT appear in the direct-billing list.

#### Scenario: facilities.blacklist.view
- **WHEN** the user switches to "Cơ sở loại trừ"
- **THEN** only facilities with `blacklisted` true are listed, under a warning that PTI does not pay costs there

#### Scenario: facilities.blacklist.separate
- **WHEN** the default view is shown
- **THEN** no facility with `blacklisted` true is listed

### Requirement: Facility detail
The facility detail SHALL show name, address, specialty, the services with direct billing, the hours for direct-billing requests, a call action per phone number, an action opening the address in a map application, and a reminder to bring the insurance card and ID card or passport (birth certificate for children).

#### Scenario: facilities.detail.phones
- **GIVEN** a facility with phone "0969 851 616 / 1900 888 866"
- **WHEN** its detail opens
- **THEN** two call actions link to `tel:0969851616` and `tel:1900888866`

#### Scenario: facilities.detail.map
- **WHEN** the user taps the map action
- **THEN** the link is `https://www.google.com/maps/search/?api=1&query=` followed by the URL-encoded name and address

#### Scenario: facilities.detail.a11y
- **WHEN** the detail renders its icon-only call and map controls
- **THEN** each is reachable by role `link` with an accessible name that includes the phone number or "Bản đồ"

### Requirement: Data freshness
The page SHALL always show the date the facility data was fetched, and the app SHALL show a one-time notice with the added, removed and changed counts when the bundled facilities version differs from the version the user last saw.

#### Scenario: facilities.freshness.date
- **GIVEN** the dataset `fetchedAt` is 2026-11-01
- **WHEN** the page renders
- **THEN** it shows "Dữ liệu PTI cập nhật ngày 01/11/2026" with a note to call the facility before visiting

#### Scenario: facilities.freshness.notice
- **GIVEN** the user last saw facilities version "2026-10" and the bundled version is "2026-11" with changes `{ added: 3, removed: 1, changed: 2 }`
- **WHEN** the app starts
- **THEN** a notice reads "Danh sách cơ sở y tế đã cập nhật: thêm 3, bỏ 1, thay đổi 2"
- **AND** after the user dismisses it, it does not show again for version "2026-11"

### Requirement: Nearest first, on a Google map
The page SHALL ask the browser for the user's position when it opens (kept in memory only, never stored or sent) and, when granted, SHALL list the facilities matching the filters from nearest to farthest with the distance on each row: facilities with a building-level point first, then those placed only at their province centre (distance marked "≈"), then those without a point. Points come from `public/data/facilities/geo.json`, made at refresh time from OpenStreetMap Nominatim. When a Google Maps API key is built in, the page SHALL show a Google map with one pin per listed facility and a dot for the user, framed on the user and the nearest facilities; tapping a pin opens that facility. Without a key, or when the map cannot load, the list works as before.

#### Scenario: facilities.nearby.sort
- **GIVEN** the user is in TP.HCM and the list has three facilities in Hà Nội and one in TP.HCM, all with points
- **WHEN** the page opens and the position is granted
- **THEN** the TP.HCM facility is listed first with its distance, and the page says it is sorted by the user's position

#### Scenario: facilities.nearby.no-location
- **WHEN** the position is denied or unavailable
- **THEN** the list keeps the dataset order and a note offers to try again

#### Scenario: facilities.geo.lookup
- **WHEN** the refresh script runs
- **THEN** it keeps existing building-level points, looks up new or changed facilities and province-centre points again (at most one request per second), and drops results outside Viet Nam
