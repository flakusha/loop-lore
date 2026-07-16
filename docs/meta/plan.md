# Implementation Plan

**v0.1 MVP — Epics 1–19: foundation hardening. All scope is MVP; no separate v0.2.**

Next target: complete remaining in-progress epics — responsive UX (13), observability (16).

---

## 📌 Epics

### 1. Core Infrastructure — ✅ Complete

Server, database, config, middleware, logger, transport layer.

| Task                                           | Files                                          |
| ---------------------------------------------- | ---------------------------------------------- |
| DB schema (19 tables)                          | `src/db/schema-*.ts`, `migrations/001_init.ts` |
| Enums (30+)                                    | `src/db/enums-*.ts`                            |
| Kysely init + WAL                              | `src/db/index.ts`                              |
| Config (YAML/TOML/env, NSFW)                   | `src/config/load.ts`, `schema.ts`              |
| TLS cert auto-gen                              | `src/config/cert.ts`                           |
| Middleware (auth, compose, error)              | `src/middleware/*.ts`                          |
| Logger (structured, rotate)                    | `src/logger/*.ts`                              |
| Transport (H1/H2/WS, compression, negotiation) | `src/transport/*.ts`                           |
| Server (HTTP/HTTPS, static, API dispatch)      | `src/server.ts`                                |
| Content encode/decode/minify                   | `src/content/*.ts`                             |
| DB migrate runner                              | `src/db/migrate.ts`                            |

### 2. API Layer — ✅ Complete

All route controllers + router.

| Task                                          | Files                      |
| --------------------------------------------- | -------------------------- |
| Chat CRUD + participants                      | `src/routes/chats.ts`      |
| Message CRUD + variants + visibility + status | `src/routes/messages.ts`   |
| Character/actor CRUD + card export/import     | `src/routes/characters.ts` |
| User CRUD + settings                          | `src/routes/users.ts`      |
| World CRUD + nested locations                 | `src/routes/worlds.ts`     |
| Auth (login, logout, demo, me)                | `src/routes/auth.ts`       |
| API keys                                      | `src/routes/api-keys.ts`   |
| Asset controller (upload, serve, link)        | `src/assets/controller.ts` |
| View serving (layout wrapper, aliases)        | `src/routes/views.ts`      |
| Route router (register + dispatch)            | `src/routes/router.ts`     |
| HTTP utils (response helpers, error types)    | `src/routes/http-utils.ts` |

### 3. Backend Services — ✅ Complete

Generation, story, assistant, assets, age gate, profanity, dice, content encoding.

| Task                                                                      | Files                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------ |
| Generation module (providers, pipeline, cancellation, policy, repetition) | `src/generation/*.ts`                                  |
| Story engine (turn manager, quest, game master, quality)                  | `src/story/*.ts`                                       |
| Assistant (rule-based, prompt assembler)                                  | `src/assistant/*.ts`                                   |
| Assets service (CRUD, upload, linking, metadata extraction)               | `src/assets/service.ts`, `metadata.ts`                 |
| Age gate (service + controller)                                           | `src/age-gate/*.ts`                                    |
| Profanity filter (obscenity)                                              | `src/profanity/service.ts`                             |
| Dice engine (parse, roll, text commands)                                  | `plugins/core/dice-roller/*.ts` — plugin demonstration |

### 4. Frontend Shell — ✅ Complete

Layout, themes, i18n, build pipeline, Alpine modular architecture.

| Task                                                           | Files                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| Persistent sidebar in layout (hamburger drawer)                | `src/views/layout.html`                                     |
| Theme system (10 themes, CSS var switching, localStorage)      | `src/public/css/theme*.css`                                 |
| Component CSS (app.css, gallery.css)                           | `src/public/css/*.css`                                      |
| i18n infrastructure (en.json, `t()` function, settings toggle) | `src/frontend/alpine/i18n.ts`, `src/public/locales/en.json` |
| Alpine modules (split into modular files)                      | `src/frontend/alpine/*.ts`                                  |
| Browser crypto lib                                             | `src/frontend/browser.ts`                                   |
| Build pipeline (auto-build, comment strip, compression)        | `src/build/compress.ts`, `package.json`                     |
| 401 redirect helper (apiFetch across all calls)                | `src/frontend/alpine/htmx.ts`                               |

### 5. Chat Experience — ✅ Complete

Messages, send, inline edit, media attachments, infinite scroll, generation feedback.

| Task                                                           | Status |
| -------------------------------------------------------------- | ------ |
| Message display (Alpine-rendered, loading/empty/data states)   | ✅     |
| Message grouping (5-min threshold)                             | ✅     |
| Hover tooling (copy, retry, continue, remove)                  | ✅     |
| Markdown rendering (marked, GFM)                               | ✅     |
| Send message (optimistic insert, POST, toast on error)         | ✅     |
| Generation status (typing indicator, polling, cancel)          | ✅     |
| Inline edit (cosmetic PATCH, `(edited)` label, Ctrl+Enter)     | ✅     |
| Infinite scroll (IntersectionObserver, auto, no manual button) | ✅     |
| Media attachments (upload→queue→send with message)             | ✅     |
| Aspect-ratio-aware media layout (wide/tall/square/grid)        | ✅     |
| Media preview modal                                            | ✅     |
| Image metadata extraction on upload (PNG/JPEG/WebP/GIF)        | ✅     |
| Attachments column on messages table                           | ✅     |
| API: accept + return enriched attachment data                  | ✅     |
| Pending assets chips in input toolbar                          | ✅     |
| Thinking process display (`<details>` expand)                  | ✅     |
| System/narration message styling                               | ✅     |

**Remaining (P2):**

- Swipe variants (touch/click handling)
- Message detail level display (stats per mode)
- WebP→PNG conversion for LLM API compatibility

### 6. Pages — ✅ Complete

All view templates with Alpine components.

| Task                                                            | Status |
| --------------------------------------------------------------- | ------ |
| Characters list (grid, create/import/detail modals, Start Chat) | ✅     |
| Character edit (form with all persona fields)                   | ✅     |
| Gallery (asset grid, upload, preview, delete, link)             | ✅     |
| Settings (General, Chat, API, Data, About sections)             | ✅     |
| Worlds list (create modal, card list)                           | ✅     |
| World detail (lore, chat rooms)                                 | ✅     |
| World edit (name, description, lore, tags)                      | ✅     |
| Login (card, demo mode, error states)                           | ✅     |
| New chat (type/mode selector, create)                           | ✅     |
| Character chat list (per-character chat list)                   | ✅     |

### 7. TUI — ✅ Complete

Terminal UI widgets.

| Task                                                     | Files                     |
| -------------------------------------------------------- | ------------------------- |
| Chat widget (message list, input, scroll, typing, error) | `src/tui/chat.ts`         |
| Asset view (browse linked assets, nav cycling)           | `src/tui/asset-view.ts`   |
| Screen manager (layout, global shortcuts, quit)          | `src/tui/app.ts`          |
| API wiring (`handleSend` fully wired with fetch)         | `src/tui/chat.ts:180-229` |

### 8. Security & Governance — ✅ Complete

Auth, rate limiting, age gate enforcement, profanity.

| Task                                                     | Status |
| -------------------------------------------------------- | ------ |
| Auth middleware (token lookup, session)                  | ✅     |
| Rate limiting (10/min login, 3/hr register)              | ✅     |
| Age gate service (self-declaration, minimum age)         | ✅     |
| Age gate enforcement in chat creation (check birth_date) | ✅     |
| Profanity filter (obscenity, leetspeak, confusables)     | ✅     |
| 401 redirect in Web UI (apiFetch helper)                 | ✅     |

### 9. Testing & Release — ✅ Complete

| Task                                                              | Status                                                       | Test file                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `bun test` passes                                                 | ✅ Sequential: 718 pass, 0 fail. Parallel: 713 pass, 5 flaky | —                                                                 |
| E2E web UI (auth, chats, messages, characters, assets)            | ✅ Complete                                                  | `tests/e2e/flows/{auth,chats,messages,characters,assets}.test.ts` |
| E2E age gate (underage rejection, acceptance flow)                | ✅ Complete                                                  | `tests/e2e/flows/age-gate.test.ts`                                |
| E2E profanity filter (message filtering)                          | ✅ Complete                                                  | `tests/e2e/flows/profanity.test.ts`                               |
| E2E chat full (assets loading, regenerate/reroll, swipe variants) | ✅ Complete                                                  | `tests/e2e/flows/chat-full.test.ts`                               |
| E2E browser smoke (page loads, views)                             | ⚠️ Flaky — `data-testid` mismatches, chrome timeout          | `tests/e2e/flows/browser/{smoke,chat-flow}.test.ts`               |
| E2E browser auth (login form, htmx submit)                        | ⚠️ Flaky — `data-testid` mismatch                            | `tests/e2e/flows/browser/auth-flow.test.ts`                       |
| Crypto unit tests (pipeline, SMK, chat-keys, actor-keys, BYOK)    | ✅ 69 tests                                                  | `src/crypto/{pipeline,smk,chat-keys,actor-keys,byok}.test.ts`     |
| Content compress unit tests                                       | ✅ 9 tests                                                   | `src/content/compress.test.ts`                                    |
| Logger internals unit tests                                       | ✅ 65 tests                                                  | `src/logger/{censors,formatters,levels,limits}.test.ts`           |
| Logger transports unit tests                                      | ✅ 9 tests                                                   | `src/logger/transports/console.test.ts`                           |
| Date utils unit tests                                             | ✅ 15 tests                                                  | `src/utils/date.test.ts`                                          |
| Provider types unit tests                                         | ✅ 9 tests                                                   | `src/generation/providers/types.test.ts`                          |
| Step pipeline unit tests                                          | ✅ 9 tests                                                   | `src/generation/step-pipeline.test.ts`                            |
| Assets metadata unit tests                                        | ✅ 13 tests                                                  | `src/assets/metadata.test.ts`                                     |
| `bun run check`                                                   | ✅ Passes (typecheck, lint, format, md:lint)                 |                                                                   |
| Getting-started guide                                             | ✅ Exists at `docs/guide/getting-started.md`                 |                                                                   |
| Tag v0.1.0                                                        | ❌                                                           |                                                                   |

---

---

## 🏗️ v0.1 — Foundation Completion

Target: solidify generation, admin, memory, responsive UX, search, i18n, observability.

### 10. Generation Foundation — ⬜ Not Started

Tool-calling loop, provider resilience, streaming reconnect.

| Task                                    | Files                                                                 | Notes                                                                                                                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LLM tool-call loop in generate-route.ts | `src/generation/generate-route.ts`                                    | Inject tool defs from plugin registry, parse `tool_calls` from response, execute via `ToolDefinition.handler`, feed results back as `tool` role messages. Multi-turn orchestration capped at N rounds. |
| Tool definition injection into requests | `src/generation/generate-route.ts`                                    | Map `PluginRegistry.getAllTools()` → OpenAI `tools` array. Gate on `ProviderCapabilities.tools`.                                                                                                       |
| `tool_calls` response parsing           | `src/generation/providers/openai-compatible.ts`                       | Parse SSE `tool_calls` delta accumulation (index-based merge). Emit `tool_call` chunk events.                                                                                                          |
| Tool execution + result loop            | `src/generation/generate-route.ts`                                    | Execute tool, store result as `role: "tool"` message, re-inject into context, continue generation. Max rounds configurable (default 5).                                                                |
| Provider failover (ordered fallback)    | `src/generation/providers/registry.ts`                                | Try provider A → B → C. Circuit breaker: N consecutive failures trigger cooldown (2^attempt seconds). Respect `Retry-After` headers.                                                                   |
| Circuit breaker pattern                 | `src/generation/providers/circuit-breaker.ts`                         | NEW. Track failures per provider. Half-open probe after cooldown. Configurable thresholds.                                                                                                             |
| SSE reconnect via `Last-Event-ID`       | `src/generation/generate-route.ts`, `src/generation/stream-buffer.ts` | Parse `Last-Event-ID` header, call `streamBuffer.replay(seq)`. Emit replayed events before new stream.                                                                                                 |

### 11. Admin & Settings Architecture — ⬜ Not Started

Page-vs-modal architecture, admin pages, user prefs modal, plugin management.

| Task                       | Files                                       | Notes                                                                                                                                             |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin middleware gate      | `src/middleware/admin-gate.ts`              | NEW. Check `user.role === 'admin'`. Redirect to `/` if not.                                                                                       |
| Admin page routes          | `src/routes/admin.ts`                       | NEW. `/admin` → redirect to `/admin/settings`. `/admin/settings/[section]` — tabbed admin pages. `/admin/users` — user management.                |
| Admin settings tabs        | `src/views/admin/`                          | NEW. Tabs: General, API, Users, Data, About. Each tab = htmx partial. Keywords per tab for search.                                                |
| Admin runtime config table | `src/db/migrations/`, `src/admin/config.ts` | NEW. `system_config` key-value table. Seed with `config.yaml` defaults at startup. Admin changes take effect without restart.                     |
| User preferences modal     | `src/views/modals/settings.html`            | NEW. Modal overlay accessible from chat. Tabs: Theme, Chat Behavior, Generation, Shortcuts, Data. Live preview (theme changes apply immediately). |
| Per-user settings API      | `src/routes/settings.ts`                    | NEW. `GET/PATCH /api/settings` → read/write `users.settings` JSON column. Auto-merge on PATCH.                                                    |
| Plugin management API      | `src/routes/plugins.ts`                     | NEW. `GET /api/plugins` list, `POST /api/plugins/:name/enable`, `POST /api/plugins/:name/disable`. Gate on admin role.                            |

### 12. Memory Foundation — ✅ Complete

Keyword filtering, type normalization, context compaction, author's note, XML delimiting, KV-cache optimization.

| Task                                             | Files                                              | Status |
| ------------------------------------------------ | -------------------------------------------------- | ------ |
| Keyword filtering on `actor_memories`            | `src/assistant/prompt/sections/memories.ts`        | ✅     |
| `memory_type` enum: episodic/semantic/procedural | `src/db/migrations/parts/005_actor_data.ts`        | ✅     |
| `decay_rate` + `strength` + `last_accessed_at`   | `src/db/migrations/011_memory_decay.ts`            | ✅     |
| Context compaction at 85% threshold              | `src/generation/context-compactor.ts`              | ✅     |
| A/N depth injection (author's note section)      | `src/assistant/prompt/sections/author-note.ts`     | ✅     |
| Memory XML delimiting                            | `src/assistant/prompt/sections/memories.ts`        | ✅     |
| KV-cache optimization (dynamic context section)  | `src/assistant/prompt/sections/dynamic-context.ts` | ✅     |

### 13. Frontend Responsive & UX — 🟡 In Progress

Mobile breakpoints, touch targets, keyboard shortcuts, HTMX search/filter utilities.
Responsive + a11y polish landed in v0.2 in-progress work (sidebar, layout, components,
characters/gallery/world pages). HTMX search/filter, view toggle, bulk actions still TODO.

| Task                                        | Files                                             | Notes                                                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mobile breakpoints (768px, 480px)           | `src/public/css/app.css`                          | Mobile-first base. `@media (min-width: 768px)` desktop enhancements. `@media (max-width: 480px)` small phone.                                                |
| Container queries on input bar              | `src/public/css/app.css`                          | `container-type: inline-size` on `.chat-input-bar`. Collapse extra buttons when bar < 420px/320px.                                                           |
| 100dvh + safe-area-inset                    | `src/views/layout.html`, `src/public/css/app.css` | `height: 100dvh` on body, `padding-bottom: env(safe-area-inset-bottom)` on input bar.                                                                        |
| 44px touch targets                          | `src/public/css/app.css`                          | `@media (hover: none) and (pointer: coarse)` rule for buttons, nav links, list items.                                                                        |
| Swipe gesture for sidebar                   | `src/frontend/alpine/sidebar.ts`                  | Swipe right from left 40px edge → open. Swipe left → close. Backdrop dismiss. Escape key.                                                                    |
| Responsive sidebar                          | `src/public/css/app.css`                          | Mobile: `position: fixed`, 80% width, `transform: translateX(-100%)`, backdrop `rgba(0,0,0,0.4)`. Desktop: CSS var `--sidebar-width`, resizable drag handle. |
| Keyboard shortcuts                          | `src/frontend/alpine/shortcuts.ts`                | `@keydown.window`. Shortcuts: toggle sidebar (Ctrl+B), new chat (Ctrl+N), focus input (Ctrl+L), send (Enter), search (Ctrl+K).                               |
| HTMX active search on gallery               | `src/views/gallery.html`                          | `hx-trigger="input changed delay:300ms"`, `hx-get="/views/gallery/results"`, `hx-push-url="true"`, `hx-target="#asset-grid"`.                                |
| HTMX active search on characters            | `src/views/characters.html`                       | Same pattern. Search by name, sort (newest/name/most active). Tags filter.                                                                                   |
| HTMX active search on worlds                | `src/views/worlds.html`                           | Same pattern.                                                                                                                                                |
| Chat list search + status filter            | `src/views/chat-list-panel.html`                  | Search by title/character. Filter by status (active/archived/pinned). Sort (recent/alpha).                                                                   |
| Filter bar component                        | `src/components/filter-bar.html`                  | Reusable: `[search input, type dropdown, sort dropdown, active chips, clear all]`.                                                                           |
| Active filter chips                         | `src/components/filter-chips.html`                | Removable tags showing current filters. Alpine-managed.                                                                                                      |
| Load More pagination                        | `src/components/load-more.html`                   | `hx-swap="outerHTML"`. Server replaces button with new cards + next page button.                                                                             |
| Empty states                                | `src/components/empty-state.html`                 | "No results" with clear filters action. Server-rendered HTML fragment.                                                                                       |
| Loading indicators                          | `src/public/css/app.css`                          | `.htmx-indicator` spinner CSS. Already in spec — implement.                                                                                                  |
| CSS skeleton shimmer                        | `src/public/css/app.css`                          | Skeleton loading placeholders for cards/lists.                                                                                                               |
| View toggle (grid/list)                     | `src/views/gallery.html`                          | Alpine `x-data`. CSS grid vs vertical rows. Preference persisted.                                                                                            |
| Bulk chat actions                           | `src/views/chat-list-panel.html`                  | Checkbox selection. Archive, delete, export batch. Alpine-managed selection array.                                                                           |
| Chat pin/favorite                           | `src/routes/chats.ts`, `src/db/`                  | `is_pinned` column toggle via PATCH. Star icon in chat list.                                                                                                 |
| Message archiving (cascade, restore, purge) | `src/routes/messages.ts`, `src/db/`               | Soft-delete via `archived_at` column. Restore within 30 days. Permanent purge after.                                                                         |

### 14. Import/Export & Data Portability — ⬜ Not Started

File-based character import, chat export, PNG steganography.

| Task                              | Files                      | Notes                                                                                             |
| --------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| File upload character import      | `src/routes/characters.ts` | Replace `NotImplemented` at line 279. Accept multipart upload. Parse JSON body from file.         |
| PNG steganography card extraction | `src/routes/characters.ts` | Extract PNG tEXt/iTXt chunks. Parse base64-encoded JSON character data. Support V2/V3 card specs. |
| YAML/TOML character import        | `src/routes/characters.ts` | Parse YAML/TOML file body. Map to actor fields. Validate.                                         |
| Chat export (JSON)                | `src/routes/chats.ts`      | `GET /api/chats/:id/export` → full chat with messages, actors, assets metadata as JSON download.  |
| Chat export (Markdown)            | `src/routes/chats.ts`      | Same endpoint, `?format=md`. Rendered as markdown dialogue.                                       |
| Bulk data export                  | `src/routes/settings.ts`   | Export all user data: chats, characters, settings, assets. Single ZIP download.                   |
| Asset download endpoint           | `src/assets/controller.ts` | `GET /api/assets/:id/download` with Content-Disposition header.                                   |

### 15. i18n & Accessibility — ⬜ Not Started

Server-side i18n, ARIA pass, keyboard navigation, additional locales.

| Task                                | Files                                    | Notes                                                                                                      |
| ----------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Server-side i18n module             | `src/i18n/index.ts`, `src/i18n/types.ts` | NEW. `t(key, locale, params)` function. Load locale JSON files. Fallback to `en` on miss.                  |
| i18n middleware                     | `src/middleware/i18n.ts`                 | NEW. Detect `Accept-Language` header or `?lang=` param. Attach `req.t = t.bind(null, locale)` to request.  |
| Translate all server error messages | `src/routes/*.ts`, `src/i18n/`           | Replace hardcoded English strings with `t()` calls. Add translation keys for all error envelopes.          |
| Locale files (10 languages)         | `src/public/locales/*.json`              | ja, zh-CN, zh-TW, ko, ru, de, fr, pt-BR, es. Seed with English, mark for translation.                      |
| ARIA landmark roles                 | `src/views/*.html`                       | `<nav role="navigation">`, `<main role="main">`, `<aside role="complementary">`, `<header role="banner">`. |
| ARIA labels on interactive elements | `src/views/*.html`                       | `aria-label` on icon buttons, `aria-describedby` on inputs, `aria-expanded` on toggles.                    |
| Focus management                    | `src/frontend/alpine/focus.ts`           | Trap focus in modals. Return focus on close. `autofocus` on search inputs.                                 |
| Skip-to-content link                | `src/views/layout.html`                  | Hidden link as first focusable element.                                                                    |
| Keyboard navigation                 | `src/frontend/alpine/shortcuts.ts`       | Tab order, arrow key navigation in lists, Escape to close modals/panels.                                   |
| Focus-visible styling               | `src/public/css/app.css`                 | `:focus-visible` outline on interactive elements. Remove default `:focus` outlines.                        |

### 16. Observability & CI — 🟡 In Progress

Opt-in telemetry, admin analytics API, CI config, Playwright responsive tests.
CI config (GitHub Actions) added in v0.2 in-progress work. Telemetry + responsive tests TODO.

| Task                        | Files                                              | Notes                                                                                                                                      |
| --------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Telemetry config loading    | `src/telemetry/config.ts`                          | NEW. Env vars: `TELEMETRY_ENABLED`, `TELEMETRY_EVENTS_ENABLED`, `TELEMETRY_FRONTEND_ENABLED`, `TELEMETRY_RETENTION_DAYS`. All default OFF. |
| Telemetry service           | `src/telemetry/service.ts`                         | NEW. `record()` method. Generation events: `generation.started/completed/failed`, `tool.called/failed`. Metadata-only (no content).        |
| Telemetry events table      | `src/db/migrations/`, `src/db/schema-telemetry.ts` | NEW. `id`, `session_id`, `user_id`, `chat_id`, `event_type`, `event_data` (JSON), `created_at`, `source`.                                  |
| Telemetry route             | `src/routes/telemetry.ts`                          | NEW. `POST /api/telemetry/event` — accept event from frontend (sendBeacon). Rate limit 100/sec/session.                                    |
| Frontend telemetry tracking | `src/frontend/alpine/telemetry.ts`                 | NEW. `track(type, data)` → `navigator.sendBeacon('/api/telemetry/event', ...)`. htmx lifecycle hooks. `window.onerror` capture.            |
| Admin analytics API         | `src/routes/telemetry.ts`                          | `GET /api/telemetry/analytics/summary, models, errors, daily, sessions`. `DELETE /api/telemetry/analytics/purge`. Admin-gated.             |
| Retention cleanup           | `src/telemetry/cleanup.ts`                         | NEW. On startup + every 24h: delete events older than `TELEMETRY_RETENTION_DAYS`.                                                          |
| CI config (GitHub Actions)  | `.github/workflows/ci.yml`                         | NEW. `bun run check` → `bun test src/` → `bun run test:e2e:browser`. Matrix: bun 1.x.                                                      |
| Playwright responsive tests | `tests/e2e/responsive/`                            | NEW. Viewport 375px, 768px, 1440px. Sidebar overlay behavior, input bar adaptation.                                                        |
| Browser E2E stabilization   | `tests/e2e/flows/browser/`                         | Fix `data-testid` mismatches. Add chrome timeout retry. Stabilize auth-flow, chat-flow, smoke.                                             |

### 17. Encryption Foundation — ⬜ Not Started

AES-256-GCM at-rest encryption for messages. Three-tier model: public (no
encryption), standard (server-mediated with actor keys), private (E2E with
client-side key exchange). Build in order: public first, then standard, then
private (with external audit before production).

| Task                                     | Files                     | Notes                                                                                                           |
| ---------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Public tier (Phase 0)                    | `src/routes/messages.ts`  | No encryption. Validate all chat flows work without crypto.                                                     |
| Server-side at-rest encryption (Phase 1) | `src/crypto/at-rest.ts`   | NEW. AES-256-GCM encrypt/decrypt message content on write/read. Key from env or auto-generated on first run.    |
| Per-user keys via Argon2id (Phase 2)     | `src/crypto/user-keys.ts` | NEW. Derive per-user key from password + Argon2id. Encrypt messages with user key.                              |
| Chat-level key derivation (Phase 3)      | `src/crypto/chat-keys.ts` | Per-chat AES-256-GCM from participant keys via HKDF. Already built — wire to routes.                            |
| Browser-side key derivation              | `src/frontend/browser.ts` | Web Crypto API: `PBKDF2` derive key from password. Store in session. Send encrypted blobs to server.            |
| Private tier (Phase 4) — E2E             | `src/crypto/e2e/`         | NEW. Client-side encrypt before send. Key exchange protocol. Forward secrecy on user leave. External audit req. |
| Key rotation on user leave               | `src/crypto/chat-keys.ts` | New keys for subsequent messages when participant leaves. Old keys expire, can't decrypt new content.           |
| Immutability enforcement                 | `src/routes/chats.ts`     | Reject encryption level change after chat creation. Only clone-to-new-chat allowed.                             |
| WebP→PNG conversion                      | `src/assets/metadata.ts`  | Convert WebP images to PNG before sending to LLM APIs that don't support WebP.                                  |

See [`docs/frontend/encryption.md`](../frontend/encryption.md#chat-encryption-tiers)
for full tier specification.

### 20. E2E Performance Benchmarks — ⬜ Not Started

Deterministic performance tracking per git sha. Fixed seed data, in-memory DB,
mock providers, single-threaded. Results stored in `data/benchmarks/`
(gitignored). Diff script compares commits.

| Task                            | Files                        | Notes                                                                                |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------ |
| Benchmark runner                | `scripts/bench-run.ts`       | NEW. Run suite, write `data/benchmarks/<sha>.json`. API + DB categories.             |
| Diff script                     | `scripts/bench-diff.ts`      | NEW. Compare two git shas, print per-benchmark delta. Flag regressions.              |
| Trend script                    | `scripts/bench-trend.ts`     | NEW. Show last N runs as ASCII trend.                                                |
| CI integration (GitHub Actions) | `.github/workflows/ci.yml`   | Run benchmarks, upload artifact, compare against `main`. Block merge on 2x slowdown. |
| Threshold config                | `benchmarks/thresholds.json` | Configurable thresholds: warn at 50% degradation, block at 200% degradation.         |

See [`docs/spec/e2e-benchmarks.md`](../spec/e2e-benchmarks.md) for full spec.

### 18. Local Inference Integrations — ⬜ Not Started

ComfyUI plugin, llama-swap LLM proxy, stable-diffusion.cpp, gallery metadata enrichment,
chat-driven generation, security baseline for remote URLs.

Full contract: [backlog.md](backlog.md#p2--specified-not-implemented) (synopsis from
`docs/research/comfyui-local-inference.md` + `docs/research/local-remote-inference-uis.md`).

### 19. Basic Chat Notifications — ✅ Complete

In-app unread badges + toasts for messages arriving in chats the user isn't
viewing. Reuses existing SSE (`EventSource`) + `showToast` infra. **Autonomous
scheduled messages deferred** (see [backlog.md](backlog.md#d5-cross-chat-autonomous-messages)). No
browser-native push (needs service worker + push server) — out of scope.

| Task                             | Files                                                     | Status |
| -------------------------------- | --------------------------------------------------------- | ------ |
| Cross-chat activity signal (SSE) | `src/routes/activity.ts`, `src/routes/activity-stream.ts` | ✅     |
| Read-state schema                | `src/db/migrations/parts/004_chats_actors.ts`             | ✅     |
| Chat-list unread badge           | `src/components/chat/chat-list-panel.html`                | ✅     |
| Toast on foreign-chat message    | `src/frontend/alpine/chat-activity.ts`                    | ✅     |
| Mark-read on chat open           | `src/routes/chats.ts`, `src/frontend/alpine/chat.ts`      | ✅     |
| Activity SSE listener            | `src/frontend/alpine/chat-activity.ts`                    | ✅     |

---

## Known Issues

### Resolved (2026-07-15)

- **Boolean integer flags → typed state enums:** Converted 5 columns (is_pinned, is_default, pinned, equipped, stackable) from magic 0/1 integers to string enums with state machines. Migration 010 handles data transform. Fixes latent bug in new-chat.ts persona selection.

### Resolved (2026-07-10)

- **TS strict-typing debt:** `db/index.ts` alias renamed `Database`→`Db`; `bun run typecheck` clean.

### Browser E2E Instability

**Solo/Seed User ID Mismatch** — Browser E2E tests seed data with deterministic
IDs but server solo mode creates a random solo user. Seeded data invisible.
Fix: seed solo user with `UserRole.Solo` or have tests login as seeded user.

**Parallel Suite Instability** — 7 browser E2E test files sharing module-level
singletons (`cachedSoloUser`) corrupt each other's state under parallel load.
Also 7 Playwright browsers + 7 `Bun.serve` instances trigger timeouts.
Fix: make `cachedSoloUser` per-request; reduce parallelism or use shared fixture.

**Cascade Failure Pattern** — Single test timeout kills all subsequent tests in
file via shared `ctx.page` state.

### Schema Hardening — Planned

Tracked in detail at [schema.md#bare-string-columns-requiring-enum-types](../spec/schema.md).
Summary of low-risk cleanup tasks:

| #   | Task                                             | Files                                                       | Difficulty |
| --- | ------------------------------------------------ | ----------------------------------------------------------- | ---------- |
| 1   | Lore `enabled` → `LoreEntryStatus` enum          | enums, 2× schema, 2× migration, 2× routes, prompt-assembler | Medium     |
| 2   | `actor_keys.status` → `KeyStatus` enum + SM      | enums, schema, migration, actor-keys.ts                     | Low        |
| 3   | `actor_keys.key_type` → `KeyType` enum           | enums, schema, migration, actor-keys.ts                     | Low        |
| 4   | `memory_type` → `MemoryType` enum                | enums, schema, migration, actor-memories route              | Low        |
| 5   | `actor_notes.category` → `NoteCategory` enum     | enums, schema, migration                                    | Low        |
| 6   | Wire `world_items.visibility` → `ItemVisibility` | schema, migration                                           | Trivial    |
| 7   | Align `chats.purpose` / `chat_purpose` naming    | schema, migration                                           | Trivial    |
| 8   | Add `actor_keys.public_key` to migration DDL     | migration                                                   | Trivial    |

### Remaining Review Findings (Round 3, 2026-07-06)

Tracked in detail at [reviews/review-rounds.md](reviews/review-rounds.md).
Key open items:

| #   | File                                | Issue                                                           |
| --- | ----------------------------------- | --------------------------------------------------------------- |
| 14  | `src/db/enums.ts`                   | Barrel re-exports but no validation enums match DB. Drift risk. |
| 15  | `src/db/migrations/001_init.ts`     | `chat_participants` PK undocumented                             |
| 16  | `src/db/migrations/001_init.ts`     | No index on `sessions(user_id, expires_at)` for cleanup         | migration/parts/001_users.ts:37  | **Resolved** — `idx_sessions_user_expires` already exists          |
| 18  | `src/utils.ts`                      | `safeJsonStringify` guarded mode parses JSON twice on hot path  |
| 21  | `src/assistant/service.ts`          | Config schema may not have `assistant.enabled`                  | schema.ts:37, schema-class.ts:73 | **Resolved** — `enabled: boolean` field exists with default `true` |
| 22  | `src/assistant/prompt-assembler.ts` | Selective entries (keys) ignored                                |
| 23  | `src/assistant/prompt-assembler.ts` | Token budget enforcement message array rebuild bug              |
| 24  | `src/tui/app.ts`                    | Monkey-patches `ChatWidget.setChatId`                           |
| 25  | `src/tui/chat.ts`                   | No retry, no idempotency key                                    |
| 26  | `src/tui/asset-view.ts`             | Left/right keys conflict with input nav                         |
| 27  | `src/age-gate/controller.ts`        | `runtimeConfig` module-level mutable                            |
| 29  | `src/build/compress.ts`             | No try/catch on single file                                     | compress.ts:56-67                | **Resolved** — Added try/catch around `writeFileSync` (2026-07-16) |

---

## 🔗 Cross-Reference

- Active development & bugs: this document (plan.md), [open-items.md](open-items.md)
- Future / deferred: [backlog.md](backlog.md)
- Long-term vision: [roadmap.md](roadmap.md)
- DB: [schema.md](../spec/schema.md)
- Frontend UX: [overview.md](../frontend/overview.md), [chat/](../frontend/chat/)
- TUI: [tui.md](../spec/tui.md)
- Assets: [assets.md](../spec/assets.md)
- Build: `package.json` scripts
