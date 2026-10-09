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

## Summary

The TUI is a shipped-but-hollow shell. Three panels are wired over a `blessed.screen()`: a `ChatWidget` (F2 toggles an `AssetView` sidebar), and a `HarnessView` overlay (F3). The layout core (`src/tui/app.ts`) contains the full blessed lifecycle — `screen()` at `:41`, and a module-scope `new TUIApp()` at `:157` that executes on every import of `app.ts`. Every bug in shortcut registration, F2/F3 toggle, or resize currently requires manual smoke-test verification because the shell is not importable in non-TTY environments. The web feature surface has almost no TUI coverage.

## Implementation analysis

### Current inventory

| File | Lines | Key exports | Blessed-at | Testable? |
|---|---|---|---|---|
| `src/tui/app.ts` | 158 | `TUIApp`, default `app` | `blessed.screen()` at `:41` in ctor; `createLogger` at `:155` + `new TUIApp()` at `:157` run on import | **No** — module-scope construction blocks all non-TTY imports |
| `src/tui/asset-view.ts` | 237 | `AssetView`, `LinkedAsset` | `blessed.box()` at `:44` in ctor | **No** — same class; `loadAssets()` calls `/api/v1/assets` at `:206` |
| `src/tui/harness/index.ts` | 214 | `createHarnessView`, `HarnessView` | `blessed.box()` at `:53` + `blessed.list()` at `:67` in ctor | **No** — class is the untestable knot; factory is the seam |
| `src/tui/chat/index.ts` | 251 | `ChatWidget`, `API_BASE` re-export | widget construction in ctor (`:50`, `:59`) | Via `mock.module('blessed')`, covered by `index.test.ts` under an `ISOLATED` gate; per-file coverage waiver at 51% (`scripts/check/coverage/waivers.mjs:160`) |
| `src/tui/chat/api.ts` | 104 | `API_BASE`, `handleSend`, `loadMessages`, `setFetch` seam | none | **Yes** — pure HTTP dispatcher, `setFetch` enables full stubbing |
| `src/tui/chat/display.ts` | 17 | `formatMessageLine` | none | **Yes** — pure formatter |
| `src/tui/chat/types.ts` | 38 | pure types (`ChatMessage`, `ChatWidgetOptions`, `ChatHost`) | none | **Yes** — types only |
| `src/tui/harness/api.ts` | 83 | `loadRuns`, `loadRunDetail`, `loadStats`, `setFetch` seam | none | **Yes** — pure HTTP client, `setFetch` enables full stubbing |
| `src/tui/harness/display.ts` | 112 | `formatDuration`, `truncateTask`, `resultMarker`, `formatRunLine`, `formatRunDetail`, `formatEmptyRuns` | none | **Yes** — pure formatters |
| `src/tui/harness/types.ts` | 22 | re-exports from `harness/read-models` + `harness/types`; single source of truth against `durationMs`/`runMs` drift | none | **Yes** — types only |
| `src/tui/nsfw-filter.ts` | 144 | `NsfwFilter`, `NsfwFilterMode`, `NsfwFilterConfig` | none | **Yes** — pure logic; **no live consumer** |
| `src/config/sections/tui.ts` | 39 | `TUI_DEFAULTS`, `TuiSection`, `tuiMeta`; `enabled` defaults `true`, `sessionToken` optional | none | **Yes** |
| `src/config/schema/tui.ts` | 9 | `TuiConfig` alias | none | **Yes** |

### Testability debt

Three files are untestable at construction: `app.ts` (fully), `asset-view.ts` (fully), and `harness/index.ts` (class; factory is the seam). Consequence: every bug in shortcut registration, F2/F3 toggle, or resize must be verified by manual smoke test. The current workaround is the per-file coverage waiver for `src/tui/chat/index.ts` in `scripts/check/coverage/waivers.mjs:160` — the `ISOLATED` gate in `src/tui/chat/index.test.ts` covers `ChatWidget`'s session-token threading without importing blessed.

## Spec drift

| Drift | Spec side | Code side | Owner |
|---|---|---|---|
| Spec file name | `docs/spec/tui.md` cited at Related Epics; does not exist | Actual file is `docs/spec/terminal-ui.md` | `TASK-tui-spec-sync` |
| API routes (assets) | `:15` claims integration with `/api/assets` | Code calls `/api/v1/assets` (`asset-view.ts:206`) | `TASK-tui-spec-sync` |
| API routes (chat) | `:15` claims integration with `/api/assistant` | `/api/assistant` is called nowhere in `src/tui/`; chat calls `/api/v1/chats/:id/messages` (`chat/api.ts:32,77`) | `TASK-tui-spec-sync` |
| Feature list | Feature list predates `src/tui/harness/` and `/api/v1/harness/runs` | Harness overlay and API exist in code but not in spec | `TASK-tui-spec-sync` |
| `ENABLE_TUI` env var | Maps to `tui.enabled` (`env-map.ts:113`); defaults `true` (`config/sections/tui.ts:7`) | No runtime code reads `tui.enabled`; the TUI starts unconditionally on import | `TASK-tui-enabled-config-flag-never-read.md` |

## Feature research — coverage gap vs the web UI

The TUI currently covers exactly three things: chat send/load, asset sidebar, and harness runs overlay. Every other web surface is absent.

| Web surface | Route / view | TUI status | Proposed TUI screen | Value |
|---|---|---|---|---|
| Chat list | `src/routes/views/chats.ts`, `src/views/chat-list.html` | **Missing** — `ChatWidget` requires a pre-selected `chatId`; TUI cannot start a chat | Chat picker list (F1 or entry) | **Highest** — without this the TUI is not self-sufficient |
| Character management | `src/routes/characters/` | Not present | — | Deferred |
| World browser | `src/routes/worlds/` | Not present | — | Deferred |
| Location explorer | `src/routes/worlds/fractal-locations-routes.ts` | Not present | — | Deferred |
| Quests | `src/routes/quests/` | Not present | — | Deferred |
| Admin panel | `src/routes/admin/`, `src/views/admin.html` | Not present | — | Deferred |
| Settings | `—`; `src/views/settings.html` | Not present | — | Deferred |
| Notifications | `src/routes/notifications/`, `src/views/notifications.html` | Not present | — | Deferred |
| NSFW moderation panel | `src/routes/nsfw-moderation/`, `src/views/nsfw-moderation.html` | `NsfwFilter` exists but has no live consumer (`nsfw-filter.ts:144` end) | — | Deferred |
| Blog | `src/routes/blog/`, `src/views/blog.html` | Not present | — | Deferred |
| Global asset gallery | `src/routes/asset-tags/`, `src/views/gallery.html` | `AssetView` only shows the current chat's linked assets | — | Deferred |
| Wardrobe, trade, crafting, battle | `—` (wardrobe absent); `src/routes/trade/`, `src/routes/crafting/`, `src/routes/rpg/`, `src/routes/battle/` | Not present | — | Separate epic |
| Character growth / traits / mood | `src/routes/character-growth/`, `src/routes/character-traits/`, `src/routes/character-mood/` | Not present | — | Separate epic |
| Story state | `src/routes/story-states/` (story-turns absent) | Not present | — | Separate epic |
| Auth | `src/routes/auth/` | TUI runs anonymous or with a config-supplied token only; no login flow | — | Deferred |

### Sequencing

1. **Testability first** — unblocks `TASK-tui-dedupe-api-base.md` and `TASK-tui-asset-view-remove-silent-catch-and-void-async-iife.md`; both tickets are in untestable files.
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

1. **P1 — Testability seam** — `createHarnessView` already exists at `harness/index.ts:28` as a factory; apply the same pattern to `AssetView` (extract `createAssetView`); move `new TUIApp()` out of module scope into an explicit `start()` call. Unblocks `TASK-tui-shell-testability`, `TASK-tui-dedupe-api-base.md`, `TASK-tui-asset-view-remove-silent-catch-and-void-async-iife.md`. Cheap and unblocked: `TASK-adopt-bun-color-for-tui-colors.md`, `TASK-adopt-bun-stringwidth-for-tui.md`.
2. **P2 — Spec sync** — correct `docs/spec/terminal-ui.md` against code: route paths, feature list addition of harness overlay. Unblocks `TASK-tui-spec-sync`.
3. **P3 — Chat picker** — list existing chats, pre-select on enter, wire `ChatWidget.setChatId`. Unblocks `TASK-tui-chat-picker`.
4. **P4 — Work-topic surface** — add topic column + F4 filter to harness overlay. Unblocks `TASK-harness-topic-tui-surface`.
5. **P5 — `ENABLE_TUI` config flag** — `TASK-tui-enabled-config-flag-never-read.md`: decide wire / remove / document-and-remove-from-env-map. One decision, not three dangling options.

## Tickets

### Landed

- [x] `TASK-tui.md` — umbrella task for the chat/api modernization + tests batch
- [x] `TASK-coverage-waiver-tui-chat-index-ts-at-51-under-check-gate.md` — per-file waiver added to `scripts/check/coverage/waivers.mjs`; mock.module suite covers sessionToken threading
- [x] `BUG-tui-app-getlogger-throws-when-running-standalone.md` — `createLogger({level:"warn"})` at `src/tui/app.ts:155` before `new TUIApp()`
- [x] `BUG-tui-app-never-threads-sessiontoken-into-chatwidget.md` — `config.tui.sessionToken` threaded into `ChatWidget`; empty-string normalized to undefined

### Open

- [ ] `TASK-tui-shell-testability` — remove module-scope `new TUIApp()` from `src/tui/app.ts:157`; unblocks two bug-fix tickets currently stuck in untestable files
- [ ] `TASK-tui-spec-sync` — correct spec drift across all four rows in §Spec drift
- [ ] `TASK-tui-chat-picker` — list view for existing chats; highest-value missing TUI screen
- [ ] `TASK-update-terminal-ui-spec-to-actual-file-layout.md` — spec drift on file layout; superseded in practice by `TASK-tui-spec-sync` (work that one instead)

### Deferred / Open

- `TASK-tui-dedupe-api-base.md` — `API_BASE` declared in both `chat/api.ts` and `harness/api.ts`; harness re-exports from chat so one declaration is redundant (blocked on P1)
- `TASK-tui-asset-view-remove-silent-catch-and-void-async-iife.md` — banned patterns in `AssetView.setChatId` (blocked on P1)
- `TASK-tui-enabled-config-flag-never-read.md` — decide wire / remove / document-and-remove-from-env-map
- `TASK-adopt-bun-color-for-tui-colors.md` — adopt `Bun.color()` for theme
- `TASK-adopt-bun-stringwidth-for-tui.md` — adopt `Bun.stringWidth()` for safe truncation (fixes `formatMessageLine` surrogate-pair split)

### Cross-epic

- `TASK-harness-work-topics` — work-topic entity, CRUD, epic binding, auto-scoping ladder (`epic-harness-integration.md`)
- `TASK-harness-topic-tui-surface` — work-topic surface on the existing harness overlay (`epic-harness-integration.md` §18)
- `TASK-harness-topic-session-attach` — session attachment + lineage + exec-log field (`epic-harness-integration.md`)
- `TASK-harness-context-priority-tiers` — the 0/1/2/3 tier budget, composed with existing section PRIORITY (`epic-harness-integration.md`)