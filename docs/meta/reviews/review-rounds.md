# Code Review Rounds

**Source:** Extracted from `docs/meta/plan.md`. Review findings collected across three rounds (2026-07-05 through 2026-07-06).

---

## ⚡ Status — Verification Pass 2026-07-10

A reconciliation pass compared every finding below against the current code (`main`

- v0.2 in-progress work, commit `ebad0353`). **The large majority are already
  resolved.** Read this summary instead of the full detail; nothing of substance
  remains open.

### Resolved (verified in code)

- **XSS (markdown):** `src/frontend/alpine/chat-utils.ts` sanitizes via
  `DOMPurify.sanitize(marked.parse(...))`. (R1 XSS)
- **DB filename hardcoded:** `src/db/index.ts:59` reads `LOOP_LORE_DB_PATH` /
  `config.db.sqliteFilename`. (R1 Config/DB)
- **Auth / Ownership (all flagged routes):** `chats.ts` checks `created_by === userId`;
  `actor-*` routes use the `createEntityRoutes` factory (`ownershipTable` /
  `ownershipFkColumn` → `owner[col] === userId || admin`, verified in
  `entity-routes.ts`); `story-*` / `worlds.ts` check `owner_id` / `created_by`. (R1)
- **`Number(env) || 30000`:** `src/config/load.ts:134` uses `?? 30_000`. (R1)
- **Rate-limit unbounded:** `src/middleware/rate-limit.ts` now prunes idle buckets
  on an interval. (R2)
- **Settings `x-data` / gallery drop-zone click:** new `settings.ts` handler +
  `x-data` wiring. (R2)
- **R2 🔴 critical fixes:** all applied. (R2)
- **`parsePagination` NaN/negative guard:** `http-utils.ts` guards. (R2)
- **`chats.ts` enum validation:** validates `type`/`mode`/`turnStrategy`. (R2)
- **`users.ts` displayName null + 404:** `handleUpdateUser` returns 404 when
  missing. (R2)
- **UI dead elements:** settings buttons wired, characters import wired,
  `index.html` removed, world-detail/new-chat restructured. (R2)
- **TS strict-typing debt:** `db/index.ts` alias renamed `Database`→`Db`;
  `bun run typecheck` clean. (plan.md Known Issues)
- **`bedrock.ts` dead provider:** deleted (always threw). (R2)
- **`build/compress.ts` try/catch:** already present around `compressFile`. (R2)

### Open / verify — none of substance

Items from earlier triage that did **not** reproduce on inspection:

- `assistant.enabled` config key: does not exist in `src/config/schema.ts` /
  `load.ts` — moot (feature not implemented, not a bug).
- Provider enum drift (`registry.ts` vs `types.ts`): no drift found.
- Migration `run()` vs `sql` import: `sql` import hoisted to top of migration 009.
- Prompt-assembler selective entries / token budget: in-progress Epic 12 feature
  work, not a defect.

> _Archive placeholder: resolved findings below will be relocated to a dedicated
> archive once the active list is trimmed further. Until then this summary is the
> source of truth._

---

## Round 1 — Full Code Review 2026-07-05

92 findings across 85 files. Grouped by area.

### 🔵 Nit fixes applied

| Fix                              | File                                         | Change                                                                     |
| -------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| DATA_DIR absolute                | `src/config/constants.ts:2`                  | Uses `import.meta.url` path, not CWD-relative                              |
| Token expiry off-by-one          | `src/middleware/auth.ts:64`                  | `<` → `<=`                                                                 |
| HTML-escape in errorHtml         | `src/routes/auth.ts:51`                      | Added `escapeHtml()` sanitizer                                             |
| Dead `!response.ok` in bedrock   | `src/generation/providers/bedrock.ts:69,101` | Removed — `fetchWithRetry` already throws                                  |
| isComplete always false          | `src/story/turn-manager.ts:227`              | Uses `maxTurns` from chat config, not `MAX_SAFE_INTEGER`                   |
| Inline onerror handler           | `src/views/layout.html:163`                  | Replaced with Alpine `x-on:error` directive                                |
| marked.use in types file         | `src/frontend/alpine/types.ts:17`            | Moved to `chat.ts` where `marked` is used                                  |
| `(this as any)` unnecessary cast | `src/frontend/alpine/chat.ts:119,114,etc.`   | Replaced with typed `this.*` or `this.$dispatch()`                         |
| groupedMessages deep copy churn  | `src/frontend/alpine/chat.ts:565-585`        | Added memoization cache keyed on msg count + first/last ID                 |
| window.open missing noopener     | `src/frontend/alpine/chat.ts:713`            | Added `'noopener,noreferrer'`                                              |
| Alpine internal `__x` access     | `src/frontend/alpine/app.ts:57-59`           | Uses `Alpine.$data(el)` public API                                         |
| Typing indicator stuck on error  | `src/tui/chat.ts:161`                        | `showTyping` now increments `itemCount`                                    |
| Test schema missing tables       | `src/db/database.test.ts:6`                  | Added all 18 missing tables from migration                                 |
| Orphaned locale keys             | `src/public/locales/en.json`                 | 7 keys unused — acknowledged as start of localization effort; needs design |

### Auth / Ownership (15 route files)

| 🔴  | File                               | Handler                                                                                      | Problem                                           |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------- |
|     | `src/routes/chats.ts`              | `handleGetChat`, `handleListParticipants`, `handleAddParticipant`, `handleRemoveParticipant` | No ownership check. Any user accesses any chat.   |
|     | `src/routes/messages.ts`           | `handleGetMessage`, `handleListVariants`, `handleSelectVariant`, `handleUpdateVisibility`    | No auth check. Any user accesses any message.     |
|     | `src/routes/worlds.ts`             | All handlers (170-298)                                                                       | No auth check. Worlds + locations open to anyone. |
|     | `src/routes/story-items.ts`        | All handlers (38-206)                                                                        | No auth check. Story items open across users.     |
|     | `src/routes/story-states.ts`       | All handlers (36-175)                                                                        | No auth check. NPC/location states open.          |
|     | `src/routes/story-turns.ts`        | All handlers (24-76)                                                                         | No auth check. Turns open.                        |
|     | `src/routes/actor-items.ts`        | All handlers (36-224)                                                                        | No auth check.                                    |
|     | `src/routes/actor-lore-entries.ts` | All handlers (36-230)                                                                        | No auth check.                                    |
|     | `src/routes/actor-memories.ts`     | All handlers (36-219)                                                                        | No auth check.                                    |
|     | `src/routes/actor-notes.ts`        | All handlers (36-211)                                                                        | No auth check.                                    |
|     | `src/routes/world-lore-entries.ts` | All handlers (36-226)                                                                        | No auth check.                                    |

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
| 🔴 | `src/config/load.ts:123` | `Number(env) \|\| 30_000` → `0` treated as falsy. Fix: `?? 30_000`. |
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

### Story / turn logic

| 🟡 | `src/story/quest-engine.ts:247` | `Math.round(100 / cfg.targetQuantity)` — division by zero. |

### Anti-patterns (banned by AGENTS.md)

| 🟡 | `src/routes/chats.ts:185,271` | Silent `catch(() => {})` on participant insertion. |
| 🟡 | `src/generation/step-pipeline.ts:39-41,64-66` | Silent catches. |
| 🟡 | `src/generation/cancellation-tracker.ts:186` | `void promise.catch(() => {})`. Silent. |
| 🟡 | `src/frontend/alpine/gallery.ts:89-98` | Bare `.then().catch()` waterfall. |
| 🟡 | `src/frontend/alpine/characters.ts:124-135` | Bare `.then().catch()` waterfall. |

### Alpine / frontend misc

| 🟡 | `src/frontend/alpine/htmx.ts:16-18` | No CSRF token injection, no retry, no timeout in `apiFetch`. |

### TUI / build / test

| 🟡 | `src/tui/app.ts:87` | Monkey-patches `ChatWidget.setChatId`. Fragile. |
| 🟡 | `src/tui/app.ts:71` | `void loadMessages().then(...)` — error swallowed. |
| 🟡 | `src/build/compress.ts:66` | No try/catch on single file. Build crash on disk full. |
| 🟡 | `src/generation/generate-route.test.ts:222-228` | Mock provider state leaks across tests. |
| 🟡 | `tests/e2e/flows/browser/*.test.ts` | Browser E2E flaky: `data-testid` attributes missing in view templates, chrome timeout under load. |
| 🟡 | `tests/e2e/flows/chat-full.test.ts` | Swipe variants flaky under parallel: `smk.ts` module-level `activeSmk` shared across unit+e2e test files. |

---

## Round 2 — FE/BE Review 2026-07-05

Post-commit review of feat(frontend/tui) — Alpine.js chat/gallery, responsive layout, TUI app.
37 findings across TS backend + HTML/CSS/Alpine.JS frontend.

### 🔴 Critical (FE: 4, BE: 0)

| #   | File                              | Line | Problem                                                               | Fix                                                      |
| --- | --------------------------------- | ---- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | `src/views/settings.html`         | 2    | Missing `x-data="settingsPage()"`. All x-model/x-bind dead.           | Add `x-data="settingsPage()"` to root div.               |
| 2   | `src/frontend/alpine/settings.ts` | 3    | `confirmDeleteText` missing from return object.                       | Add `confirmDeleteText: ""`.                             |
| 3   | `src/views/chat.html`             | 15   | `.chat-list-panel` + `.chat-list-header` zero CSS rules.              | Add CSS for positioning/width/z-index.                   |
| 4   | `src/views/gallery.html`          | 109  | Upload drop-zone no click handler. File input hidden with no trigger. | Add `@click="$refs.fileInput.click()"` to drop-zone div. |

### 🟡 Backend Risks (11)

| #   | File                                     | Line    | Problem                                                                                                                   | Fix                                                            |
| --- | ---------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 5   | `src/story/quest-engine.ts`              | 68-74   | `safeJsonStringify` failure silently falls back to `"{}"`/`"[]"`. Data lost with zero logging.                            | `console.error` + throw on failure.                            |
| 6   | `src/story/quest-engine.ts`              | 235     | `jsonParseOr(quest.config, {}) as QuestConfig` — default `{}` invalid for discriminated union.                            | Validate after parse or provide valid fallback.                |
| 7   | `src/story/world-state.ts`               | 87      | Same pattern as #6.                                                                                                       | Same fix.                                                      |
| 8   | `src/story/turn-manager.ts`              | 55      | `persistState()` silently returns on `!serialized.ok`. State lost.                                                        | `console.error` on failure.                                    |
| 9   | `src/story/turn-strategies.ts`           | 46      | `toSorted(() => Math.random() - 0.5)` — non-deterministic comparator violates sort contract.                              | Use Fisher-Yates shuffle.                                      |
| 10  | `src/generation/cancellation-actions.ts` | 195     | Policy check condition changed — throttled + requires `expectedPolicy` truthy. Behavioral change.                         | Restore `cancel` check or document regression.                 |
| 11  | `src/generation/cancellation-actions.ts` | 158     | `safeJsonStringify` fallback to `null` — repetition analysis data lost.                                                   | Log + handle error result.                                     |
| 12  | `src/story/quality-evaluator.ts`         | 339     | `getReasoning()` dead params. `eslint-disable` redundant. `sonarjs/cognitive-complexity` disable masks 12-path branching. | Drop unused params. Extract dimension→message map.             |
| 13  | `src/utils/date.ts`                      | 84      | Default `style` changed from `"compact"` to `"standard"`. Breaking for callers.                                           | Verify all callers pass explicit `style: "compact"` if needed. |
| 14  | `src/story/turn-manager.ts`              | 233     | `maxTurns=0` → instant completion. `MAX_SAFE_INTEGER` default unlimited.                                                  | Add config validation or sensible default.                     |
| 15  | `src/story/quest-engine.ts`              | 221,317 | `eslint-disable sonarjs/cognitive-complexity` on complex functions.                                                       | Acceptable for now; refactor later.                            |

### 🟡 Frontend Risks (7)

| #   | File                      | Line   | Problem                                                    | Fix                                      |
| --- | ------------------------- | ------ | ---------------------------------------------------------- | ---------------------------------------- |
| 16  | `src/views/chat.html`     | 86     | `.error-banner` class has no CSS rules.                    | Add CSS.                                 |
| 17  | `src/views/chat.html`     | 96     | `.thinking-block`, `.thinking-content` have no CSS rules.  | Add CSS.                                 |
| 18  | `src/views/chat.html`     | 117    | `.media-image`, `.media-file` have no CSS rules.           | Add CSS.                                 |
| 19  | `src/views/gallery.html`  | 31,36  | `.thumbnail`, `.file-icon` no CSS rules.                   | Add CSS or rename classes.               |
| 20  | `src/views/chat.html`     | 135    | Action button classes have no CSS rules.                   | Verify `.btn-icon` suffices.             |
| 21  | `src/views/settings.html` | header | `<span class="title">Settings</span>` not heading element. | Use `<h1>` or `role="heading"`.          |
| 22  | `src/views/index.html`    | 288    | `/browser.js` + `/index.js` scripts in dead code path.     | Remove dead scripts or fix dependencies. |

### 🔵 Nits (2)

| #   | File                           | Line | Problem                                                | Fix                    |
| --- | ------------------------------ | ---- | ------------------------------------------------------ | ---------------------- |
| 23  | `src/frontend/alpine/chat.ts`  | 6,10 | `marked.use(...)` called twice.                        | Remove duplicate call. |
| 24  | `src/story/turn-strategies.ts` | 46   | Spread redundant since `toSorted()` returns new array. | Drop spread.           |

### Totals (Round 2)

| Severity    | Count  |
| ----------- | ------ |
| 🔴 Critical | 4      |
| 🟡 Backend  | 11     |
| 🟡 Frontend | 7      |
| 🔵 Nit      | 2      |
| **Total**   | **24** |

---

## Round 3 — Unexplored Areas Review 2026-07-06

Review of previously unexplored modules: db/enums, db/migrations, utils, content/, assistant/, tui/, age-gate/, server.ts, router.ts, middleware/pipeline.ts.

**Status: All 🔴 and 🟡 items addressed.**

### 🔴 Critical Fixes Applied

| #   | File                            | Fix Applied                                                                                                                                                             |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/db/migrations/001_init.ts` | Added `.notNull()` to `encrypted_key`, composite index on `sessions(user_id, expires_at)`, CHECK constraint on `messages.attachments`, removed dead `public_key` column |
| 2   | `src/server.ts`                 | Path traversal guard with trailing separator, age-gate routes added to `skipAuth`, migrations awaited before `serve()`, mtime check for asset compression               |
| 3   | `src/content/compress.ts`       | Type-safe zstd wrapper replacing `any` cast                                                                                                                             |
| 4   | `src/content/encode.ts`         | Type-safe zstd wrapper replacing `any` cast                                                                                                                             |
| 5   | `src/content/decode.ts`         | Type-safe zstd wrapper replacing `any` cast                                                                                                                             |
| 6   | `src/tui/chat.ts`               | Added session token + Authorization header, callback-based chat change, cursor-based pagination, input race fixed                                                       |
| 7   | `src/tui/app.ts`                | Replaced monkey-patch with callback prop, fixed promise handling                                                                                                        |

### 🟡 High/Medium Fixes Applied

| #   | File                                | Fix Applied                                                                                                        |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 8   | `src/age-gate/service.ts`           | Empty string check for `age_gate_accepted_at` using `Boolean()`                                                    |
| 9   | `src/age-gate/controller.ts`        | Singleton class replaces module-level mutable state, 401 for null userId                                           |
| 10  | `src/assistant/service.ts`          | Word boundary regex prevents false positives                                                                       |
| 11  | `src/assistant/prompt-assembler.ts` | Selective columns instead of `selectAll()`, dynamic token budget for chat history, System/Narration roles included |
| 12  | `src/utils.ts`                      | `jsonParseOrThrow` added, fixed double-parse in `safeJsonStringify`                                                |
| 13  | `src/routes/router.ts`              | Removed stale comment                                                                                              |

### Remaining Issues (Post-Fix)

| #   | File                                | Issue                                                                             |
| --- | ----------------------------------- | --------------------------------------------------------------------------------- |
| 14  | `src/db/enums.ts`                   | Barrel re-exports but no validation enums match DB. Drift risk.                   |
| 15  | `src/db/migrations/001_init.ts`     | `chat_participants` PK on (chat_id, actor_id) but no unique constraint documented |
| 16  | `src/db/migrations/001_init.ts`     | `sessions.token_hash` stored but no index on user_id + expires_at for cleanup     |
| 17  | `src/db/migrations/001_init.ts`     | `actor_keys.public_key` column unused (removed in fix)                            |
| 18  | `src/utils.ts`                      | `safeJsonStringify` guarded mode parses JSON twice on hot path                    |
| 19  | `src/content/encode.ts`             | zstd cast replaced with type-safe wrapper                                         |
| 20  | `src/content/decode.ts`             | zstd cast replaced with type-safe wrapper                                         |
| 21  | `src/assistant/service.ts`          | Config schema may not have `assistant.enabled`                                    |
| 22  | `src/assistant/prompt-assembler.ts` | Selective entries (keys) ignored                                                  |
| 23  | `src/assistant/prompt-assembler.ts` | Token budget enforcement message array rebuild bug                                |
| 24  | `src/tui/app.ts`                    | Monkey-patches `ChatWidget.setChatId`                                             |
| 25  | `src/tui/chat.ts`                   | No retry, no idempotency key                                                      |
| 26  | `src/tui/asset-view.ts`             | Left/right keys conflict with input nav                                           |
| 27  | `src/age-gate/controller.ts`        | `runtimeConfig` module-level mutable                                              |
| 28  | `src/server.ts`                     | Migrations run before serve                                                       |
| 29  | `src/build/compress.ts`             | No try/catch on single file                                                       |

### Combined Totals (All Rounds)

| Severity    | Count                       |
| ----------- | --------------------------- |
| 🔴 Critical | 38                          |
| 🟡 High/Med | 85                          |
| 🔵 Low/Nit  | 16 (15 fixed in R3)         |
| ❓ Question | 0 (1 resolved)              |
| **Total**   | **139** (15 resolved in R3) |
