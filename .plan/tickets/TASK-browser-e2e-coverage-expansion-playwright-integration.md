# TASK: Browser e2e coverage expansion — Playwright integration

**Status:** 🟡 In Progress
**Priority:** High
**Effort:** Medium
**Type:** Feature Task / Test Infrastructure
**Tags:** testing, e2e, browser, playwright
**Epic:** epic-testing-qa

## Summary

Investigate current browser e2e coverage (7 `*.browser.ts` files, 40 cases) and add new test cases for untested views/flows. Worktree: `tree/test-playwright-integration-updates` (branch `test/playwright-integration-updates`).

## Coverage Investigation (2026-08-06)

### What the 7 browser suites cover today

| Suite | Cases | What it asserts |
| ----- | ----- | --------------- |
| `smoke.browser.ts` | 10 | Per-view presence: chat, characters, gallery, settings, worlds, new-chat, login, layout/nav (testid existence only) |
| `navigation.browser.ts` | ~8 | Sidebar htmx nav, hamburger toggle, header-slot integrity, new-chat create+redirect, settings shell, login presence |
| `htmx-alpine.browser.ts` | ~13 | htmx→Alpine init, morph state reset, Escape-key panel close, htmx modal lazy-load (characters create, gallery upload), toast dedup, sidebar store sync, chat-list selection, chat-settings + user-preferences modals |
| `characters-flow.browser.ts` | ~5 | Grid load, create/import modal open, detail modal open, start-chat redirect |
| `worlds-flow.browser.ts` | ~4 | List load, create modal open + fields, seeded list render, world-card → detail nav |
| `chat-flow.browser.ts` | ~5 | Panel/toggle presence, message input/send/attach/form presence, chat-list template, cancel-generation |
| `auth-flow.browser.ts` | 4 | Login form render, demo-login `hx-post`, signup link, invalid-login htmx error swap |

### Structural gaps (all 7 files)

1. **No end-to-end data mutation through the UI.** Chat messages are never sent; files never uploaded; characters/worlds are created via modal but the persisted result is never asserted. Every suite stops at presence/visibility.
2. **No console/pageerror assertion.** One soft (non-failing) console listener in `characters-flow`; `pageerror` never wired. Alpine hydration errors (see `BUG-alpine-init-hydration`) pass silently.
3. **Sleep-based waits dominate** (`page.waitForTimeout(1500)` in auth-flow; 100ms fixed sleep in `navigateViaHtmx`); almost no web-first polling.
4. **No per-test page cleanup** — timed-out test leaves its page open → `Target page, context or browser has been closed` cascade (`TASK-browser-test-isolation`).
5. **Component-local Alpine state never read** — only `Alpine.store('ui'/'sidebar')` globals; `chatState()` etc. unasserted (`TASK-alpine-state-testing`).
6. **`playwright.config.ts` is dead config** — runner is `bun test`, never reads it (`TASK-resolve-playwright-cfg`).

### Views with NO browser coverage at all

| View | Interactive logic unexercised |
| ---- | ----------------------------- |
| `register` | Signup form submit, validation, redirect to login/chat |
| `personas` | Persona list/CRUD |
| `quests` | Quest list, active/complete, progress rendering (`quests.ts`) |
| `notifications` | Notification center (Alpine `notification-center.ts`), read/unread, dismiss |
| `admin` | Admin panel (admin-guarded), user/nsfw/character overrides |
| `nsfw-moderation` | Moderation audit view (admin-guarded) |
| `world-edit` | World edit form, location CRUD (`worlds.ts` `createLocation`/`deleteLocation`/`initializeStates`), item states |
| `character-edit` | Character edit form, trait/mood/avatar sub-editors |
| `chat-list` | Chat list view (separate from chat view) |
| `new-chat` advanced fields | Template/persona/memory-carry/impersonate selects (only basic create tested) |

### Partially covered (presence only, no behavior)

- **Chat send** — input exists, send never clicked, no message round-trip
- **Gallery upload** — upload modal lazy-loads, file never picked, no upload → grid
- **Settings** — shell renders, no toggle/save
- **Successful login** — only invalid login tested; no valid creds → redirect → authed view
- **World location CRUD** — create modal fields present, no submit/location render/delete

## New Test Cases (proposed)

### P0 — harness hardening (prereq for everything below)
1. `assertNoPageErrors(page)` helper — fail on `pageerror`/`console.error` with allowlist; invoke in all suites. *(TASK-browser-console-assert)*
2. Per-test `try/finally` page close; close-all-pages on failure. *(TASK-browser-test-isolation)*
3. `getAlpineData` + `waitForAlpineState` helpers; migrate htmx-alpine/chat-flow off fixed sleeps. *(TASK-alpine-state-testing)*

### P1 — critical flows (currently zero coverage)
4. **Chat send round-trip**: open seeded chat → type message → click send → assert message appears in DOM (htmx swap) + persists in DB via `/api/chats/:id/messages`.
5. **Register flow**: fill register form → submit → lands on login/chat; duplicate-username error swap.
6. **Successful login**: valid `seedUsers` creds → submit → redirect to `/views/chat`; session cookie set.
7. **Character create persists**: fill create-character modal → submit → new card in grid; detail modal opens for it.
8. **World create persists + location CRUD**: create world → submit → appears in list → open world-edit → add location → assert render → delete location.

### P2 — view coverage expansion
9. **Settings toggle persists**: flip a setting → save → reload → state retained (DB-backed).
10. **Personas view**: seeded persona renders; create/delete persona.
11. **Quests view**: seeded quest renders with progress; quest page init script runs without console errors.
12. **Notifications center**: seeded notification renders; mark-read updates unread count.
13. **Gallery upload E2E**: pick a file → upload → image appears in gallery grid.
14. **New-chat advanced fields**: template/persona/memory-carry/impersonate selects render and affect create payload.
15. **Admin + nsfw-moderation**: admin-guarded views render for admin user (seed `e2eadmin`), redirect/deny for non-admin.

### P3 — Alpine state contracts
16. **`chatState()` default-shape contract** (from `src/frontend/alpine/chat.ts` return object).
17. **`ui` store default-shape contract** (from `src/frontend/stores/ui-store.ts`). *(TASK-chat-state-contract)*

## Current Baseline (this worktree, `bdea77f8`, 2026-08-06 run)

Per-file results (full suite, `E2E_SAFEGUARD=1 bun test --max-concurrency=1` per file):

| Suite | Pass | Fail | Error | Notes |
| ----- | ---- | ---- | ----- | ----- |
| `auth-flow.browser.ts` | 3 | 1 | 1 | Auth redirect loop (below) |
| `characters-flow.browser.ts` | 10 | 0 | 0 | Soft-logs a 404 console error (non-failing) |
| `chat-flow.browser.ts` | 12 | 0 | 0 | Presence only — no send |
| `htmx-alpine.browser.ts` | 17 | 0 | 0 | Epic's "13 pass / 4 fail" is stale; hydration bug appears fixed on dev |
| `navigation.browser.ts` | 13 | 0 | 0 | |
| `smoke.browser.ts` | 19 | 0 | 0 | |
| `worlds-flow.browser.ts` | 7 | 0 | 0 | |
| **Total** | **81** | **1** | **1** | |

**The only failing suite is `auth-flow`, blocked by an auth redirect loop:** under `auth.required=true`, something on `/views/login` (loaded without a session) receives a 401; `feFetch`/htmx's 401 handler runs `location.assign('/views/login?redirect=' + encodeURIComponent(location.pathname + location.search))` (`src/frontend/fe-fetch.ts:50-53`). Already on login, the next load repeats — each hop re-encodes the previous `?redirect=` value, producing an infinite growing chain (`?redirect=%2Fviews%2Flogin%3Fredirect%3D%252Fviews%252Flogin...`). Client-side loop, not a server view gate. Fix: skip the 401-redirect when already on `/views/login` (and `/views/register`), or exempt login-page requests. Tracked as `TASK-PLAN-E2E-STABILIZATION`.

## Acceptance Criteria

- [ ] `assertNoPageErrors` helper + invoked in `*.browser.ts`
- [ ] Per-test page cleanup (no failure cascade)
- [ ] Chat send round-trip test green
- [ ] Register + successful-login flows green
- [ ] Character/world create-persists tests green
- [ ] Settings/personas/quests/notifications/gallery/new-chat-advanced coverage added
- [ ] Admin + nsfw-moderation view tests (admin vs non-admin)
- [ ] `chatState()` + `ui` store contract tests
- [ ] Full browser suite green: `for f in tests/e2e/flows/browser/*.browser.ts; do bun test --max-concurrency=1 "./$f" || exit 1; done`

## Files

- `tests/e2e/flows/browser/*.browser.ts` — new/updated suites
- `tests/e2e/helpers/htmx-alpine.ts` — `assertNoPageErrors`, `getAlpineData`, `waitForAlpineState`
- `tests/e2e/helpers/browser-server.ts` — page cleanup, console wiring
- `src/middleware/` or `src/routes/views.ts` — login/register exempt from auth-required view redirect (P0 blocker)

## Dependencies

- `TASK-browser-console-assert`, `TASK-browser-test-isolation`, `TASK-alpine-state-testing` — shared helpers
- `BUG-alpine-init-hydration` — blocks chat-list selection assertions until fixed
- `TASK-PLAN-E2E-STABILIZATION` — auth redirect loop blocks `auth-flow` green
