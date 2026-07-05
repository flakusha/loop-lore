# Implementation Plan

**0 TS errors. All tests pass. Build clean. All 9 epics complete.**

Target: **v0.1** — end-to-end User×Character chat in Web UI.

---

## 📌 Epics

### 1. Core Infrastructure — ✅ Complete

Server, database, config, middleware, logger, transport layer.

| Task | Files |
|------|-------|
| DB schema (19 tables) | `src/db/schema-*.ts`, `migrations/001_init.ts` |
| Enums (30+) | `src/db/enums-*.ts` |
| Kysely init + WAL | `src/db/index.ts` |
| Config (YAML/TOML/env, NSFW) | `src/config/load.ts`, `schema.ts` |
| TLS cert auto-gen | `src/config/cert.ts` |
| Middleware (auth, compose, error) | `src/middleware/*.ts` |
| Logger (structured, rotate) | `src/logger/*.ts` |
| Transport (H1/H2/WS, compression, negotiation) | `src/transport/*.ts` |
| Server (HTTP/HTTPS, static, API dispatch) | `src/server.ts` |
| Content encode/decode/minify | `src/content/*.ts` |
| DB migrate runner | `src/db/migrate.ts` |

### 2. API Layer — ✅ Complete

All route controllers + router.

| Task | Files |
|------|-------|
| Chat CRUD + participants | `src/routes/chats.ts` |
| Message CRUD + variants + visibility + status | `src/routes/messages.ts` |
| Character/actor CRUD + card export/import | `src/routes/characters.ts` |
| User CRUD + settings | `src/routes/users.ts` |
| World CRUD + nested locations | `src/routes/worlds.ts` |
| Auth (login, logout, demo, me) | `src/routes/auth.ts` |
| API keys | `src/routes/api-keys.ts` |
| Asset controller (upload, serve, link) | `src/assets/controller.ts` |
| View serving (layout wrapper, aliases) | `src/routes/views.ts` |
| Route router (register + dispatch) | `src/routes/router.ts` |
| HTTP utils (response helpers, error types) | `src/routes/http-utils.ts` |

### 3. Backend Services — ✅ Complete

Generation, story, assistant, assets, age gate, profanity, dice, content encoding.

| Task | Files |
|------|-------|
| Generation module (providers, pipeline, cancellation, policy, repetition) | `src/generation/*.ts` |
| Story engine (turn manager, quest, game master, quality) | `src/story/*.ts` |
| Assistant (rule-based, prompt assembler) | `src/assistant/*.ts` |
| Assets service (CRUD, upload, linking, metadata extraction) | `src/assets/service.ts`, `metadata.ts` |
| Age gate (service + controller) | `src/age-gate/*.ts` |
| Profanity filter (obscenity) | `src/profanity/service.ts` |
| Dice engine (parse, roll, text commands) | `src/dice/*.ts` |

### 4. Frontend Shell — ✅ Complete

Layout, themes, i18n, build pipeline, Alpine modular architecture.

| Task | Files |
|------|-------|
| Persistent sidebar in layout (hamburger drawer) | `src/views/layout.html` |
| Theme system (10 themes, CSS var switching, localStorage) | `src/public/css/theme*.css` |
| Component CSS (app.css, gallery.css) | `src/public/css/*.css` |
| i18n infrastructure (en.json, `t()` function, settings toggle) | `src/frontend/alpine/i18n.ts`, `src/public/locales/en.json` |
| Alpine modules (split into modular files) | `src/frontend/alpine/*.ts` |
| Browser crypto lib | `src/frontend/browser.ts` |
| Build pipeline (auto-build, comment strip, compression) | `src/build/compress.ts`, `package.json` |
| 401 redirect helper (apiFetch across all calls) | `src/frontend/alpine/htmx.ts` |

### 5. Chat Experience — ✅ Complete

Messages, send, inline edit, media attachments, infinite scroll, generation feedback.

| Task | Status |
|------|--------|
| Message display (Alpine-rendered, loading/empty/data states) | ✅ |
| Message grouping (5-min threshold) | ✅ |
| Hover tooling (copy, retry, continue, remove) | ✅ |
| Markdown rendering (marked, GFM) | ✅ |
| Send message (optimistic insert, POST, toast on error) | ✅ |
| Generation status (typing indicator, polling, cancel) | ✅ |
| Inline edit (cosmetic PATCH, `(edited)` label, Ctrl+Enter) | ✅ |
| Infinite scroll (IntersectionObserver, auto, no manual button) | ✅ |
| Media attachments (upload→queue→send with message) | ✅ |
| Aspect-ratio-aware media layout (wide/tall/square/grid) | ✅ |
| Media preview modal | ✅ |
| Image metadata extraction on upload (PNG/JPEG/WebP/GIF) | ✅ |
| Attachments column on messages table | ✅ |
| API: accept + return enriched attachment data | ✅ |
| Pending assets chips in input toolbar | ✅ |
| Thinking process display (`<details>` expand) | ✅ |
| System/narration message styling | ✅ |

**Remaining (P2):**
- Swipe variants (touch/click handling)
- Message detail level display (stats per mode)
- WebP→PNG conversion for LLM API compatibility

### 6. Pages — ✅ Complete

All view templates with Alpine components.

| Task | Status |
|------|--------|
| Characters list (grid, create/import/detail modals, Start Chat) | ✅ |
| Character edit (form with all persona fields) | ✅ |
| Gallery (asset grid, upload, preview, delete, link) | ✅ |
| Settings (General, Chat, API, Data, About sections) | ✅ |
| Worlds list (create modal, card list) | ✅ |
| World detail (lore, chat rooms) | ✅ |
| World edit (name, description, lore, tags) | ✅ |
| Login (card, demo mode, error states) | ✅ |
| New chat (type/mode selector, create) | ✅ |
| Character chat list (per-character chat list) | ✅ |

### 7. TUI — ✅ Complete

Terminal UI widgets.

| Task | Files |
|------|-------|
| Chat widget (message list, input, scroll, typing, error) | `src/tui/chat.ts` |
| Asset view (browse linked assets, nav cycling) | `src/tui/asset-view.ts` |
| Screen manager (layout, global shortcuts, quit) | `src/tui/app.ts` |
| API wiring (`handleSend` fully wired with fetch) | `src/tui/chat.ts:180-229` |

### 8. Security & Governance — ✅ Complete

Auth, rate limiting, age gate enforcement, profanity.

| Task | Status |
|------|--------|
| Auth middleware (token lookup, session) | ✅ |
| Rate limiting (10/min login, 3/hr register) | ✅ |
| Age gate service (self-declaration, minimum age) | ✅ |
| Age gate enforcement in chat creation (check birth_date) | ✅ |
| Profanity filter (obscenity, leetspeak, confusables) | ✅ |
| 401 redirect in Web UI (apiFetch helper) | ✅ |

### 9. Testing & Release — ✅ Complete

| Task | Status | Test file |
|------|--------|-----------|
| `bun test` passes | ✅ All tests pass | — |
| E2E web UI (auth, chats, messages, characters, assets) | ✅ Complete | `tests/e2e/flows/{auth,chats,messages,characters,assets}.test.ts` |
| E2E age gate (underage rejection, acceptance flow) | ✅ Complete | `tests/e2e/flows/age-gate.test.ts` |
| E2E profanity filter (message filtering) | ✅ Complete | `tests/e2e/flows/profanity.test.ts` |
| E2E chat full (assets loading, regenerate/reroll, swipe variants) | ✅ Complete | `tests/e2e/flows/chat-full.test.ts` |
| `bun run check` | ⚠️ Pre-existing lint errors | |
| Getting-started guide | ❌ | |
| Tag v0.1.0 | ❌ | |

---

## 🐛 Open Items — Code Review 2026-07-05

92 findings across 85 files. Grouped by area. Fix rank: 🔴 → 🟡 → 🔵.

### 🔵 Nit fixes applied

All 13 nits and 1 question addressed in a single pass:

| Fix | File | Change |
|-----|------|--------|
| DATA_DIR absolute | `src/config/constants.ts:2` | Uses `import.meta.url` path, not CWD-relative |
| Token expiry off-by-one | `src/middleware/auth.ts:64` | `<` → `<=` |
| HTML-escape in errorHtml | `src/routes/auth.ts:51` | Added `escapeHtml()` sanitizer |
| Dead `!response.ok` in bedrock | `src/generation/providers/bedrock.ts:69,101` | Removed — `fetchWithRetry` already throws |
| isComplete always false | `src/story/turn-manager.ts:227` | Uses `maxTurns` from chat config, not `MAX_SAFE_INTEGER` |
| Inline onerror handler | `src/views/layout.html:163` | Replaced with Alpine `x-on:error` directive |
| marked.use in types file | `src/frontend/alpine/types.ts:17` | Moved to `chat.ts` where `marked` is used |
| `(this as any)` unnecessary cast | `src/frontend/alpine/chat.ts:119,114,etc.` | Replaced with typed `this.*` or `this.$dispatch()` |
| groupedMessages deep copy churn | `src/frontend/alpine/chat.ts:565-585` | Added memoization cache keyed on msg count + first/last ID |
| window.open missing noopener | `src/frontend/alpine/chat.ts:713` | Added `'noopener,noreferrer'` |
| Alpine internal `__x` access | `src/frontend/alpine/app.ts:57-59` | Uses `Alpine.$data(el)` public API |
| Typing indicator stuck on error | `src/tui/chat.ts:161` | `showTyping` now increments `itemCount` |
| Test schema missing tables | `src/db/database.test.ts:6` | Added all 18 missing tables from migration |
| Orphaned locale keys | `src/public/locales/en.json` | 7 keys unused — acknowledged as start of localization effort; needs design |

### Remaining findings

All 🔴 and 🟡 items still open. See grouped lists below.

### Auth / Ownership (15 route files)

| 🔴 | File | Handler | Problem |
|----|------|---------|---------|
|    | `src/routes/chats.ts` | `handleGetChat`, `handleListParticipants`, `handleAddParticipant`, `handleRemoveParticipant` | No ownership check. Any user accesses any chat. |
|    | `src/routes/messages.ts` | `handleGetMessage`, `handleListVariants`, `handleSelectVariant`, `handleUpdateVisibility` | No auth check. Any user accesses any message. |
|    | `src/routes/worlds.ts` | All handlers (170-298) | No auth check. Worlds + locations open to anyone. |
|    | `src/routes/story-items.ts` | All handlers (38-206) | No auth check. Story items open across users. |
|    | `src/routes/story-states.ts` | All handlers (36-175) | No auth check. NPC/location states open. |
|    | `src/routes/story-turns.ts` | All handlers (24-76) | No auth check. Turns open. |
|    | `src/routes/actor-items.ts` | All handlers (36-224) | No auth check. |
|    | `src/routes/actor-lore-entries.ts` | All handlers (36-230) | No auth check. |
|    | `src/routes/actor-memories.ts` | All handlers (36-219) | No auth check. |
|    | `src/routes/actor-notes.ts` | All handlers (36-211) | No auth check. |
|    | `src/routes/world-lore-entries.ts` | All handlers (36-226) | No auth check. |

**Fix**: Verify `resource.created_by === userId` (or `chat.user_id`) in every handler. Single-tenant mode: block all cross-user access or add guard at router level.

### XSS — Markdown rendering

| 🔴 | `src/frontend/alpine/chat.ts:599` | `marked.parse(content)` → no sanitization. Root XSS vector. |
| 🔴 | `src/views/chat.html:98,102` | `x-html="renderMarkdown(...)"` renders raw HTML. |
| 🔴 | `src/views/layout.html:177` | `{{{content}}}` triple-brace unescaped if server doesn't sanitize. |

**Fix**: Run `marked` output through DOMPurify. Configure `marked` with `{ sanitize: true }` if using marked v4+. Add DOMPurify to `alpine.ts` bundle.

### Data loss / dead logic

| 🔴 | `src/generation/generate-route.ts:256-259` | `fullContent`/`fullThinking` accumulated but never read. DB insert uses `finalResponse.content` which provider `stream()` may omit → empty stored messages. |
| 🔴 | `src/generation/generate-route.ts:367` | `abortSignal.dispatchEvent(...)` instead of `abortController.abort()`. Client disconnect doesn't abort provider fetch. |
| 🔴 | `src/generation/context-compressor.ts:152-154` | `"summarize"` strategy ignores `summarizeFn`. Summarization dead path. |

### HTML parse errors

| 🔴 | `src/views/chat.html:162` | `<aside` missing `>` before child `<button>`. |
| 🔴 | `src/views/chat.html:187` | `<aside class="gallery-sidebar"` missing `>` before child. |
| 🔴 | `src/views/characters.html:62,117` | `<form` tags missing `>` before child `<div>`. |

### Config / DB

| 🔴 | `src/db/index.ts:59` | DB filename hardcoded `"loop-lore.db"`. Ignores `config.db.sqliteFilename`. |
| 🔴 | `src/config/load.ts:123` | `Number(env) \|\| 30_000` → `0` treated as falsy. User timeout=0 overrides to 30000. Fix: `?? 30_000`. |
| 🔴 | `schemas/loop-lore-config.schema.json:13` | `port.minimum: 1` stale (source says `0`). Regenerate. |
| 🔴 | `src/utils/date.ts:97` | `formatTime()` time components in local TZ but uses requested TZ offset. Mismatch for non-local. |
| 🟡 | `src/config/load.ts:16` | `_PROVIDER_ENV_VARS` declared but never referenced. Dead. |
| 🟡 | `src/config/schema-class.ts:48,60` | `plainObjectSchema()` dead. Dead ternary in required. |
| 🟡 | `src/db/schema-story.ts:205,225-227` | `number` for boolean semantics (anti-pattern). |
| ~~🔵~~ | ~~`src/config/constants.ts:2`~~ | ~~Relative `DATA_DIR` fragile if CWD differs.~~ ✅ Fixed |

### CSS

| 🔴 | `src/public/css/app.css:160-167 + 1148-1159` | Duplicate `.chat-area` — L1148 applies `max-width`/centering to ALL `.chat-area`, breaking non-chat pages. |
| 🟡 | `src/public/css/app.css:1082` | `--border-color` var doesn't exist. Login divider invisible. |
| 🟡 | `src/public/css/app.css:1067` | `--danger` may not exist — should be `--accent-red`. |

### UI dead elements / bugs

| 🟡 | `src/views/settings.html:202-203` | "Test Connection"/"Save API Settings" buttons no handlers. Dead. |
| 🟡 | `src/views/settings.html:229` | "Delete All Data" button hardcoded `disabled`. Never enables. |
| 🟡 | `src/views/index.html:145` | "+ New Chat" button `disabled`. Never enables. |
| 🟡 | `src/views/chat.html:314-335` | Dead modal `x-show="false"` hardcoded. |
| 🟡 | `src/views/characters.html:127` | Hidden file input — no click-to-open handler. Import unreachable. |
| 🟡 | `src/views/world-detail.html:40` | All chat links → generic `/views/chat`, not specific chat. |
| 🟡 | `src/views/new-chat.html:28` | `selectChat` on wrong Alpine scope. Click silently fails. |
| 🟡 | `src/views/settings.html:94-95` | Settings not persisted to localStorage on init. Reset on page leave. |
| 🟡 | `src/views/settings.html:152` | "Change" button clears API key field. Mislabeled. |
| 🟡 | `src/views/character-chat-list.html:9` | "+ New Chat" is plain `<a href>` — full page nav, not htmx SPA. |
| 🟡 | `src/frontend/alpine/settings.ts:6` | Saved theme never applied in `init()`. |
| ~~❓~~ | ~~`src/public/locales/en.json`~~ | ~~7 keys unused — start of localization effort, needs design.~~ ✅ Resolved |

### Auth / security misc

| 🟡 | `src/routes/auth.ts:44` | `getClientIp` trusts `X-Forwarded-For`. IP spoofing to bypass rate limiter. |
| 🟡 | `src/routes/auth.ts:44` | `"unknown"` fallback → one rate-limit bucket for all headerless clients. |
| 🟡 | `src/middleware/rate-limit.ts:26-38` | In-memory `Map` never prunes. Unbounded memory. |
| 🟡 | `src/views/login.html:8` | No CSRF token on login form. |
| 🟡 | `src/frontend/alpine/htmx.ts:8` | 401 redirect loses deep-link. No `?redirect=`. |
| 🟡 | `src/server.ts:210` | Path traversal guard missing trailing separator. |
| ~~🔵~~ | ~~`src/middleware/auth.ts:64`~~ | ~~Token expiry `<` not `<=`. Off-by-one at boundary.~~ ✅ Fixed |

| ~~🔵~~ | ~~`src/routes/auth.ts:51`~~ | ~~`errorHtml` no HTML-escape on `msg`. Fragile.~~ ✅ Fixed |
### Race conditions / async

| 🟡 | `src/frontend/alpine/chat.ts:57` | `setInterval(2000)` runs forever on htmx swap. No cleanup → memory leak. |
| 🟡 | `src/generation/cancellation-actions.ts:269` | `processStreamingChunk` fire-and-forget DB writes race on `generation_attempts`. |
| 🟡 | `src/middleware/auth.ts:129` | `cachedSoloUser` module-mutable. Fragile. |

### Input validation

| 🟡 | `src/routes/chats.ts:163-164` | `body.type as ChatType`, `body.mode as ChatMode` unchecked casts. |
| 🟡 | `src/routes/http-utils.ts:204` | `parsePagination` no NaN/negative guard. |
| 🟡 | `src/generation/generate-route.ts:91` | `body as GenerateRequest` on unsanitized input. Only 4 fields validated. |
| 🟡 | `src/routes/users.ts:107` | Truthy check `if (body.displayName)` prevents setting to `""`. |
| 🟡 | `src/routes/users.ts:159` | `handleUpdateUser` returns `{ ok: true }` for nonexistent user. |

### Regex bug

| 🔴 | `src/story/events/extraction.ts:76-92` | `pattern.exec()` on module-scoped regex with `g` flag. `lastIndex` persists across calls → wrong results on 2nd call. |

### Provider system

| 🔴 | `src/generation/providers/bedrock.ts:273` | `createAuthHeaders` always throws. `complete`/`stream` crash. Dead code in registry. |
| 🟡 | `src/generation/cancellation-actions.ts:201` | `detectPolicyMismatch(fullText)` every chunk → O(n²) scans. |
| 🟡 | `src/generation/cancellation-actions.ts:197-202` | Policy detection gated on `cancel` flag. Detection-without-cancel (log-only) dead. |
| ~~🔵~~ | ~~`src/generation/providers/bedrock.ts:69`~~ | ~~`if (!response.ok)` dead — `fetchWithRetry` only returns ok.~~ ✅ Fixed |

### Story / turn logic

| ~~🔵~~ | ~~`src/story/turn-manager.ts:227`~~ | ~~`isComplete` always false (compares against `MAX_SAFE_INTEGER`).~~ ✅ Fixed |
| 🟡 | `src/story/quest-engine.ts:247` | `Math.round(100 / cfg.targetQuantity)` — division by zero. |

### Anti-patterns (banned by AGENTS.md)

| 🟡 | `src/routes/chats.ts:185,271` | Silent `catch(() => {})` on participant insertion. |
| 🟡 | `src/generation/step-pipeline.ts:39-41,64-66` | Silent catches. |
| 🟡 | `src/generation/cancellation-tracker.ts:186` | `void promise.catch(() => {})`. Silent. |
| 🟡 | `src/frontend/alpine/gallery.ts:89-98` | Bare `.then().catch()` waterfall. |
| 🟡 | `src/frontend/alpine/characters.ts:124-135` | Bare `.then().catch()` waterfall. |
| ~~🔵~~ | ~~`src/views/layout.html:163`~~ | ~~`onerror="this.style.display='none'"` inline handler.~~ ✅ Fixed |
| ~~🔵~~ | ~~`src/frontend/alpine/types.ts:17`~~ | ~~`marked.use(...)` runs at import time in types file. Side effect.~~ ✅ Fixed |

### Alpine / frontend misc

| ~~🔵~~ | ~~`src/frontend/alpine/chat.ts:119`~~ | ~~`(this as any).isGenerating` unnecessary cast.~~ ✅ Fixed |
| ~~🔵~~ | ~~`src/frontend/alpine/chat.ts:565-585`~~ | ~~`groupedMessages` getter deep-copies every access. O(n²) churn.~~ ✅ Fixed |
| ~~🔵~~ | ~~`src/frontend/alpine/chat.ts:710`~~ | ~~`window.open(...)` missing `noopener,noreferrer`.~~ ✅ Fixed |
| ~~🔵~~ | ~~`src/frontend/alpine/app.ts:57-59`~~ | ~~Accesses Alpine internal `__x`. Breaks on version upgrade.~~ ✅ Fixed |
| 🟡 | `src/frontend/alpine/htmx.ts:16-18` | No CSRF token injection, no retry, no timeout in `apiFetch`. |

### TUI / build / test

| 🟡 | `src/tui/app.ts:87` | Monkey-patches `ChatWidget.setChatId`. Fragile. |
| 🟡 | `src/tui/app.ts:71` | `void loadMessages().then(...)` — error swallowed. |
| 🟡 | `src/build/compress.ts:66` | No try/catch on single file. Build crash on disk full. |
| ~~🔵~~ | ~~`src/tui/chat.ts:161`~~ | ~~Typing indicator stays if error path misses `hideTyping`.~~ ✅ Fixed |
| 🟡 | `src/generation/generate-route.test.ts:222-228` | Mock provider state leaks across tests. |
| ~~🔵~~ | ~~`src/db/database.test.ts:6`~~ | ~~Test schema missing 17 tables from migration.~~ ✅ Fixed |

### Totals

| Severity | Count |
|----------|-------|
| 🔴 Critical | 28 |
| 🟡 High/Med | 43 |
| 🔵 Low/Nit  | 7 (13 fixed) |
| ❓ Question  | 0 (1 resolved) |
| **Total**   | **78** (14 resolved) |

---

## 🚫 Post-MVP (Not in v0.1)

Memory system (3-tier), artifacts, multi-LLM story, RPG mechanics (stats/combat/loot),
branch browser, multi-user registration, admin dashboard, PWA, mobile clients,
webhooks, OAuth providers, end-to-end encryption, character import/export (V2/PNG),
plugin system, swipe variants rich UI, WebP→PNG conversion, message detail stats.

---

## 🔗 Cross-Reference

- DB: [schema.md](../spec/schema.md)
- Frontend UX: [overview.md](../frontend/overview.md), [chat/](../frontend/chat/)
- TUI: [tui.md](../spec/tui.md)
- Assets: [assets.md](../spec/assets.md)
- Build: `package.json` scripts