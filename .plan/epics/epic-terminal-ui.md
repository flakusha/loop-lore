<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Terminal UI (TUI)

**Effort:** Medium
**Type:** epic
**Tags:** tui, blessed, terminal, harness, chat, assets
**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** Built — blessed + blessed-contrib scaffolding shipped; `src/tui/harness/` overlay shipped and wired to F3; integration hardening in progress
**Priority:** Low


## Goals

- A terminal client for the harness loop: talk to a chat, watch runs, inspect the chat's linked assets.
- Keep the TUI importable outside a TTY so shortcut, toggle and resize changes can be covered by tests instead of smoke tests.
- Make the written spec (`docs/spec/terminal-ui.md`) match what the code actually calls.


## Scope

- `src/tui/app.ts` layout and key bindings, `src/tui/chat/`, `src/tui/asset-view.ts`, `src/tui/harness/`, `src/tui/chat-picker.ts`, `src/tui/models-overlay.ts`.
- `src/config/sections/tui.ts` — TUI config section (`sessionToken`, `enabled`).
- The harness work-topic surface, on the existing harness overlay rather than a new screen.
- Web parity where it suits a terminal, per the user's 2026-10-16 direction. Named in-scope surfaces: admin model/provider configuration (role assignment, tuning defaults, capability overrides). See §Out of Scope for what is carved out and the evidence behind each carve-out.


## Out of Scope

- Web parity is in scope, at the user's direction (2026-10-16), wherever it makes sense in a terminal. The earlier blanket exclusion of the web feature surface is withdrawn. **In scope:** admin model/provider configuration. **Out of scope, with evidence:**
  - Destructive danger-zone actions. Every one of them is gated on typing an exact confirmation string into a text field — `DELETE` to erase the account and all data (`src/frontend/alpine/settings/general.ts`, `deleteAllData` → `DELETE /api/v1/users/me`), and `PURGE` / `RESET` / `DELETE ALL` for audit-purge, settings-reset and factory-reset (`src/frontend/alpine/admin-system.ts`, `runDangerAction`). A TUI has no affordance that makes typing a self-destruct phrase safer than a button does, so these stay web-only.
  - Visual/graph surfaces with no terminal equivalent. There is no drag-and-drop node editor in this codebase — the graph-shaped features are deliberately form-based (`src/frontend/alpine/location-graph.ts` records "form-based 'connect two nodes'; no canvas drag — noted deviation"; `src/frontend/alpine/comfyui-builder/types.ts` records "there is no canvas"). What remains uncatchable is the read-only 2D entity canvas (`src/frontend/alpine/game-canvas/`) and the JSON-textarea graph editors (`src/frontend/alpine/admin-workflows/form.ts` `graph` field; `src/frontend/alpine/character-extension-editor.ts`).
  - Form-heavy metadata editors. The world edit page is a multi-tab editor carrying ~10 fields per item and ~5 per location, plus per-edge adjacency rows (`src/components/views/world-edit.html`). Reviewing that much structured state is a page, not a screen.
  - RPG/battle surfaces, which belong to their own epics.
- Any `src/` change made by this reconciliation — code fixes are filed as tickets here, not applied.
- The harness work-topic data model itself, owned by `epic-harness-integration.md`.

## Summary

The TUI is a shipped-but-hollow shell. Three panels are wired over a `blessed.screen()`: a `ChatWidget` (F2 toggles an `AssetView` sidebar), and a `HarnessView` overlay (F3). The layout core (`src/tui/app.ts`) contains the full blessed lifecycle — `screen()` at `:41`. Construction now sits behind an exported `createTUIApp()` factory and an `import.meta.main` guard, so importing the module builds nothing. Every bug in shortcut registration, F2/F3 toggle, or resize is verifiable under test rather than by manual smoke test. The web feature surface has almost no TUI coverage.

## Implementation analysis

### Current inventory

| File | Lines | Key exports | Blessed-at | Testable? |
|---|---|---|---|---|
| `src/tui/app.ts` | 173 | `TUIApp`, `createTUIApp` | `blessed.screen()` at `:41` in ctor; `createLogger` at `:164` inside `createTUIApp()`, called only under the `import.meta.main` guard at `:171` | **Yes** — importing builds nothing (`app.test.ts` asserts zero screens at import); `mock.module('blessed')` covers construction |
| `src/tui/asset-view.ts` | 237 | `AssetView`, `LinkedAsset` | `blessed.box()` at `:44` in ctor | **Yes** — constructed by `app.ts` and by suites via the `mock.module('blessed')` stub, no production change |
| `src/tui/harness/index.ts` | 214 | `createHarnessView`, `HarnessView` | `blessed.box()` at `:53` + `blessed.list()` at `:67` in ctor | **Yes** — `createHarnessView` at `:28` is the seam; covered by `harness/index.test.ts` |
| `src/tui/chat/index.ts` | 251 | `ChatWidget`, `API_BASE` re-export | widget construction in ctor (`:50`, `:59`) | Via `mock.module('blessed')`, covered by `index.test.ts` under an `ISOLATED` gate; its former per-file coverage waiver is retired |
| `src/tui/chat/api.ts` | 104 | `API_BASE`, `handleSend`, `loadMessages`, `setFetch` seam | none | **Yes** — pure HTTP dispatcher, `setFetch` enables full stubbing |
| `src/tui/chat/display.ts` | 17 | `formatMessageLine` | none | **Yes** — pure formatter |
| `src/tui/chat/types.ts` | 38 | pure types (`ChatMessage`, `ChatWidgetOptions`, `ChatHost`) | none | **Yes** — types only |
| `src/tui/harness/api.ts` | 83 | `loadRuns`, `loadRunDetail`, `loadStats`, `setFetch` seam | none | **Yes** — pure HTTP client, `setFetch` enables full stubbing |
| `src/tui/harness/display.ts` | 112 | `formatDuration`, `truncateTask`, `resultMarker`, `formatRunLine`, `formatRunDetail`, `formatEmptyRuns` | none | **Yes** — pure formatters |
| `src/tui/harness/types.ts` | 22 | re-exports from `harness/read-models` + `harness/types`; single source of truth against `durationMs`/`runMs` drift | none | **Yes** — types only |
| `src/tui/chat-picker.ts` | 225 | `ChatPicker`, `loadChats`, `setFetch` seam | `blessed.box()` at `:94` in ctor | **Yes** — `setFetch` enables full stubbing |
| `src/config/sections/tui.ts` | 39 | `TUI_DEFAULTS`, `TuiSection`, `tuiMeta`; `enabled` defaults `true`, `sessionToken` optional | none | **Yes** |
| `src/config/schema/tui.ts` | 9 | `TuiConfig` alias | none | **Yes** |

### Testability debt

Resolved. Construction is no longer reachable at import time: `createTUIApp()` builds the shell on demand and the `import.meta.main` guard keeps importing the module inert, so every module under `src/tui/` constructs zero blessed objects at import. `AssetView` and `HarnessView` needed no production change — the existing `mock.module('blessed')` seam already covers them. Shortcut registration, F2/F3 toggle, and resize are exercised by `src/tui/app.test.ts`. The per-file coverage waiver that used to cover `src/tui/chat/index.ts` is retired; `scripts/check/coverage/waivers.mjs` keeps only the module-wide `tui` floor for screens that are built but never driven.

## Spec drift

| Drift | Spec side | Code side | Owner |
|---|---|---|---|
| Spec file name | `docs/spec/tui.md` cited at Related Epics; does not exist | Actual file is `docs/spec/terminal-ui.md` | `TASK-tui-spec-sync` |
| API routes (assets) | `:15` claims integration with `/api/assets` | Code calls `/api/v1/assets` (`asset-view.ts:206`) | `TASK-tui-spec-sync` |
| API routes (chat) | `:15` claims integration with `/api/assistant` | `/api/assistant` is called nowhere in `src/tui/`; chat calls `/api/v1/chats/:id/messages` (`chat/api.ts:32,77`) | `TASK-tui-spec-sync` |
| Feature list | Feature list predates `src/tui/harness/` and `/api/v1/harness/runs` | Harness overlay and API exist in code but not in spec | `TASK-tui-spec-sync` |
| `ENABLE_TUI` env var | Maps to `tui.enabled` (`env-map.ts:113`); defaults `true` (`config/sections/tui.ts:7`) | Read at startup: `TUIApp` exits 0 with a status message when false | resolved |

## Feature research — coverage gap vs the web UI

The TUI currently covers: chat send/load, asset sidebar, harness runs overlay (F3), chat picker (F1), slash-command completion, models overlay (F6), and provider-health status segment. Every other web surface is absent.

| Web surface | Route / view | TUI status | Proposed TUI screen | Value |
|---|---|---|---|---|
| Chat list | `src/routes/views/chats.ts`, `src/views/chat-list.html` | **Present** — `ChatPicker` (F1) fetches `GET /api/v1/chats`; Enter selects and routes through `ChatWidget.setChatId()` | — | Shipped |
| Character management | `src/routes/characters/` | Not present | — | Deferred |
| World browser | `src/routes/worlds/` | Not present | — | Deferred |
| Location explorer | `src/routes/worlds/fractal-locations-routes.ts` | Not present | — | Deferred |
| Quests | `src/routes/quests/` | Not present | — | Deferred |
| Admin panel | `src/routes/admin/`, `src/views/admin.html` | Not present | — | Deferred |
| Settings | `—`; `src/views/settings.html` | Not present | — | Deferred |
| Notifications | `src/routes/notifications/`, `src/views/notifications.html` | Not present | — | Deferred |
| NSFW moderation panel | `src/routes/nsfw-moderation/`, `src/views/nsfw-moderation.html` | Not present — `nsfw-filter.ts` was deleted from the TUI on this branch (`42abe9123`); the filter class had no live consumer | — | Deferred |
| Blog | `src/routes/blog/`, `src/views/blog.html` | Not present | — | Deferred |
| Global asset gallery | `src/routes/asset-tags/`, `src/views/gallery.html` | `AssetView` only shows the current chat's linked assets | — | Deferred |
| Wardrobe, trade, crafting, battle | `—` (wardrobe absent); `src/routes/trade/`, `src/routes/crafting/`, `src/routes/rpg/`, `src/routes/battle/` | Not present | — | Separate epic |
| Character growth / traits / mood | `src/routes/character-growth/`, `src/routes/character-traits/`, `src/routes/character-mood/` | Not present | — | Separate epic |
| Story state | `src/routes/story-states/`, `src/routes/story-turns.ts` (by-id lookup at `:102`) | Not present | — | Separate epic |
| Auth | `src/routes/auth/` | TUI runs anonymous or with a config-supplied token only; no login flow | — | Deferred |

### Sequencing

1. **Testability first** — done (`TASK-tui-shell-testability.md`); it unblocked `TASK-tui-dedupe-api-base.md` and `TASK-tui-asset-view-remove-silent-catch-and-void-async-iife.md`, whose files are now testable.
2. **Chat picker** — the single highest-value gap; without it the TUI cannot start a chat from scratch.
3. **Bounded set** — after chat picker, pick ONE more screen from the deferred list per cycle, driven by user need, not a roadmap to mirror all 20 web surfaces.

The TUI's job is the harness loop: chat + runs + assets. It is not a full client. RPG/battle surfaces have a separate epic.

## Harness work-topic surface

Work topics (owned by `epic-harness-integration.md` §18, tickets `TASK-harness-work-topics` and `TASK-harness-topic-tui-surface`) surface on the **existing** `src/tui/harness/` overlay — NOT as a new screen. The overlay and its `setFetch` seam already exist; a new screen would be a second TUI, which the harness epic's reuse-first rule forbids.

Proposed surface on the existing overlay:
- A topic column on the run list (rightmost column, `workTopic.name`)
- An F4 filter to toggle by work topic
- A topic indicator in the status bar when a run is selected

See `epic-harness-integration.md` §18 for the full topic lifecycle and auto-scoping ladder.

## Plan

1. **P1 — Testability seam** — shipped (`TASK-tui-shell-testability.md`): `new TUIApp()` moved out of module scope into `createTUIApp()` behind an `import.meta.main` guard, following the `createHarnessView` factory at `harness/index.ts:28`. No `createAssetView` extraction was needed — `AssetView` was already constructible under the `mock.module('blessed')` stub. Unblocked `TASK-tui-dedupe-api-base.md` and `TASK-tui-asset-view-remove-silent-catch-and-void-async-iife.md`. Cheap and unblocked: `TASK-adopt-bun-color-for-tui-colors.md`, `TASK-adopt-bun-stringwidth-for-tui.md`.
2. **P2 — Spec sync** — correct `docs/spec/terminal-ui.md` against code: route paths, feature list addition of harness overlay. Unblocks `TASK-tui-spec-sync`.
3. **P3 — Chat picker** — list existing chats, pre-select on enter, wire `ChatWidget.setChatId`. Unblocks `TASK-tui-chat-picker`.
4. **P4 — Work-topic surface** — add topic column + F4 filter to harness overlay. Unblocks `TASK-harness-topic-tui-surface`.
5. **P5 — `ENABLE_TUI` config flag** — `TASK-tui-enabled-config-flag-never-read.md`: decide wire / remove / document-and-remove-from-env-map. One decision, not three dangling options.


## Acceptance Criteria

- [x] `src/tui/app.ts` creates its logger before constructing the screen, so importing it standalone does not throw (`createLogger` at `:155` precedes `new TUIApp()` at `:157`).
- [x] `config.tui.sessionToken` reaches `ChatWidget`, with an empty string normalized to undefined.
- [x] `ChatWidget` message send/load is covered by tests that stub fetch instead of mounting blessed.
- [ ] `import("src/tui/app.ts")` in a non-TTY process does not construct a screen — move `new TUIApp()` behind an explicit `start()`.
- [ ] `AssetView` and the harness overlay are constructible in tests (factory seam for `AssetView`, matching `createHarnessView`).
- [ ] Every row in §Spec drift is closed against `docs/spec/terminal-ui.md`: the spec cites `/api/v1/assets` and `/api/v1/chats/:id/messages` instead of `/api/assets` and `/api/assistant`, and lists the harness overlay and `/api/v1/harness/*`.
- [ ] A chat-picker screen exists, so the TUI can start a chat without an externally supplied `chatId`.
- [ ] `ENABLE_TUI` either gates startup or is removed from `env-map.ts` — one decision, not a dangling option.
- [ ] `Bun.color()` / `Bun.stringWidth()` are adopted for TUI colors and truncation (neither is used under `src/tui/` today).


## Linked Tasks

Bound to this epic via the `**Epic:** epic-terminal-ui` header on each ticket.

### Landed

- [x] `TASK-tui.md` — umbrella task for the chat/api modernization + tests batch
- [x] `TASK-tui-shell-testability.md` — `createTUIApp()` factory behind an `import.meta.main` guard, mirroring `createHarnessView`; importing any `src/tui/` module now constructs zero blessed objects, which unblocked the two bug-fix tickets stuck in untestable files
- [x] `BUG-tui-app-getlogger-throws-when-running-standalone.md` — `createLogger({level:"warn"})` inside `createTUIApp()` before `new TUIApp()`
- [x] `BUG-tui-app-never-threads-sessiontoken-into-chatwidget.md` — `config.tui.sessionToken` threaded into `ChatWidget`; empty-string normalized to undefined
- [x] `TASK-tui-slash-command-completion.md` — completion strip above the input box, fed by the live `GET /api/v1/commands` registry; Tab cycles, Enter commits
- [x] `TASK-tui-enabled-config-flag-never-read.md` — `tui.enabled` now read at startup: status message + exit 0 when false
- [x] `TASK-tui-models-overlay.md` — F6 admin overlay: resolved role + `source`, provider health, drill-down role → provider → model to commit an override

### Open

- [x] `TASK-tui-spec-sync` — correct spec drift across all four rows in §Spec drift
- [x] `TASK-tui-chat-picker` — list view for existing chats; highest-value missing TUI screen
- [x] `TASK-update-terminal-ui-spec-to-actual-file-layout.md` — spec drift on file layout; superseded in practice by `TASK-tui-spec-sync` (work that one instead)

### Deferred / Open

- [x] `BUG-asset-view-advertises-a-del-unlink-keybinding-that-no-handle.md` — sidebar advertised `Del: unlink` with no handler behind it; fixed in `050eb320d` by removing the claim rather than shipping a one-keypress irreversible delete
- [x] `TASK-harness-stats-endpoint-was-implemented-but-never-called.md` — `loadStats` had zero production callers, so `GET /api/v1/harness/stats` was never fetched; fixed in `42abe9123` by wiring it into the empty-runs branch of the F3 refresh with quiet 403 degradation

- `TASK-tui-dedupe-api-base.md` — **premise no longer holds**: `API_BASE` is declared once at `src/tui/chat/api.ts:7`, re-exported by `harness/api.ts:8` and imported by `app.ts:16`, which is exactly what the ticket asks for. Re-scope or close rather than re-implement (blocked on P1 only because the edit is in untestable `app.ts`)
- `TASK-tui-asset-view-remove-silent-catch-and-void-async-iife.md` — banned patterns in `AssetView.setChatId` (blocked on P1)
- `TASK-adopt-bun-color-for-tui-colors.md` — adopt `Bun.color()` for theme
- `TASK-adopt-bun-stringwidth-for-tui.md` — adopt `Bun.stringWidth()` for safe truncation (fixes `formatMessageLine` surrogate-pair split)

### Retired

- `TASK-coverage-waiver-tui-chat-index-ts-at-51-under-check-gate.md` — the per-file waiver it tracked was added, then retired once `src/tui/chat/index.ts` became importable and reached full coverage under the check gate

### Cross-epic

- `TASK-harness-work-topics` — work-topic entity, CRUD, epic binding, auto-scoping ladder (`epic-harness-integration.md`)
- `TASK-harness-topic-tui-surface` — work-topic surface on the existing harness overlay (`epic-harness-integration.md` §18)
- `TASK-harness-topic-session-attach` — session attachment + lineage + exec-log field (`epic-harness-integration.md`)
- `TASK-harness-context-priority-tiers` — the 0/1/2/3 tier budget, composed with existing section PRIORITY (`epic-harness-integration.md`)
