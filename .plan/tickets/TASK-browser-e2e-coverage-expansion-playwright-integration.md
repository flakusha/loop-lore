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

## High-Value Topic Matrix (2026-08-06)

API-level e2e coverage (`tests/e2e/flows/*.test.ts`) exists for ALL 11 topics below; **browser/UI-level coverage is ZERO for all of them**. Each row: API coverage file → source surface → new browser test case.

### 1. Chat compression-encryption-decryption-decompression flow
- **API:** `encryption.test.ts` (key CRUD, round-trip, unicode/long/compress).
- **Source:** `src/frontend/browser.ts` (compress→encrypt pipeline), `alpine/chat-keys.ts` (`loadChatKey` → `window.__chatKey`), `alpine/chat-messages.ts` (`sendMessage` wraps via `browserCompressThenEncrypt`), `htmx-encrypt.ts` (`hx-ext="encrypt"`, `data-encrypt` attr auto-decrypt after swap), `routes/message-encryption.ts`, `routes/messages.ts` server-side `decryptThenDecompress`.
- **Gate:** encryption is **automatic when key present** (no user toggle); key fetched on `selectChat`.
- **New browser cases:**
  - `encryption-flow.browser.ts`: open seeded chat → assert `window.__chatKey` set (Alpine `chat-keys` state) → send message → assert rendered message **decrypts to plaintext after htmx swap** (no `[Encrypted — unable to decrypt]`) → fetch message via API → assert stored content is a non-plaintext encrypted payload (`{enc, nonce, algo, comp, keyId}` shape).
  - Wrong-key path: assert server falls back to `[Encrypted — unable to decrypt]` placeholder.

### 2. Registration flow
- **API:** register handler in `auth.test.ts` + `src/routes/auth.ts` `handleRegister` (gates `config.auth.registrationOpen`, 3/hr rate limit).
- **Source:** `src/views/register.html` + `components/auth-form-fields.html` (`register-submit`, `register-error`, `username-input`, `password-input`).
- **New browser cases:**
  - `register-flow.browser.ts`: navigate `/views/register` → fill → submit → assert redirect to login/chat + user exists via API. Duplicate-username → `register-error` swap. Registration-closed config → error shown.
  - Blocked by the same 401-redirect loop as login if `auth.required=true` — see P0/`TASK-PLAN-E2E-STABILIZATION`.

### 3. Authorization flow
- **API:** `auth.test.ts` (login/demo/logout/me/401), `users.test.ts` (403 non-admin), `isolation.test.ts`, `age-gate.test.ts`.
- **Source:** `middleware/auth.ts` (JWT bearer>cookie, solo fallback), `admin-gate.ts` (`adminViewGuard` 302, `requireAdmin`), `views/login.html` (`demo-login`, `signup-link`).
- **New browser cases:**
  - Successful login (valid `seedUsers` creds → redirect `/views/chat` + cookie set) — missing today (auth-flow only tests invalid creds).
  - Demo-login click → htmx swap to authed view.
  - Logout → lands on login, authed API calls 401.
  - Admin view: `e2eadmin` sees `/views/admin`; non-admin gets 302 → `/`.

### 4. Join/invite flow
- **API:** `invite-join.test.ts` (chat invite create/list/revoke, join-by-code, expired/used/revoked).
- **Source:** chat invites API-only (`routes/invites.ts`); **world invites have UI** in `views/world-edit.html` Invites tab (`world-invites.ts`: `show-create-invite-btn`, `submit-create-invite`, `invite-max-uses`, `copy-invite-code`, `revoke-invite`).
- **New browser cases:**
  - `world-invites-flow.browser.ts`: world-edit → Invites tab → create invite (set max-uses) → assert code renders → copy code → join via `/views/` join UI (if present) or via API with copied code → assert membership.
  - Chat invites have **no browser UI** — API-only; document as known gap.

### 5. All creation menus (character, world, location, chat)
- **API:** `characters.test.ts`, `worlds.test.ts`, `chats.test.ts`, `chats-participants.test.ts`.
- **Source:** `partials/characters/create-modal.html` (`create-character-form`: displayName/actorType/description/personality/scenario/welcomeMessage/tags), `partials/worlds/create-modal.html` + `edit-modal.html` (`create-world-form`), `alpine/world-locations.ts` (`addLocation/saveLocation/deleteLocation`), `views/new-chat.html` (`create-chat-form`: `chat-name-input`, `chat-type-select`, `chat-mode-select`, `participant-search`, `persona-select`).
- **New browser cases:**
  - Character create **persists** (submit → new card in grid → detail opens) — currently submit is clicked but result never asserted.
  - World create persists → appears in list → world-edit loads.
  - Location CRUD in world-edit: add → render → edit → delete.
  - New-chat: fill advanced fields (type/mode/participant/persona) → create → lands in chat view with correct chat.

### 6. Settings menus and modals (exposure level, context follow)
- **API:** `users.test.ts` (PUT `/api/users/:id/settings`).
- **Source:** `views/settings.html` + `alpine/settings.ts`: tabs general/chat/api/notifications/data/keys; testids `settings-header`, `save-general`, `save-api`, `theme-select`, `locale-select`, `api-provider`, `temp-slider`, `export-all`, `delete-all`, `settings-keys`; `key-management.ts` renders in settings modal "keys" tab.
- **Note:** **"context follow" does not exist as a setting** — flagged by source audit; either add it or exclude from scope. Settings exposure level = per-tab save actions.
- **New browser cases:**
  - `settings-flow.browser.ts`: switch theme/locale → save → reload → persisted (localStorage/DB). Save API key via settings-api tab. Keys tab renders encryption key management. Export-all/delete-all buttons present + wired.

### 7. Docs endpoint linkage + docs generation (./docs/ + .plan/)
- **API:** none — `handleDocsRequest` in `src/server.ts` serves static `docs/.vitepress/dist`; gated by `docs.enabled`, `docs.public` allowlist, `DOCS_ENABLED=false`. Generation: `scripts/gen-plan-docs.ts` (.plan → epics-index), `scripts/gen-openapi.ts` (docs/reference/openapi.json), `scripts/reconcile.ts`.
- **Note:** **NOT browser-testable in the E2E harness (2026-08-07).** `handleDocsRequest` is a private `server.ts` function mounted only from `server.ts` `start()`; the browser harness boots `createApp()` (Elysia) via `app.fetch()` directly and never runs `start()`, and `docs/.vitepress/dist` isn't built (`docs/.vitepress/dist` absent in worktree). So `/docs/` is unreachable in `*.browser.ts`. The docs handler + traversal/allowlist guards are server-internal behavior; `.plan`/`docs` generation is a build script. Defer `docs.browser.ts` until the harness mounts `handleDocsRequest` or docs are built into `dist/public`. (Not faking a vacuous 404 test.)

### 8. Redirection
- **API:** none directly; `redirectTo()` in `elysia-app.ts` (302), `/` → `/views/chat`|`/views/login`, `/register`, `/chat`; `/views/:name` .html→clean redirect in `routes/views.ts`.
- **New browser cases:**
  - `redirection.browser.ts`: unauthenticated `/` → login; authed `/` → chat. `/views/chat.html` → `/views/chat`. Unknown `/views/xyz` → `/views/`. **Regression guard: the auth redirect-loop bug (baseline failure) — assert no infinite `?redirect=` growth on `/views/login`.**

### 9. Access correctness
- **API:** `isolation.test.ts`, `worlds.test.ts` (cross-tenant), `characters.test.ts`, `chats.test.ts`.
- **Source:** `chat/service.ts` `checkChatAccess` (owner|admin|solo|participant), `routes/worlds.ts` `requireWorldAccess` (owner|admin|public|member) + `requireWorldOwner`, `actor-auth.ts` `checkActorOwnership`.
- **New browser cases:**
  - Non-owner world detail → empty-state/404 (not data); admin sees all worlds.
  - Non-participant chat → cannot open/send (UI surfaces 401 gracefully, no data leak).
  - Solo/demo mode vs authed: view renders with/without user data.

### 10. Gallery, previews, assets interactions, chat gallery
- **API:** `assets.test.ts` (upload/list/get/link/delete), `chat-full.test.ts` (asset upload+link).
- **Source:** `views/gallery.html` (`upload-button`, `asset-grid`, `filter-bar`), `partials/gallery/upload-modal.html` (`upload-form`, `upload-file-input`, `asset-label`), `preview-modal.html`; `components/chat/gallery-sidebar.html` (`gallery-upload-link`, `gallery-sidebar`), `media-preview-modal.html`; `assets/controller.ts`.
- **New browser cases:**
  - `gallery-flow.browser.ts`: open upload modal → pick file → upload → asset appears in grid. Click asset → preview modal opens.
  - Chat gallery: open chat → gallery sidebar → upload/link asset from chat → preview from message media link.

### 11. Search / filtering
- **API:** search endpoints exist (`chat-search.ts` `/api/chats/search`, `message-search.ts` FTS5 `/api/messages/search`, `/dynamic/characters|worlds|chats|gallery/search`); no dedicated API e2e file.
- **Source:** `components/filter-bar.html` (search input, `list-search`), `chat-list.html` (`#chat-search`), `components/chat/message-search-bar.html` (`message-search-input`).
- **New browser cases:**
  - `search-flow.browser.ts`: gallery filter-bar filters grid; chat-list search narrows list; message search returns matching messages (FTS5). Assert swapped DOM contains only matches.

**Cross-cutting gaps (all topics):** no `assertNoPageErrors` anywhere (encryption/key-management and world-invite Alpine components are prime candidates for console errors); no persisted-result assertions; fixed sleeps.

## Access-Correctness Findings (from access-correctness.browser.ts, 2026-08-07)

- **LOW (latent):** `checkChatAccess` (`src/chat/service.ts:67`) grants a **solo role read access to ANY chat by ID** via the `userRole === 'solo'` admin-equivalent short-circuit. Endpoints using it (GET /api/chats/:id, reactions, pins, notes, messages, encryption-key) would return a foreign chat's data to a solo user calling directly by ID. Not reachable through the current UI: the chat list is `created_by = userId`-scoped and the chat app redirects on a foreign `?chatid=` before fetching. Consider narrowing solo's chat read to owned/participant chats.
- **INFO (asymmetric):** solo is treated as admin at the **chat** layer and at **world mutation** (`requireWorldOwner`) but as a **normal user** at the **world read** layer (`requireWorldAccess` checks `admin` only). World read denial is correctly enforced (verified); the asymmetry is inconsistent but not a leak.

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
- [ ] **Topic 1:** `encryption-flow.browser.ts` — key set, encrypted send, client decrypt after swap, wrong-key placeholder
- [ ] **Topic 2:** `register-flow.browser.ts` — success redirect, duplicate error, closed-registration error
- [ ] **Topic 3:** successful login + demo-login + logout browser flows
- [ ] **Topic 4:** `world-invites-flow.browser.ts` — create/copy/join/revoke via world-edit Invites tab
- [ ] **Topic 5:** creation menus persist — character, world, location CRUD, new-chat advanced fields
- [ ] **Topic 6:** `settings-flow.browser.ts` — theme/locale save+persist, API key tab, keys tab, export/delete wired
- [ ] **Topic 7:** docs endpoint — **deferred**: unreachable in browser harness (`handleDocsRequest` private to `server.ts`, docs build absent). Documented in ticket.
- [ ] **Topic 8:** `redirection.browser.ts` — `/` authed vs anon, `.html`→clean, unknown view, no redirect-loop regression
- [ ] **Topic 9:** access-correctness browser checks — non-owner world/chat denial surfaces without data leak
- [ ] **Topic 10:** `gallery-flow.browser.ts` — upload→grid, preview modal, chat gallery sidebar + media preview
- [ ] **Topic 11:** `search-flow.browser.ts` — gallery/chats/message search filters swapped DOM
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
