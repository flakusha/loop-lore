<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: server-view date display ignores user timezone/locale

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Resolved (client-side rendering, 2026-09-15)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-i18n

## Summary

**Severity**: MINOR (blocking for users with non-runtime timezone)

**Sites**:

- `routes/views/characters.ts:112` — `new Date(c.updated_at).toLocaleDateString()`
- `routes/chat-export/format.ts:77` — `new Date(msg.created_at).toLocaleString()`
- `routes/chat-export/format.ts:193` — same pattern

**Root cause**: these server-side renders have no access to the browser's viewer timezone or active i18n locale — the user preference for tz is not passed into the server render path. Naive `new Date(iso).toLocaleString()` renders in the runtime's default TZ (e.g. JST), not the user's.

**Proof**: `new Date('2026-07-04T14:30:00Z').toLocaleString()` → `7/4/2026, 11:30:00 PM` (runtime JST); `formatHuman(iso,{locale:'de-DE',tz:'Europe/Berlin'})` → `4. Juli 2026 um 16:30` (correct for user in Berlin).

**Fix direction**: pass the user's preferred timezone into the server render path (requires architectural change — no user-tz preference exists today). Alternatively, render ISO and shift TZ rendering to the client.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution (2026-09-15, commit `72735c9a6`)

Implemented the ticket's "alternatively" branch: server now emits
machine-readable UTC ISO + `<time data-client-date>` and the browser renders
the viewer's own zone/locale via a `hydrateClientDates` hydrator in
`src/frontend/alpine-init.ts` (runs on load + `htmx:afterSwap`).
`routes/views/characters.ts` (chat-list `.chat-time`) and
`routes/chat-export/format.ts` (markdown/HTML/plaintext stamps; standalone
HTML export keeps ISO `<time>` for portability) covered. New `toIsoUtc`
helpers pin zone-less SQLite `datetime('now')` text to UTC. 16
`format.test.ts` tests pass incl. 3 new ISO/time-element assertions.
DEFERRED 2026-09-08: MINOR severity; fix requires either a user-timezone preference plumbed into server render paths (new feature) or client-side date rendering (template rework across 3 sites). Both are feature-sized; needs product decision before implementation.
