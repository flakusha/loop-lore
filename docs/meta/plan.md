# Implementation Plan

**v0.1: 0 TS errors. All tests pass. Build clean. Epics 1–9 complete.**  
**v0.2: Epics 10–17 — foundation hardening. 15 issues resolved (Round 3).**

Next target: **v0.2** — generation resilience, admin/settings, memory foundation, responsive UX, search/filter, i18n/a11y, observability, encryption.

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

## 🏗️ v0.2 — Foundation Completion

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

### 12. Memory Foundation — 🟡 In Progress

Keyword filtering, type normalization, context compaction, A/N injection.
Code landed in v0.2 in-progress work: `memory_type` enum + `decay_rate`/`strength`
columns (migration 009), `prompt-assembler.ts` (selective memory entries, author note,
nested lorebook). Context compaction + i18n-keyword filtering still TODO.

| Task                                             | Files                                          | Notes                                                                                                                                                                                |
| ------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Keyword filtering on `actor_memories`            | `src/assistant/prompt-assembler.ts`            | Use existing `keywords` JSON column for relevance filtering instead of top-20-by-importance. Match against current user message keywords.                                            |
| `memory_type` enum: episodic/semantic/procedural | `src/db/migrations/`, `src/db/schema-story.ts` | Add CHECK constraint on `memory_type`. Add `decay_rate` and `strength` columns.                                                                                                      |
| Context compaction at 85% threshold              | `src/generation/context-compactor.ts`          | NEW. Estimate tokens (chars*0.3 heuristic). At 85% context fill: summarize older half of conversation, inject as `[Conversation Summary]` system message. Keep last 10 messages.     |
| A/N depth injection                              | `src/assistant/prompt-assembler.ts`            | Add author's note with position (before/after prompt, in-chat at depth), interval (every N messages), role (system/user/assistant), per-character override.                          |
| Memory XML delimiting                            | `src/assistant/prompt-assembler.ts`            | Wrap injected memories in `<memory_context>...</memory_context>` to prevent prompt injection.                                                                                        |
| KV-cache optimization                            | `src/assistant/prompt-assembler.ts`            | Dynamic content (date/time, user counters) injected as separate user-role message near end of context, NOT in static system prompt. Keeps system prefix byte-identical across turns. |

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

AES-256-GCM at-rest encryption for messages.

| Task                                     | Files                     | Notes                                                                                                        |
| ---------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Server-side at-rest encryption (Phase 1) | `src/crypto/at-rest.ts`   | NEW. AES-256-GCM encrypt/decrypt message content on write/read. Key from env or auto-generated on first run. |
| Per-user keys via Argon2id (Phase 2)     | `src/crypto/user-keys.ts` | NEW. Derive per-user key from password + Argon2id. Encrypt messages with user key.                           |
| Browser-side key derivation              | `src/frontend/browser.ts` | Web Crypto API: `PBKDF2` derive key from password. Store in session. Send encrypted blobs to server.         |
| WebP→PNG conversion                      | `src/assets/metadata.ts`  | Convert WebP images to PNG before sending to LLM APIs that don't support WebP.                               |

### 18. Local Inference Integrations — ⬜ Not Started

ComfyUI plugin, llama-swap LLM proxy, stable-diffusion.cpp, gallery metadata enrichment, chat-driven generation, security baseline for remote URLs.

**Actionable contract:** [`docs/meta/v02-local-inference.md`](v02-local-inference.md) — derived from `docs/research/comfyui-local-inference.md` + `docs/research/local-remote-inference-uis.md`.

| Task                                                              | Files                                 | Notes                                                                                                                                                                       |
| ----------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical ComfyUI HTTP+WS client                                  | `src/generation/comfyui/client.ts`    | `POST /prompt`, `GET /history/{id}`, `POST /upload/image`, `GET /view`, `ws://host/ws?clientId=`. No custom protocols.                                                      |
| Workflow template manager + tag composition                       | `src/generation/comfyui/templates.ts` | JSON templates w/ placeholder substitution. Tag taxonomy `kind: character\|item\|monster\|location`, `modality: image\|video`. Stored as assets, linked to character/world. |
| LoRA selection (prompt-inline + node inject)                      | `src/generation/comfyui/`             | Surface available LoRAs; per-gen composition.                                                                                                                               |
| llama-swap proxy client                                           | `src/generation/llama-swap.ts`        | OpenAI-compatible, multi-model, lazy load, auto-unload.                                                                                                                     |
| sd.cpp via sd-server (default) / sd-cli (fallback)                | `src/generation/sdcpp.ts`             | sd-server hosts model, VRAM cache, batches, no load-unload loop.                                                                                                            |
| SSE streaming + replay buffer                                     | `src/generation/stream-buffer.ts`     | Reconnect resilience (comfy-chatbot `_JobChannel`).                                                                                                                         |
| Asset pipeline integration                                        | `src/assets/service.ts`               | download → store → link `asset_links` → render `message.extra.image`.                                                                                                       |
| Gallery metadata (PNG tEXt+iTXt) + faceted search                 | `src/assets/metadata.ts`              | Caption→memory, params→re-roll; semantic search differentiator.                                                                                                             |
| Security baseline (SSRF allowlist, upload caps, path confinement) | `src/generation/`, `src/middleware/`  | Adopt when inference ships (was not in MVP dev).                                                                                                                            |

### 19. Basic Chat Notifications — 🟡 In Progress

In-app unread badges + toasts for messages arriving in chats the user isn't
viewing. Reuses existing SSE (`EventSource`) + `showToast` infra. **Autonomous
scheduled messages deferred** (see `docs/meta/deferred-concepts.md` D.5). No
browser-native push (needs service worker + push server) — out of scope.
Cross-chat activity SSE (`src/routes/activity.ts`) landed in v0.2 in-progress work.
Read-state schema + unread badge + mark-read TODO.

| Task                             | Files                                                     | Notes                                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-chat activity signal (SSE) | `src/routes/activity.ts`, `src/routes/messages.ts`        | `GET /api/activity/stream` emits `message.created` for all the user's chats. Reuse `EventSource` pattern from `src/frontend/alpine/chat-generations.ts`. Emit on message insert. |
| Read-state schema                | `src/db/migrations/`, `src/db/schema-core.ts`             | Add `last_read_message_id` to `chat_participants` (or `read_receipts` table). Minor migration.                                                                                   |
| Chat-list unread badge           | `src/frontend/alpine/*`, `src/views/chat-list-panel.html` | Listen to activity SSE; show per-chat unseen count.                                                                                                                              |
| Toast on foreign-chat message    | `src/frontend/ui.ts`, `src/frontend/alpine/*`             | `showToast` when event arrives for non-active chat.                                                                                                                              |
| Mark-read on chat open           | `src/routes/messages.ts` / chat-open handler              | Update `last_read_message_id`.                                                                                                                                                   |

---

## 🔄 Promoted from Skipped (v0.2)

These were listed as skipped in v0.1. Now planned for v0.2.

| Feature                                     | Moved To           | Rationale                                                                   |
| ------------------------------------------- | ------------------ | --------------------------------------------------------------------------- |
| Server-side i18n middleware                 | Epic 15            | Foundation for all error messages                                           |
| Plugin management API                       | Epic 11            | Admin foundation, extension lifecycle                                       |
| Message archiving (cascade, restore, purge) | Epic 13            | UX foundation over hard-delete                                              |
| CSS skeleton shimmer, modal confirm dialogs | Epic 13            | Loading state and destructive-action safety                                 |
| Multi-format character import (YAML/TOML)   | Epic 14            | Data portability                                                            |
| Client-side encryption (AES-256-GCM)        | Epic 17            | Security foundation                                                         |
| Anthropic/Ollama/Bedrock providers          | Epic 10 (deferred) | Needs tool-call loop first. Provider profiles already researched in Part 1. |
| `/api/sessions` routes                      | Epic 11            | Admin user management                                                       |
| `POST /api/auth/register`                   | Epic 11            | Admin user management                                                       |

---

## Known Issues

Review findings collected at [`docs/meta/reviews/review-rounds.md`](reviews/review-rounds.md).

3 rounds (2026-07-05 through 2026-07-06): 139 findings total. A verification pass on
**2026-07-10** confirmed the large majority of findings were already resolved in code
(see the "Resolved (verified 2026-07-10)" section in review-rounds.md). Only a small
set of lower-confidence items remain open.

### ~~TypeScript strict-typing debt~~ — RESOLVED (2026-07-10)

Previously reported: `src/db/index.ts` shadowed the `bun:sqlite` `Database` import
with `export type Database = Kysely<DB>` (`TS2440`), corrupting the `Kysely<DB>` type
and breaking `.references(...)` overloads in route files once the TS program grew.

**Resolution:** the alias was renamed to `export type Db = Kysely<DB>` (no longer
shadows `bun:sqlite`'s `Database`), so `bun run typecheck` is clean with the full
program. No further action needed.

---

## 🚫 Skipped During Implementation (v0.1 scope cut)

These features are described in spec/frontend docs but were **intentionally cut** from the MVP. Some have partial backend shells; most have no implementation at all.

| Feature                                                     | Spec                                      | Status                                         |
| ----------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| Multi-format character import (PNG/YAML/TOML/CHARX)         | `docs/spec/character-setup.md`            | ❌ Only JSON import works                      |
| Persona system (`personas` table, routes, UI)               | `docs/spec/character-setup.md`            | ✅ Implemented (v0.2)                          |
| Impersonation (`chat.impersonate_id`)                       | `docs/spec/character-setup.md`            | ❌ Not implemented                             |
| RPG mechanics (dice, stats, combat, XP, loot)               | `docs/spec/rpg-mechanics.md`              | ❌ `src/rpg/` does not exist                   |
| Three-tier memory system (episodic/semantic/procedural)     | `docs/spec/memory-system.md`              | ❌ Only `actor_memories` table exists          |
| Artifact system (code/docs/datasets as assets)              | `docs/spec/artifacts-system.md`           | ❌ Not implemented                             |
| Agentic workspace mode                                      | `docs/spec/use-case-agentic-workspace.md` | ❌ Not implemented                             |
| Client-side encryption (AES-256-GCM, key hierarchy)         | `docs/frontend/encryption.md`             | ❌ Messages stored as plaintext                |
| Frontend story mode UI (GM panel, quest log, story chat)    | `docs/frontend/chat/multi-llm-story.md`   | ❌ Backend `src/story/` exists but no frontend |
| Message archiving (cascade, restore, purge)                 | `docs/frontend/chat/archiving.md`         | ❌ Hard delete only                            |
| Memory selection UI (mid-chat panel, pinning, auto-extract) | `docs/frontend/chat/memories.md`          | ❌ Backend reads memories; no UI               |
| Server-side i18n middleware (`$t`, `req.t`)                 | `docs/frontend/internationalization.md`   | ❌ Minimal client-side `__()` only             |
| Anthropic/Ollama/Bedrock providers                          | `docs/spec/provider-system.md`            | ❌ Only OpenAI-compatible exists               |
| Plugin management API (install/list/enable/disable)         | `docs/spec/plugin-system.md`              | ❌ Plugin skeleton loads files; no API         |
| Signed URLs for asset downloads                             | `docs/spec/assets.md`                     | ❌ Uses `raw` endpoint with Bearer auth        |
| `POST /api/auth/register`                                   | `docs/spec/auth-middleware.md`            | ❌ Not implemented                             |
| `/api/sessions` routes                                      | `docs/spec/users-sessions.md`             | ❌ Not implemented                             |
| CSS skeleton shimmer, modal confirm dialogs, browser logger | `docs/frontend/components.md`             | ❌ Uses native `confirm()` and text loading    |
| Async background compression per upload                     | `docs/spec/assets.md`                     | ❌ Only build-time static compression          |
| S3/GCS object store backend                                 | `docs/spec/assets.md`                     | ❌ Local filesystem only                       |
| HTTP/2 and WebSocket in transport layer                     | `docs/spec/transport-unified.md`          | ❌ Defined but not integrated into server      |

---

## 🔗 Cross-Reference

- DB: [schema.md](../spec/schema.md)
- Frontend UX: [overview.md](../frontend/overview.md), [chat/](../frontend/chat/)
- TUI: [tui.md](../spec/tui.md)
- Assets: [assets.md](../spec/assets.md)
- Build: `package.json` scripts
- Research (v0.2 foundation):
  - [Part 1: Providers, Messages, Multimodal, Retry, Compression](../research/generation-pipeline-extended.md)
  - [Part 2: Swipe UX, Chat Modes, Settings, Text Enhancement](../research/generation-pipeline-extended-2.md)
  - [Part 3: Memory, Context Injection, Responsive, Telemetry](../research/generation-pipeline-extended-3.md)
  - [Part 4: Admin Config Pages/Modals, HTMX Search/Filters](../research/generation-pipeline-extended-4.md)
