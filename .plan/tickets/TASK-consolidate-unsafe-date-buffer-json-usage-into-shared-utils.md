# TASK: Consolidate unsafe Date/Buffer/JSON usage into shared utils

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-code-quality

## Summary

Strict review of unsafe primitive usage across src/ (non-test). Utils already exist for all three families:

EXISTING UTILS
- Date: src/utils/date.ts — toDate (guards invalid -> Invalid Date), formatHuman (locale+TZ), serializeDate (unix|iso|human|compact), formatTime (ISO w/ TZ offset).
- JSON: src/utils/safe-json.ts — safeJsonParse / safe stringify.
- Buffer: src/utils/safe-buffer/ (base64.ts, compression.ts, string.ts) + safeFromUint8Array.

EVIDENCE (src/, excl tests)
- Date: 339 new Date() total (307 now-form); 32 new Date(<var/expr>) needs-review; 31 toLocale*; 10 Date.parse.
- JSON: 8 JSON.parse, 7 JSON.stringify (most already route via safe-json.ts or low-risk trusted input).
- Buffer: 65 Buffer.* (some already use safeFromUint8Array; raw Buffer.from/alloc remain).

FINDINGS (severity)
1. [MINOR-BLOCKING] Locale/TZ-naive display: 31 toLocale* + new Date(<var>).toLocale* render in runtime/browser tz, NOT the user's i18n locale/tz -> user-visible wrongness. Fix: route through formatHuman (locale=active i18n locale, tz=viewer tz). Affects routes/views/characters.ts:112, routes/chat-export/format.ts:77/193, frontend/alpine/key-management.ts:135, notification-center.ts:166, admin.ts:140, pages/quests.ts:167, chat-sections.ts:165.
2. [MINOR] Untrusted parse without guard: new Date(userInput) can yield Invalid Date -> NaN logic. age-gate/service.ts:98 (birthDate from user), middleware/nsfw-gate/constants.ts:27. Fix: toDate() + validity check.
3. [NIT] Date.parse (10) returns NaN unchecked. Fix: toDate().
4. [NIT] Raw JSON.parse remains in scripts/version-bump.ts:108/114, routes/views/layout.ts:73 (already try-wrapped). Low risk (trusted). Fix: safeJsonParse for consistency.
5. [NIT] Raw Buffer.from/alloc (65) — many fine (encoding specified). Inconsistent with safe-buffer/. Fix: route untrusted/arrayBuffer via safeFromUint8Array; use safe-buffer for new code.

DIRECTIVE: utils function usage is preferable — new code MUST route Date/Buffer/JSON through the above utils; retroactive consolidation tracked here.

Relations: pairs with FEAT-unified-date-representation-util-locale-region-iana-timezone (issue 7118f58, epic-i18n) which built the Date util + frontend wiring.


## Resolution — frontend display sites (2026-08-25, worktree `datetime-utils`)

Finding #1's directly-fixable surface (frontend Alpine components that have the
active i18n locale + viewer timezone available) is RESOLVED:

- Added shared `formatDisplayDate(iso, humanStyle)` helper to
  `src/frontend/alpine/chat-utils/time.ts` — centralizes the wiring
  (active i18n locale via `globalThis.currentLocale` + viewer browser tz via
  `Intl.DateTimeFormat().resolvedOptions().timeZone`) so every frontend date
  render uses `formatHuman` instead of the runtime-default `toLocale*`.
- Routed 5 components through it:
  - `frontend/alpine/key-management.ts` (formatDate -> datetime)
  - `frontend/alpine/notification-center.ts` (timeAgo -> datetime)
  - `frontend/alpine/admin.ts` (formatDate -> date)
  - `frontend/alpine/chat-sections.ts` (formatSectionTime -> time)
  - `frontend/pages/quests.ts` (formatDate -> date)

Evidence: `bun run typecheck:frontend` green; 59 frontend tests pass
(chat-sections.test.ts formatSectionTime still passes; +6 formatDisplayDate tests).

DEFERRED (needs tz architecture, not a pure refactor): server-rendered views
`routes/views/characters.ts:112` and `routes/chat-export/format.ts:77,193`
render on the SERVER and have no viewer timezone (no user-tz preference exists).
These require passing the user's tz into the server render path — tracked here,
separate from the frontend fix.

Findings #2-#5 remain as retroactive consolidation tracked in this ticket.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
