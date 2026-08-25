# FEAT: Unified date representation util: locale/region + IANA timezone (backend + frontend)

**Status:** 🟡 In Progress — implemented in worktree `datetime-utils` (awaiting finalize)
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


## Implementation (2026-08-25, worktree `datetime-utils`)

Single source of truth: extended backend `src/utils/date.ts` (already imported by the
frontend bundle via `src/frontend/alpine/logger.ts`).

Added API:
- `toDate(input?: Date | number | string): Date` — normalize via the **native `Date`
  constructor** (no custom parser). `""` → Invalid Date; `undefined` → now.
- `formatHuman(input, { locale?, tz?, humanStyle? }): string` — locale/region + IANA
  timezone aware display (Intl). Display-only (not `Date`-parseable).
- `serializeDate(input, format, { locale?, tz? }): number | string` with
  `DateFormat = "unix" | "iso" | "human" | "compact"`.

The 4 prioritized formats:
1. **Unix** — `serializeDate(x, "unix")` → epoch ms (`Date.now()` for "now").
2. **Standard ISO** — `formatTime({ date, tz })` / `serializeDate(x, "iso")` →
   `yyyy-mm-ddTHH:MM:SS.ttt+/-xxtz`, **native-`Date` round-trippable** (tested).
3. **Human-readable** — `formatHuman` / `serializeDate(x, "human")` → locale/region
   display (e.g. de-DE "4. Juli 2026, 16:30", ja-JP "2026/7/4 23:30").
4. **Exact ISO w/ ms + tz** — identical to #2 (canonical transport string).

Frontend (`src/frontend/alpine/chat-utils/time.ts`) consumes the shared util:
- `formatTime` / `formatTimeShort` (time-only) + new `formatDate` (date-time) render in the
  **active i18n locale** (`globalThis.currentLocale`, set by `saveLocale`) + the **viewer's
  browser timezone** (`Intl.DateTimeFormat().resolvedOptions().timeZone`).

Deferred (out of prioritized scope):
- User-level timezone *preference* (DB setting): frontend uses the viewer's browser tz;
  backend still accepts an explicit `tz` param. Ticket note retained for future.
- Relative-time ("2h ago"): not in the prioritized format list; can be added later via
  `Intl.RelativeTimeFormat` without API churn.

Verification: backend `date.test.ts` + new frontend `chat-utils/time.test.ts`
(51 tests pass); `bun run typecheck` + `typecheck:frontend` green; oxlint 0 errors.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
