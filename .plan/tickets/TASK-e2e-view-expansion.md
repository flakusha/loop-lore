<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-e2e-view-expansion: Browser e2e view, creation-menu and settings coverage

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Task / Test Infrastructure
**Tags:** testing, e2e, browser, playwright
**Epic:** epic-testing-qa
**Parent:** TASK-BROWSER-E2E-COVERAGE-EXPANSION-PLAYWRIGHT-INTEGRATION (umbrella)

## Summary

Add browser tests for uncovered views (personas, quests, notifications, admin, world-edit, character-edit, chat-list), make creation menus assert persistence, cover settings save flows, gallery upload E2E, and the docs-endpoint deferral.

## Context

Views with NO browser coverage at all:

| View                       | Interactive logic unexercised                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `register`                 | Signup form submit, validation, redirect to login/chat _(covered in TASK-e2e-auth-flows)_                      |
| `personas`                 | Persona list/CRUD                                                                                              |
| `quests`                   | Quest list, active/complete, progress rendering (`quests.ts`)                                                  |
| `notifications`            | Notification center (Alpine `notification-center.ts`), read/unread, dismiss                                    |
| `admin`                    | Admin panel (admin-guarded), user/nsfw/character overrides                                                     |
| `nsfw-moderation`          | Moderation audit view (admin-guarded)                                                                          |
| `world-edit`               | World edit form, location CRUD (`worlds.ts` `createLocation`/`deleteLocation`/`initializeStates`), item states |
| `character-edit`           | Character edit form, trait/mood/avatar sub-editors                                                             |
| `chat-list`                | Chat list view (separate from chat view)                                                                       |
| `new-chat` advanced fields | Template/persona/memory-carry/impersonate selects (only basic create tested)                                   |

Partially covered (presence only, no behavior): **Chat send**, **Gallery upload**, **Settings**, **World location CRUD**.

## Tasks

### P1 — critical flows (currently zero coverage)

- [ ] **Chat send round-trip**: open seeded chat → type message → click send → assert message appears in DOM (htmx swap) + persists in DB via `/api/chats/:id/messages`.
- [ ] **Character create persists**: fill create-character modal (`partials/characters/create-modal.html`, `create-character-form`: displayName/actorType/description/personality/scenario/welcomeMessage/tags) → submit → new card in grid; detail modal opens for it.
- [ ] **World create persists + location CRUD**: create world (`partials/worlds/create-modal.html` + `edit-modal.html`) → submit → appears in list → open world-edit → add location (`alpine/world-locations.ts`: `addLocation/saveLocation/deleteLocation`) → assert render → delete location.

### P2 — view coverage expansion

- [ ] **Settings toggle persists**: flip a setting → save → reload → state retained (DB-backed).
- [ ] **Personas view**: seeded persona renders; create/delete persona.
- [ ] **Quests view**: seeded quest renders with progress; quest page init script runs without console errors.
- [ ] **Notifications center**: seeded notification renders; mark-read updates unread count.
- [ ] **Gallery upload E2E** (Topic 10): pick a file → upload → image appears in gallery grid; click asset → preview modal opens. Chat gallery: open chat → gallery sidebar (`components/chat/gallery-sidebar.html`, `gallery-upload-link`) → upload/link asset from chat → preview from message media link.
- [ ] **New-chat advanced fields**: template/persona/memory-carry/impersonate selects render and affect create payload (`views/new-chat.html`, `create-chat-form`: `chat-name-input`, `chat-type-select`, `chat-mode-select`, `participant-search`, `persona-select`); create → lands in chat view with correct chat.
- [ ] **Admin + nsfw-moderation**: admin-guarded views render for admin user (seed `e2eadmin`), redirect/deny for non-admin.
- [ ] **Character-edit + chat-list views**: character edit form renders sub-editors without console errors; chat-list view lists seeded chats and search narrows (shared with TASK-e2e-state-contracts search cases).

### Topic 6 — Settings menus and modals

- [ ] `settings-flow.browser.ts`: switch theme/locale → save → reload → persisted (localStorage/DB). Save API key via settings-api tab. Keys tab renders encryption key management (`key-management.ts`). Export-all/delete-all buttons present + wired. Tabs general/chat/api/notifications/data/keys; testids `settings-header`, `save-general`, `save-api`, `theme-select`, `locale-select`, `api-provider`, `temp-slider`, `export-all`, `delete-all`, `settings-keys`.
  - Note: **"context follow" does not exist as a setting** — flagged by source audit; either add it or exclude from scope. Settings exposure level = per-tab save actions.

### Topic 7 — Docs endpoint linkage (deferred)

- **NOT browser-testable in the E2E harness (2026-08-07).** `handleDocsRequest` is a private `server.ts` function mounted only from `server.ts` `start()`; the browser harness boots `createApp()` (Elysia) via `app.fetch()` directly and never runs `start()`, and `docs/.vitepress/dist` isn't built in the worktree. So `/docs/` is unreachable in `*.browser.ts`. Defer `docs.browser.ts` until the harness mounts `handleDocsRequest` or docs are built into `dist/public`. (Not faking a vacuous 404 test.) Documented here so the gap stays visible.

## Files

- `tests/e2e/flows/browser/*.browser.ts` — new suites per flow
- Source surfaces: `views/settings.html` + `alpine/settings.ts`, `views/gallery.html` (`upload-button`, `asset-grid`, `filter-bar`), `partials/gallery/upload-modal.html` (`upload-form`, `upload-file-input`, `asset-label`), `preview-modal.html`, `assets/controller.ts`, `quests.ts`, Alpine `notification-center.ts`

## Dependencies

- Parent hub: `TASK-BROWSER-E2E-COVERAGE-EXPANSION-PLAYWRIGHT-INTEGRATION.md`
- **TASK-e2e-playwright-harness must land first** (helpers, page isolation).
- Siblings: TASK-e2e-auth-flows (seeded admin user, login state), TASK-e2e-state-contracts (search/filter correctness).

## Acceptance Criteria

- [ ] Chat send round-trip test green
- [ ] Character/world create-persists tests green incl. location CRUD
- [ ] Settings/personas/quests/notifications/gallery/new-chat-advanced coverage added
- [ ] Admin + nsfw-moderation view tests (admin vs non-admin)
- [ ] `settings-flow.browser.ts` green; docs-endpoint deferral documented
