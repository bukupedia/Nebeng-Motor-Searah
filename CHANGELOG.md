# Changelog

All notable changes to **Nebeng Motor Searah** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Pre-1.0 versions map to development phases.

## [Unreleased]

### Notes

- `js/app.js` has not been created yet. `index.html` loads it as a module, so
  the map, WhatsApp checkout, and admin panel stay inert until the
  orchestrator wires the modules to the DOM.
- No release tags exist yet. The version headings below describe development
  phases rather than tagged releases.

## [0.2.0] - 2026-11-25

### Added

- `js/map.js`
  - `RideMap` controller that initializes Leaflet on `#map` with OpenStreetMap
    tiles and a scale control.
  - `drawRoute(routeData)` that requests road geometry from the public OSRM API
    for the start point, every waypoint, and the destination.
  - Route polyline, start/destination markers, and numbered meeting-point
    markers.
  - Draggable pickup marker that also moves when the map is clicked.
  - `locateUser()` using `navigator.geolocation`, with Indonesian error
    messages.
  - `getPickupDistance()` returning `{ lat, lng, distanceKm, isOutOfRoute }`
    using Haversine distance against the route geometry and waypoints.
  - Detour-radius circle, request abort on route change, 12-second timeout,
    and a dashed straight-line fallback when OSRM is unavailable.
  - `haversineKm()` and `shortestDistanceToPointsKm()` helpers.
- `js/whatsapp.js`
  - `buildWhatsAppUrl(phoneNumber, bookingData)` with `encodeURIComponent`.
  - Separate `boncengan` and `paket` message formats.
  - Ride message includes helmet choice, luggage, route, departure time,
    meeting point, pickup landmark, Google Maps pickup link, and fuel
    contribution.
  - Package message includes recipient name and WhatsApp number, package size,
    10 kg limit, handover location, and delivery fee.
  - `normalizePhoneNumber()` and `buildBookingMessage()` exports.
- `js/admin.js`
  - `AdminPanel` class and `initAdminPanel()` factory.
  - Reads `?status=`, `?jam=`, and `?admin=1`, validates them, and persists
    state in `localStorage`.
  - Reveals `#admin-panel` when `admin=1` and updates availability and
    departure time from the panel.
  - Generates a public share URL, an admin URL, and a WhatsApp Status message.
  - Copy-to-clipboard with the Clipboard API and an `execCommand` fallback.
  - ARIA updates for the status pill and pressed-state buttons.
- Admin UI in `index.html`: departure-time input, public share-link field, and
  "Salin status WhatsApp" button.
- Admin styles in `css/style.css`: pressed-state outline, copy-feedback error
  state, and readonly input styling.

### Changed

- The admin banner markup now includes departure-time, share-link, and copy
  controls; `js/admin.js` activates them.
- The admin status controls use `aria-pressed` for toggle state.

### Notes

- `js/app.js` is still pending, so these modules are not imported by the page
  yet.

## [0.1.0] - 2026-11-25

### Added

- Mobile-first static app shell with Tailwind CSS, Leaflet, Font Awesome, and
  Plus Jakarta Sans via CDN.
- `js/config.js` with `RIDER_CONFIG` and two `ROUTES`:
  - Rider identity, WhatsApp number `62895332782122`, motorcycle, masked plate,
    spare helmet, and `maxDetourKm: 5`.
  - Morning and evening Meruya Selatan–Sudirman schedules with five meeting
    points each.
- Rider profile card with an `Available` / `Booked` status pill.
- Map section with `#map`, a "Use My GPS Location" button, and a detour
  indicator.
- Service tabs for Motorcycle Ride Sharing and Same-Direction Package Delivery.
- Ride and package booking forms with route, meeting point, pickup landmark,
  helmet, luggage, passenger/recipient, and optional social media fields.
- `css/style.css` with responsive map sizing, tab transitions, status pulse,
  custom scrollbar, focus-visible rings, and reduced-motion support.
- Hidden `#admin-panel` shell for future status updates.

### Notes

- The first repository commit (`e238513`) contained only `README.md`.
- `index.html` already references `js/app.js`; the file is added in a later
  phase.

## Development history

| Date (UTC) | Commit | Scope |
| --- | --- | --- |
| 2026-11-25 | [`e238513`](https://github.com/bukupedia/Nebeng-Motor-Searah/commit/e238513) | Initial commit with `README.md` only. |
| 2026-11-25 | [`a763428`](https://github.com/bukupedia/Nebeng-Motor-Searah/commit/a763428) | Phase 1: static UI, rider config, and styles. |
| 2026-11-25 | [`6054f84`](https://github.com/bukupedia/Nebeng-Motor-Searah/commit/6054f84) | Phase 2: map, WhatsApp, and admin modules. |

## Known limitations

- `js/app.js` is not implemented, so the page currently renders the static
  shell only.
- OSRM and OpenStreetMap are public demo services without availability
  guarantees; the map falls back to a dashed line when OSRM fails.
- Admin state is stored per device in `localStorage`; the URL query string is
  the shareable source of truth.
- There is no build step, automated test suite, or CI workflow yet.

## Contributors

- arifbudiman — author of record for the repository commits.
- OpenHands — AI pair programmer (co-author).
