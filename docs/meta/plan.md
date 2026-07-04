# Implementation Plan

Current state: far beyond original MVP. DB schema, generation module, story
engine, transport layer, content encoding, middleware, config, age gate, logger
all built. What's missing is **user-facing integration** — routes, controllers,
web views need wiring to backend; TUI needs widgets; assistant needs impl.

Target: **v0.1** — end-to-end User×Character chat in Web UI and TUI.

## ✅ What Exists

| Area | Status | Key Files |
|------|--------|-----------|
| DB schema (19 tables) | Done | `src/db/schema-*.ts`, `migrations/001_init.ts` |
| Enums (30+) | Done | `src/db/enums-*.ts` |
| Kysely init + WAL | Done | `src/db/index.ts` |
| Config (YAML/TOML/env) | Done | `src/config/load.ts`, `schema.ts` |
| TLS cert auto-gen | Done | `src/config/cert.ts` |
| Middleware (auth, compose, error) | Done | `src/middleware/*.ts` |
| Age gate service + controller | Done | `src/age-gate/*.ts` |
| Generation module | Done | `src/generation/*.ts` |
| Story engine | Done | `src/story/*.ts` |
| Content encode/decode/minify | Done | `src/content/*.ts` |
| Transport layer (H1/H2/WS) | Done | `src/transport/*.ts` |
| Logger (structured, rotate) | Done | `src/logger/*.ts` |
| Server (HTTP/HTTPS, static) | Done | `src/server.ts` |
| Frontend lib (browser crypto) | Done | `src/frontend/browser.ts` |
| CSS themes (12) + app CSS | Done | `src/public/css/*.css` |
| Web UI view templates | Done | `src/views/chat.html`, `layout.html`, `gallery.html`, `settings.html` |
| HTTP utils | Done | `src/routes/http-utils.ts` |
| DB migrate runner | Done | `src/db/migrate.ts` |
| Tests (333 pass) | Done | `bun test` |
| Docs (spec, frontend, meta) | Done | `docs/{spec,frontend,meta}/*.md` |

## ❌ What's Missing for v0.1

| Area | Gap | Priority |
|------|-----|----------|
| CRUD route controllers | No routes for chats, messages, characters, users, worlds, assets | P0 |
| View endpoints | No `/views/chat`, `/views/gallery`, `/views/characters`, `/views/settings` serving | P0 |
| Assistant service | Config exists, no impl | P0 |
| TUI widgets | Only screen setup — no chat/input/gallery | P1 |
| Web UI ↔ backend wiring | Views reference endpoints that don't exist | P0 |
| Profanity filter | Missing | P2 |
| Assets service layer | Schema + migration exist, no service/controller/routes | P1 |
| Lint errors | 176 style errors (unicorn, sonarjs) | P1 |
| `ALLOW_NSFW` / `NSFW_MIN_AGE` config | Not implemented | P2 |

## 📋 Phases

### Phase 1: CRUD Routes + Assistant (Core Loop)

Build missing route controllers and assistant so the basic chat loop works.

- [ ] **Chat routes** (`src/routes/chats.ts`)
  - `GET /api/chats` — list user's chats
  - `POST /api/chats` — create chat (with participant, optional title)
  - `GET /api/chats/:id` — single chat
  - `PATCH /api/chats/:id` — update chat
  - `DELETE /api/chats/:id` — delete chat
  → Ref: `src/views/chat.html:14` (chat list), `src/views/chat.html:20` (new chat)

- [ ] **Message routes** (`src/routes/messages.ts`)
  - `GET /api/chats/:id/messages` — list messages for chat
  - `POST /api/chats/:id/messages` — send message, trigger generation
  - `PATCH /api/messages/:id` — edit message
  - `DELETE /api/messages/:id` — soft delete
  → Ref: `src/views/chat.html:103` (message list), `src/views/chat.html:175` (send)

- [ ] **Character routes** (`src/routes/characters.ts`)
  - `GET /api/characters` — list
  - `POST /api/characters` — create
  - `GET /api/characters/:id` — detail
  - `PATCH /api/characters/:id` — update
  - `DELETE /api/characters/:id` — delete
  → Ref: `src/views/chat.html:33` (browse characters)

- [ ] **User routes** (`src/routes/users.ts`)
  - `GET /api/users/me` — current user profile
  - `PATCH /api/users/me` — update profile
  - `POST /api/users/me/age-gate` — set birth date

- [ ] **World routes** (`src/routes/worlds.ts`)
  - Basic CRUD: list, create, get, update, delete
   → Ref: [worlds.md](../frontend/worlds.md)

- [ ] **View serving** (`src/routes/views.ts` or inline in server)
  - `GET /views/chat` → `src/views/chat.html`
  - `GET /views/gallery` → `src/views/gallery.html`
  - `GET /views/characters` → character list view
  - `GET /views/settings` → `src/views/settings.html`
  → Use layout.html as wrapper with `{{{content}}}` injection
  → Ref: `src/views/layout.html:111`

- [ ] **Assistant service** (`src/assistant/service.ts`)
  - Rule-based MVP: keyword map with mode-aware responses
  - Function: `generateResponse(userInput, chatMode, context?)`
  - Wire into `POST /api/chats/:id/messages` flow
   → Ref: [implementation.md](../spec/implementation.md) → Enhanced Assistant

- [ ] **Route router** (`src/routes/router.ts`)
  - Single dispatch function matching URL patterns to route handlers
  - Wire into `handleApiRequest()` in `src/server.ts:108-128`
  - Replace the current `jsonError("Not implemented", 501)` stub

- [ ] **Fix lint errors** — `bun run lint`
  - 176 errors: `unicorn/switch-case-braces`, `sonarjs/cognitive-complexity`,
    `no-unsafe-assignment`, `unicorn/prefer-*` style issues
  - Auto-fix: `bun run lint:fix` (catches most)
  - Manual: break up high-complexity functions in story/events, world-state
  → Verify: `bun run check` passes

### Phase 2: Web UI Functionality

Make the existing view templates actually work end-to-end.

- [ ] **Chat list sidebar** — wire `hx-get="/api/chats"` to chat route
- [ ] **Message display** — render messages from API, wire htmx swap
- [ ] **Send message** — form `hx-post` wired to message creation route
- [ ] **Generation status** — wire cancellation/status polling to generation controller
  → Ref: `src/views/chat.html:143-171`
- [ ] **Character list page** — `/views/characters` with grid, create/edit forms
  → Ref: [characters.md](../frontend/characters.md)
- [ ] **Gallery page** — `/views/gallery` with asset grid, upload, preview modal
  → Ref: [gallery.md](../frontend/gallery.md)
- [ ] **Settings page** — theme switching, account info, API config
  → Ref: [settings.md](../frontend/settings.md)
- [ ] **Auth UI** — login page with demo mode toggle
  → Ref: [login.md](../frontend/login.md)
- [ ] **Error toasts** — ensure htmx response-error handler works for all routes
  → Ref: `src/views/layout.html:223-241`

### Phase 3: TUI Widgets

- [ ] **Chat widget** (`src/tui/chat.ts`)
  - Blessed `List` for messages, `Textbox` for input
  - Methods: `addMessage()`, `setChatId()`, `scrollToBottom()`
  - Wire to API via fetch
  → Ref: [tui.md](../spec/tui.md)

- [ ] **Input widget** (`src/tui/input.ts`)
  - Textarea with send binding
  - Ctrl+Enter or Enter to send
  - Auto-resize

- [ ] **Screen manager** (`src/tui/app.ts` — expand existing)
  - Layout: chat view + input
  - Global shortcuts: `Esc`/`q` quit, `Tab` focus switch
  - Manual `screen.render()` after updates

- [ ] **Gallery view** (`src/tui/gallery-view.ts`)
  - Browse linked assets for current chat

### Phase 4: Asset System

- [ ] **Assets service** (`src/assets/service.ts`)
  - CRUD for assets table
  - Upload handling (file validation, size limits, disk storage)
  - Polymorphic linking via `asset_links` table
  → Ref: [assets.md](../spec/assets.md), [schema.md](../spec/schema.md) (asset_links table)

- [ ] **Assets controller** (`src/assets/controller.ts`)
  - `GET /api/assets` — list
  - `POST /api/assets` — upload
  - `DELETE /api/assets/:id` — delete
  - `POST /api/assets/:id/link` — link to entity
  - `DELETE /api/assets/:id/link` — unlink

- [ ] **Wire to Web UI** — attach file input → upload → link to chat
  → Ref: `src/views/chat.html:195-204`

### Phase 5: Security & Config

- [ ] **Add `ALLOW_NSFW` config option** (`src/config/schema.ts`)
  - Boolean, default true
  - Server rejects NSFW chat creation when false

- [ ] **Add `NSFW_MIN_AGE` config option**
  - Integer, default 18
  - Check against user's age from birth_date
  - Reject NSFW chat when underage

- [ ] **Profanity filter** (`src/profanity/service.ts`)
  - Hardcoded word list (configurable later)
  - `filter(text: string): string` — replace matches with asterisks
  - Apply to both user messages and assistant responses in POST message flow

- [ ] **Age gate enforcement in chat creation**
  - Check birth_date before allowing NSFW chat mode
  - Return proper error responses (403 with message)

### Phase 6: Validation & Release

- [ ] **`bun run check` passes** — typecheck + lint + format + md:lint
- [ ] **`bun test` passes** — existing 333 + new route/controller tests
- [ ] **E2E test: web UI** — create chat, send message, receive reply
- [ ] **E2E test: TUI** — create chat, send message, verify message display
- [ ] **E2E test: age gate** — verify underage rejection for NSFW
- [ ] **E2E test: profanity filter** — verify message filtering
- [ ] **Update getting-started guide** with v0.1 instructions
  → Ref: [getting-started.md](../guide/getting-started.md)
- [ ] **Tag v0.1.0** upon completion

## 🔗 Cross-Reference

- DB: [schema.md](../spec/schema.md), `src/db/schema-*.ts`
- Config: `src/config/schema.ts`, `src/config/load.ts`
- API: [api.md](../reference/api.md)
- Frontend UX: [overview.md](../frontend/overview.md), [chat/](../frontend/chat/)
- TUI: [tui.md](../spec/tui.md)
- Assistant: [implementation.md](../spec/implementation.md)
- Assets: [assets.md](../spec/assets.md)
- Code quality: `package.json` scripts, `eslint.config.mjs`

## 🚫 Out of Scope for v0.1

Memory system, artifacts, agentic workspace, multi-LLM story,
RPG mechanics (stats/combat/loot), multi-user registration dashboard,
internationalization, PWA, mobile clients, admin dashboard, rate limiting,
webhooks, OAuth providers.

## 🔌 Plugin System

**Not gated on full infrastructure.** Sample plugins (dice, simple tools) can
be built alongside the core loop without waiting for plugin UI/registry. Plugin
host + chat/site linkage comes later.

→ See [plugin-system.md](../spec/plugin-system.md) for architecture.
→ Dice plugin is a first-class candidate for the early-build list.
