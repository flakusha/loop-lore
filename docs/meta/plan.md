# Implementation Plan

**v0.1 MVP — Epics 1–19: foundation hardening.**

> **Task tracking moved to git issues.** Active epics and features are tracked as git-native-issues (e.g. `EPIC-2026-16`, `FEAT-2026-001`). See the [Issue Tracker](/meta/issues) for live state. The [backlog](/.plan/backlog) contains the full queue.

**Cross-reference:** Each issue ID (e.g. `EPIC-2026-14`) links to its entry in the Issue Tracker via VitePress deep-linking.

---

## Epics

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

| Task                                                                      | Files                                  |
| ------------------------------------------------------------------------- | -------------------------------------- |
| Generation module (providers, pipeline, cancellation, policy, repetition) | `src/generation/*.ts`                  |
| Story engine (turn manager, quest, game master, quality)                  | `src/story/*.ts`                       |
| Assistant (rule-based, prompt assembler)                                  | `src/assistant/*.ts`                   |
| Assets service (CRUD, upload, linking, metadata extraction)               | `src/assets/service.ts`, `metadata.ts` |
| Age gate (service + controller)                                           | `src/age-gate/*.ts`                    |
| Profanity filter (obscenity)                                              | `src/profanity/service.ts`             |
| Dice engine (parse, roll, text commands)                                  | `plugins/core/dice-roller/*.ts`        |

### 4. Frontend Shell — ✅ Complete

| Task                                                           | Files                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| Persistent sidebar (hamburger drawer)                          | `src/views/layout.html`                                     |
| Theme system (10 themes, CSS var switching, localStorage)      | `src/public/css/theme*.css`                                 |
| Component CSS (app.css, gallery.css)                           | `src/public/css/*.css`                                      |
| i18n infrastructure (en.json, `t()` function, settings toggle) | `src/frontend/alpine/i18n.ts`, `src/public/locales/en.json` |
| Alpine modules (split into modular files)                      | `src/frontend/alpine/*.ts`                                  |
| Browser crypto lib                                             | `src/frontend/browser.ts`                                   |
| Build pipeline (auto-build, comment strip, compression)        | `src/build/compress.ts`, `package.json`                     |
| 401 redirect helper (apiFetch across all calls)                | `src/frontend/alpine/htmx.ts`                               |

### 5. Chat Experience — ✅ Complete

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

**Remaining (P2):** Swipe variants, detail level display, WebP→PNG conversion.

### 6. Pages — ✅ Complete

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

| Task                                                     | Files                     |
| -------------------------------------------------------- | ------------------------- |
| Chat widget (message list, input, scroll, typing, error) | `src/tui/chat.ts`         |
| Asset view (browse linked assets, nav cycling)           | `src/tui/asset-view.ts`   |
| Screen manager (layout, global shortcuts, quit)          | `src/tui/app.ts`          |
| API wiring (`handleSend` fully wired with fetch)         | `src/tui/chat.ts:180-229` |

### 8. Security & Governance — ✅ Complete

| Task                                                     | Status |
| -------------------------------------------------------- | ------ |
| Auth middleware (token lookup, session)                  | ✅     |
| Rate limiting (10/min login, 3/hr register)              | ✅     |
| Age gate service (self-declaration, minimum age)         | ✅     |
| Age gate enforcement in chat creation (check birth_date) | ✅     |
| Profanity filter (obscenity, leetspeak, confusables)     | ✅     |
| 401 redirect in Web UI (apiFetch helper)                 | ✅     |

### 9. Testing & Release — ✅ Complete

| Task                                                              | Status                                             | Test file                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| `bun test` passes                                                 | ✅ 718 pass, 0 fail                                | —                                                                 |
| E2E web UI (auth, chats, messages, characters, assets)            | ✅ Complete                                        | `tests/e2e/flows/{auth,chats,messages,characters,assets}.test.ts` |
| E2E age gate (underage rejection, acceptance flow)                | ✅ Complete                                        | `tests/e2e/flows/age-gate.test.ts`                                |
| E2E profanity filter (message filtering)                          | ✅ Complete                                        | `tests/e2e/flows/profanity.test.ts`                               |
| E2E chat full (assets loading, regenerate/reroll, swipe variants) | ✅ Complete                                        | `tests/e2e/flows/chat-full.test.ts`                               |
| E2E browser smoke (page loads, views)                             | ⚠️ Flaky — `data-testid` mismatches, chrome timeout | `tests/e2e/flows/browser/{smoke,chat-flow}.test.ts`               |
| E2E browser auth (login form, htmx submit)                        | ⚠️ Flaky — `data-testid` mismatch                   | `tests/e2e/flows/browser/auth-flow.test.ts`                       |
| Crypto unit tests (pipeline, SMK, chat-keys, actor-keys, BYOK)    | ✅ 69 tests                                        | `src/crypto/{pipeline,smk,chat-keys,actor-keys,byok}.test.ts`     |
| Content compress unit tests                                       | ✅ 9 tests                                         | `src/content/compress.test.ts`                                    |
| Logger internals unit tests                                       | ✅ 65 tests                                        | `src/logger/{censors,formatters,levels,limits}.test.ts`           |
| Logger transports unit tests                                      | ✅ 9 tests                                         | `src/logger/transports/console.test.ts`                           |
| Date utils unit tests                                             | ✅ 15 tests                                        | `src/utils/date.test.ts`                                          |
| Provider types unit tests                                         | ✅ 9 tests                                         | `src/generation/providers/types.test.ts`                          |
| Step pipeline unit tests                                          | ✅ 9 tests                                         | `src/generation/step-pipeline.test.ts`                            |
| Assets metadata unit tests                                        | ✅ 13 tests                                        | `src/assets/metadata.test.ts`                                     |
| `bun run check`                                                   | ✅ Passes (typecheck, lint, format, md:lint)       |                                                                   |
| Getting-started guide                                             | ✅ `docs/guide/getting-started.md`                 |                                                                   |
| Tag v0.1.0                                                        | ❌                                                 |                                                                   |

---

## v0.1 — Foundation Completion

### 10. Generation Foundation — ✅ Complete

Tool-calling loop, provider resilience, streaming reconnect.

| Task                                    | Files                                                                 | Status |
| --------------------------------------- | --------------------------------------------------------------------- | ------ |
| LLM tool-call loop in generate-route.ts | `src/generation/generate-route.ts`                                    | ✅     |
| Tool definition injection into requests | `src/generation/generate-route.ts`                                    | ✅     |
| `tool_calls` response parsing           | `src/generation/providers/openai-compatible.ts`                       | ✅     |
| Tool execution + result loop            | `src/generation/generate-route.ts`                                    | ✅     |
| Provider failover (ordered fallback)    | `src/generation/providers/registry.ts`                                | ✅     |
| Circuit breaker pattern                 | `src/generation/providers/circuit-breaker.ts`                         | ✅     |
| SSE reconnect via `Last-Event-ID`       | `src/generation/generation-routes.ts`, `src/generation/controller.ts` | ✅     |

### 11. Admin & Settings Architecture — ⬜ Not Started [P1]

| Task                       | Files                                       |
| -------------------------- | ------------------------------------------- |
| Admin middleware gate      | `src/middleware/admin-gate.ts`              |
| Admin page routes          | `src/routes/admin.ts`                       |
| Admin settings tabs        | `src/views/admin/`                          |
| Admin runtime config table | `src/db/migrations/`, `src/admin/config.ts` |
| User preferences modal     | `src/components/modals/settings.html`       |
| Per-user settings API      | `src/routes/settings.ts`                    |
| Plugin management API      | `src/routes/plugins.ts`                     |

### 12. Memory Foundation — ✅ Complete

| Task                                             | Files                                              |
| ------------------------------------------------ | -------------------------------------------------- |
| Keyword filtering on `actor_memories`            | `src/assistant/prompt/sections/memories.ts`        |
| `memory_type` enum: episodic/semantic/procedural | `src/db/migrations/parts/005_actor_data.ts`        |
| `decay_rate` + `strength` + `last_accessed_at`   | `src/db/migrations/011_memory_decay.ts`            |
| Context compaction at 85% threshold              | `src/generation/context-compactor.ts`              |
| A/N depth injection (author's note section)      | `src/assistant/prompt/sections/author-note.ts`     |
| Memory XML delimiting                            | `src/assistant/prompt/sections/memories.ts`        |
| KV-cache optimization (dynamic context section)  | `src/assistant/prompt/sections/dynamic-context.ts` |

### 13. Frontend Responsive & UX — ✅ Complete

| Task                                             | Files                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| Mobile breakpoints (768px, 480px)                | `src/public/css/app.css`                                                  |
| Container queries on input bar                   | `src/public/css/app.css`                                                  |
| 100dvh + safe-area-inset                         | `src/views/layout.html`, `src/public/css/app.css`                         |
| 44px touch targets                               | `src/public/css/app.css`                                                  |
| Responsive sidebar                               | `src/public/css/app.css`                                                  |
| View toggle (grid/list)                          | `src/views/gallery.html`                                                  |
| Chat pin/favorite                                | `src/routes/chats.ts`, `src/db/`                                          |
| Chat list search + status filter                 | `src/views/chat-list-panel.html`                                          |
| Client-side search (gallery, characters, worlds) | `src/frontend/pages/*.ts`                                                 |
| Swipe gesture for sidebar                        | `src/frontend/alpine/sidebar.ts`                                          |
| HTMX active search on gallery                    | `src/views/gallery.html`, `src/routes/views.ts`                           |
| HTMX active search on characters                 | `src/views/characters.html`, `src/routes/views.ts`                        |
| HTMX active search on worlds                     | `src/views/worlds.html`, `src/routes/views.ts`                            |
| Filter bar component                             | `src/components/filter-bar.html`                                          |
| Active filter chips                              | `src/components/filter-chips.html`                                        |
| Keyboard shortcuts                               | `src/frontend/alpine/shortcuts.ts`                                        |
| Load More pagination                             | `src/components/load-more.html`                                           |
| Empty states component                           | `src/components/empty-state.html`                                         |
| Loading indicators wiring                        | `src/views/{gallery,characters,worlds}.html`                              |
| Bulk chat actions                                | `src/views/chat-list-panel.html`                                          |
| Message archiving (cascade, restore, purge)      | `src/routes/messages.ts`, `src/db/`                                       |
| Unit tests                                       | `src/routes/views-search.test.ts`, `src/routes/message-archiving.test.ts` |

### 14. Import/Export & Data Portability — ⬜ Not Started [P1-High]

| Task                              | Files                      |
| --------------------------------- | -------------------------- |
| File upload character import      | `src/routes/characters.ts` |
| PNG steganography card extraction | `src/routes/characters.ts` |
| YAML/TOML character import        | `src/routes/characters.ts` |
| Chat export (JSON)                | `src/routes/chats.ts`      |
| Chat export (Markdown)            | `src/routes/chats.ts`      |
| Bulk data export                  | `src/routes/settings.ts`   |
| Asset download endpoint           | `src/assets/controller.ts` |

### 15. i18n & Accessibility — ⬜ Not Started [P2]

| Task                                | Files                                    |
| ----------------------------------- | ---------------------------------------- |
| Server-side i18n module             | `src/i18n/index.ts`, `src/i18n/types.ts` |
| i18n middleware                     | `src/middleware/i18n.ts`                 |
| Translate all server error messages | `src/routes/*.ts`, `src/i18n/`           |
| Locale files (10 languages)         | `src/public/locales/*.json`              |
| ARIA landmark roles                 | `src/views/*.html`                       |
| ARIA labels on interactive elements | `src/views/*.html`                       |
| Focus management                    | `src/frontend/alpine/focus.ts`           |
| Skip-to-content link                | `src/views/layout.html`                  |
| Keyboard navigation                 | `src/frontend/alpine/shortcuts.ts`       |
| Focus-visible styling               | `src/public/css/app.css`                 |

### 16. Observability & CI — 🟡 In Progress

| Task                        | Files                                              |
| --------------------------- | -------------------------------------------------- |
| Telemetry config loading    | `src/telemetry/config.ts`                          |
| Telemetry service           | `src/telemetry/service.ts`                         |
| Telemetry events table      | `src/db/migrations/`, `src/db/schema-telemetry.ts` |
| Telemetry route             | `src/routes/telemetry.ts`                          |
| Frontend telemetry tracking | `src/frontend/alpine/telemetry.ts`                 |
| Admin analytics API         | `src/routes/telemetry.ts`                          |
| Retention cleanup           | `src/telemetry/cleanup.ts`                         |
| CI config (GitHub Actions)  | `.github/workflows/ci.yml`                         |
| Playwright responsive tests | `tests/e2e/responsive/`                            |
| Browser E2E stabilization   | `tests/e2e/flows/browser/`                         |

### 17. Encryption Foundation — ⬜ Not Started [P1]

| Task                                     | Files                     |
| ---------------------------------------- | ------------------------- |
| Public tier (Phase 0)                    | `src/routes/messages.ts`  |
| Server-side at-rest encryption (Phase 1) | `src/crypto/at-rest.ts`   |
| Per-user keys via Argon2id (Phase 2)     | `src/crypto/user-keys.ts` |
| Chat-level key derivation (Phase 3)      | `src/crypto/chat-keys.ts` |
| Browser-side key derivation              | `src/frontend/browser.ts` |
| Private tier (Phase 4) — E2E             | `src/crypto/e2e/`         |
| Key rotation on user leave               | `src/crypto/chat-keys.ts` |
| Immutability enforcement                 | `src/routes/chats.ts`     |
| WebP→PNG conversion                      | `src/assets/metadata.ts`  |

See `docs/frontend/encryption.md` for full tier specification.

### 20. E2E Performance Benchmarks — ⬜ Not Started [P2]

| Task                            | Files                        |
| ------------------------------- | ---------------------------- |
| Benchmark runner                | `scripts/bench-run.ts`       |
| Diff script                     | `scripts/bench-diff.ts`      |
| Trend script                    | `scripts/bench-trend.ts`     |
| CI integration (GitHub Actions) | `.github/workflows/ci.yml`   |
| Threshold config                | `benchmarks/thresholds.json` |

See `docs/spec/e2e-benchmarks.md` for full spec.

### 18. Local Inference Integrations — ✅ Complete

| Task                                      | Files                                           |
| ----------------------------------------- | ----------------------------------------------- |
| URL validation (SSRF guard, allowlist)    | `src/utils/url-validation.ts`                   |
| sd.cpp native API provider (`/sdcpp/v1/`) | `src/generation/image-gen-route.ts`             |
| ComfyUI provider (submit/poll/WS)         | `src/generation/providers/comfyui.ts`           |
| Gallery metadata enrichment               | `src/generation/image-gen-route.ts`             |
| Security wiring into providers            | `src/generation/providers/openai-compatible.ts` |
| Chat-driven multi-step pipeline           | `src/generation/step-pipeline.ts`               |

Full spec: `docs/spec/integrations/llm-serving.md`, `docs/spec/integrations/image-generation.md`, `docs/spec/provider-system.md`.

### 19. Basic Chat Notifications — ✅ Complete

| Task                             | Files                                                     |
| -------------------------------- | --------------------------------------------------------- |
| Cross-chat activity signal (SSE) | `src/routes/activity.ts`, `src/routes/activity-stream.ts` |
| Read-state schema                | `src/db/migrations/parts/004_chats_actors.ts`             |
| Chat-list unread badge           | `src/components/chat/chat-list-panel.html`                |
| Toast on foreign-chat message    | `src/frontend/alpine/chat-activity.ts`                    |
| Mark-read on chat open           | `src/routes/chats.ts`, `src/frontend/alpine/chat.ts`      |
| Activity SSE listener            | `src/frontend/alpine/chat-activity.ts`                    |

### 21. Notification Expansion — ⬜ Not Started [P2]

| Task                             | Files                                         |
| -------------------------------- | --------------------------------------------- |
| Notification noise level presets | `src/notifications/config.ts`                 |
| Fine-tune per-event thresholds   | `src/routes/settings.ts`                      |
| Model comparison reactions table | `src/db/migrations/`, `src/db/schema-core.ts` |
| Comparison API endpoints         | `src/routes/reactions.ts`                     |
| Notification service             | `src/notifications/service.ts`                |
| SSE endpoint for real-time       | `src/routes/notifications-stream.ts`          |

### 22. RPG Mechanics Core — ⬜ Not Started [P2]

| Task                            | Files                                 |
| ------------------------------- | ------------------------------------- |
| Dice engine (parse/roll)        | `src/rpg/dice.ts`                     |
| Stat system                     | `src/rpg/stats.ts`                    |
| Combat intent extraction        | `src/rpg/combat.ts`                   |
| Command parser                  | `src/assistant/command-parser.ts`     |
| /dice, /stats, /attack commands | `src/assistant/commands/*.ts`         |
| World rules for command control | `src/db/schema-core.ts` (world_rules) |

### 23. Assistant Commands — ⬜ Not Started [P1-High]

| Task                       | Files                                      |
| -------------------------- | ------------------------------------------ |
| /improve text command      | `src/assistant/commands/improve.ts`        |
| /image generation command  | `src/assistant/commands/image.ts`          |
| /quest management commands | `src/assistant/commands/quest.ts`          |
| Command autocomplete UI    | `src/components/command-autocomplete.html` |
| Intent detection           | `src/assistant/intent-detection.ts`        |

### 24. Filtering & Pagination — ⬜ Not Started [P1-High]

| Task                         | Files                              |
| ---------------------------- | ---------------------------------- |
| Combined filter support      | `src/routes/views.ts`              |
| Filter chips component       | `src/components/filter-chips.html` |
| Exact-match priority sorting | `src/search/sorter.ts`             |
| Cursor-based pagination      | `src/db/pagination.ts`             |

### 25. Memory Systems — ⬜ Not Started [P2]

| Task                                  | Files                              |
| ------------------------------------- | ---------------------------------- |
| Three-tier memory system              | `src/memory/backend.ts`            |
| Memory backend abstraction            | `src/memory/backend.ts`            |
| Semantic memory extraction            | `src/memory/extraction.ts`         |
| Procedural memory pattern learning    | `src/memory/learning.ts`           |
| Memory search optimization            | `src/memory/search.ts`             |
| Memory relationship ranking           | `src/memory/ranking.ts`            |
| Memory auto-rewording                 | `src/memory/rewording.ts`          |
| Memory context injection              | `src/memory/context.ts`            |
| Memory visualization (graph/timeline)   | `src/memory/visualization.ts`      |
| Memory selection UI                   | `src/components/chat/memory-panel.html` |

See `.plan/features/epic-2026-25-memory-systems.md` for full spec.

### 26. Avatar & Expression System — ⬜ Not Started [P2]

| Task                              | Files                                 |
| --------------------------------- | ------------------------------------- |
| Three.js dependency               | `package.json`                        |
| Avatar scene manager              | `src/frontend/3d/avatar-scene.ts`     |
| VRM loader                        | `src/frontend/3d/vrm-loader.ts`       |
| Expression controller             | `src/frontend/3d/expression-controller.ts` |
| Emotion detection from text       | `src/characters/emotion-detection.ts` |
| Avatar preview in editor          | `src/views/character-editor.html`     |
| Model upload endpoint             | `src/routes/characters.ts`            |

See `.plan/features/epic-2026-26-avatar-expression.md` for full spec.

### 27. Testing Infrastructure — ⬜ Not Started [P1]

| Task                              | Files                              |
| --------------------------------- | ---------------------------------- |
| E2E parallel suite fix            | `tests/e2e/helpers/server.ts`        |
| E2E cascade failure fix           | `tests/e2e/flows/browser/`         |
| Cancel-during-generation test     | `tests/e2e/flows/generation.test.ts` |
| Generation idempotency test       | `tests/e2e/flows/generation.test.ts` |
| Browser auth flow tests           | `tests/e2e/flows/browser/auth-flow.browser.ts` |
| Browser chat flow tests           | `tests/e2e/flows/browser/chat-flow.browser.ts` |
| Low-coverage route tests          | `src/routes/*.test.ts`             |
| Story module tests                | `src/story/*.test.ts`              |
| E2E performance benchmarks        | `scripts/bench-*.ts`               |

See `.plan/features/epic-2026-27-testing-infrastructure.md` for full spec.

### 28. Asset Support Expansion — ⬜ Not Started [P2]

| Task                              | Files                              |
| --------------------------------- | ---------------------------------- |
| RPG token and map assets          | `src/assets/token-overlay.ts`      |
| 3D model support                | `src/assets/model-validator.ts`    |
| Asset versioning system           | `src/db/migrations/019_asset_versions.sql` |
| Asset templates and presets       | `src/assets/templates.ts`          |

See `.plan/features/epic-2026-28-asset-expansion.md` for full spec.

---

## Known Issues

### Resolved (2026-07-15)

- **Boolean integer flags → typed state enums:** 5 columns converted to string enums with state machines. Migration 010 handles data transform.

### Resolved (2026-07-10)

- **TS strict-typing debt:** `Database`→`Db` alias rename; `bun run typecheck` clean.

### Browser E2E Instability

- **Solo/Seed User ID Mismatch** — seed solo user with `UserRole.Solo` or login as seeded user.
- **Parallel Suite Instability** — 7 browser E2E test files sharing `cachedSoloUser` singleton corrupt state. Fix: per-request singleton or shared fixture.
- **Cascade Failure Pattern** — single test timeout kills all subsequent tests via shared `ctx.page`.

### Schema Hardening — Resolved (2026-07-16)

All 8 tasks completed (see `docs/spec/schema.md`): `LoreEntryStatus` enum, `KeyStatus` + state machine, naming alignment, `public_key` DDL column.

### Remaining Review Findings (Round 3, 2026-07-06)

See `reviews/review-rounds.md` for full detail. Key open items:

| #  | File                            | Issue                                   |
| -- | ------------------------------- | --------------------------------------- |
| 15 | `src/db/migrations/001_init.ts` | `chat_participants` PK undocumented     |
| 25 | `src/tui/chat.ts`               | No retry, no idempotency key            |
| 26 | `src/tui/asset-view.ts`         | Left/right keys conflict with input nav |

---

## Cross-Reference

- Active development & bugs: `plan.md`, git issue tracker
- Future / deferred: `.plan/backlog.md`
- Long-term vision: `roadmap.md`
- DB: `schema.md`
- Frontend UX: `frontend/overview.md`, `frontend/chat/`
- TUI: `tui.md`
- Assets: `assets.md`
- Build: `package.json` scripts
- **Epic Features**: `.plan/features/` — Detailed epic plans with linked tasks
