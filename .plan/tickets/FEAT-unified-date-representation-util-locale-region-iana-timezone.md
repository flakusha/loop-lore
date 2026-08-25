# FEAT: Unified date representation util: locale/region + IANA timezone (backend + frontend)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-i18n

## Summary

Investigation (2026-08-25) of current Date handling:

CURRENT STATE
- Backend src/utils/date.ts: formatTime (ISO 8601 standard/compact) + tzOffset support IANA timezones via Intl. BUT locale is hardcoded to "en-CA"; no locale/region display formats (localized month/day names, locale date order); no relative-time ("2h ago") formatting.
- Frontend src/frontend/alpine/chat-utils/time.ts: formatTime/formatTimeShort use toLocaleTimeString (implicit browser locale, time-only, no date, NO timezone). No IANA tz handling, no i18n locale wiring.
- NO user-level timezone preference exists anywhere (backend uses system/adhoc tz; frontend renders browser-local time).
- i18n locale IS established (src/i18n/*, locale-registry.ts, locale-picker.ts, middleware/i18n.ts) but is not used for date formatting.

GOAL — unified Date representation utility supporting, on BOTH backend and frontend:
1. Formats: ISO (machine), locale display (short/long, date-only, date-time), relative ("2h ago").
2. Regions/locales: respect the active i18n locale (en-US, de-DE, ja-JP, ...) — not hardcoded "en-CA".
3. Timezones: IANA tz on backend (extend existing) AND frontend (currently missing — convert to the user's tz instead of browser-local only).
4. User preference: add a user timezone setting (or derive from browser/offset) that drives rendering consistently.
5. Shared options contract { locale, tz, format } consumable by backend serialization and frontend display; refactor chat-utils/time.ts to consume it.

Relations: resolves the spirit of audit finding B7 (raw Date is idiomatic — the fix is a proper formatting/locale/tz util, not branding every Date).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
