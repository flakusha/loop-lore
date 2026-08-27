# BUG: server-view date display ignores user timezone/locale

**Status:** ⬜ Not Started
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
