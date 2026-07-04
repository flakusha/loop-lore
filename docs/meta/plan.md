# MVP Implementation Plan

This document outlines a concrete, checklist-style plan for delivering the Minimum Viable Product (MVP) of loop-lore, contrasting with the longer-term roadmap. Each item includes references to relevant design documents and source locations.

## ✅ MVP Goal
Deliver a functional **User × Character** chat prototype with persistent message history, working TUI and Web UIs, and a rule-based assistant — all using the core Bun/TypeScript/SQLite/Kysely/htmx+Alpine/blessed stack.

**Additional MVP Features:**
1. SFW/NSFW chat mode setting that influences the assistant's behavior
2. Server-level ability to prohibit NSFW content entirely (configuration-based)
3. Age-based gating for NSFW content (simple birth year check)
4. Profanity filtering for user messages and assistant responses

**Target completion:** 4 weeks  
**Success criteria:** End-to-end chat works in both interfaces; `bun run check` passes; no console errors; SFW/NSFW mode correctly influences assistant responses; server can prohibit NSFW; basic age gating functions; profanity is filtered from stored and displayed messages.

---

## 📋 Checklist

### Week 1: Foundation & API
- [ ] Define core database schema (`users`, `chats`, `messages`) using Kysely  
  → Ref: [`docs/schema.md`](#), [`src/db/schema.ts` (to be created)]  
- [ ] Add `mode` column to `chats` table (ENUM: 'sfw', 'nsfw', default 'sfw')  
  → Ref: [`docs/schema.md`](#) (to be updated)  
- [ ] Add `birth_year` column to `users` table (INTEGER, nullable) for age gating  
- [ ] Write initial migration script to create tables (including the new columns)  
  → Ref: [`src/db/migrations/` (to be created)]  
- [ ] Initialize Kysely instance with `bun:sqlite` dialect in `src/db/index.ts`  
  → Ref: [`docs/implementation.md` → Database section]  
- [ ] Add server configuration:  
  - `ALLOW_NSFW` boolean env var (default: true)  
  - `NSFW_MIN_AGE` integer env var (default: 18)  
  - When `ALLOW_NSFW=false`, server rejects NSFW chat creation attempts  
  - When user's age < `NSFW_MIN_AGE`, server rejects NSFW chat creation attempts  
- [ ] Create profanity filter service (`src/profanity/service.ts`)  
  - Hardcoded list of profane words (to be replaced with configurable list later)  
  - Export function `filter(text: string): string` that replaces profane words with asterisks  
  → Ref: New service for MVP  
- [ ] Implement REST API routes:  
  - `GET /api/chats`  
  - `POST /api/chats` (create chat with placeholder User/Character, optional `mode` field; validates against `ALLOW_NSFW`, `NSFW_MIN_AGE`, and user age)  
  - `GET /api/chats/:id/messages`  
  - `POST /api/chats/:id/messages` (store user message, generate assistant reply based on chat mode and server config)  
  → Ref: [`docs/reference/api.md` (baseline)]  
- [ ] Build middleware pipeline (`src/middleware/`):  
  - `RequestContext` type (userId, userRole, sessionId)  
  - `compose()` middleware runner  
  - Auth middleware: Bearer token → SHA-256 → session lookup → context  
  - Solo/demo mode: bypass token check, return implicit solo user  
- [ ] Add auth config to config schema + env vars  
- [ ] Wire middleware into server.ts fetch handler  
- [ ] Update age-gate and generation dispatch to receive real userId/userRole  
- [ ] Add basic error handling (JSON error responses, logging)  
- [ ] Verify API with `curl`/HTTPie; ensure 403/400 responses for prohibited NSFW attempts  

### Week 2: UI Implementation
- [ ] Build TUI chat view (`src/tui/chat.ts`)  
  - Blessed `List` widget for message log  
  - `Textbox` for input, `Enter` to send  
  - Methods: `addMessage()`, `setChatId()`, `scrollToBottom()`  
  → Ref: [`docs/tui.md`]  
- [ ] Implement TUI screen manager (`src/tui/app.ts`)  
  - Layout: chat view + input (fullscreen or split later)  
  - Global shortcuts: `Esc`/`Ctrl+C` to quit  
  - Manual `screen.render()` after updates  
- [ ] Create Web UI using htmx + Alpine.js (`src/public/index.html`, `app.js`)  
  - Container for messages (`hx-get` to `/api/chats/:id/messages`)  
  - Form with `hx-post` to `/api/chats/:id/messages`  
  - Alpine.js for local state (input binding, loading flags)  
  → Ref: [`docs/frontend/overview.md`], [`docs/frontend/chat/layout.md`]  
- [ ] Style both UIs with shared CSS tokens (reuse `theme.css` variables)  
  → Ref: [`docs/frontend/overview.md` → Design Token Reference]  
- [ ] Ensure both UIs show loading indicators during async requests  
- [ ] Test responsiveness: resize terminal/browser; verify layout adapts  
- [ ] Add UI control to set chat mode when creating a new chat (dropdown: SFW/NSFW, default SFW)  
  → Ref: [`docs/frontend/chat/input.md`] (for Web UI), [`docs/tui/input.ts`] (for TUI)  
- [ ] Add user birth year input during initial setup or profile creation (simple input, stored in users table)  
  → Ref: [`docs/frontend/chat/input.md`], [`docs/tui/input.ts`]  

### Week 3: Assistant & Polish
- [ ] Implement rule-based assistant service (`src/assistant/service.ts`)  
  - Export function `generateResponse(userInput: string, chatMode: 'sfw' | 'nsfw', userAge?: number): Promise<string>`  
  - Simple keyword map with mode-aware responses (e.g., SFW: `"hi" => "Hello!"`, NSFW: `"hi" => "Hello there... 😏"`)  
  - Responses can be further adjusted based on user age if needed  
  → Ref: [`docs/implementation.md` → Enhanced Assistant]  
- [ ] Wire assistant into message creation flow:  
  - On `POST /api/chats/:id/messages`:  
    1. Receive raw user message from client  
    2. Apply profanity filter to get filtered user message  
    3. Store filtered user message as the user message in the database  
    4. Fetch chat mode and user's birth year  
    5. Calculate age from birth year (currentYear - birthYear)  
    6. Check server `ALLOW_NSFW` config and `NSFW_MIN_AGE` (if NSFW chat and (user age < NSFW_MIN_AGE or !ALLOW_NSFW), reject with 403)  
    7. Call assistant with filtered user message, mode, and age context  
    8. Apply profanity filter to the assistant response to get filtered assistant response  
    9. Store filtered assistant response as the assistant message  
  - Return both messages (filtered versions) in response (or separate endpoint for streaming later)  
- [ ] Add client-side optimistic update (show user message immediately)  
- [ ] Implement error toasts in both UIs (per frontend error handling pattern)  
  → Ref: [`docs/frontend/overview.md` → Error Handling Pattern]  
- [ ] Ensure message timestamps are stored and displayed (optional for MVP)  
- [ ] Verify conversation history persists across restarts (SQLite file)  

### Week 4: Validation & Baselines
- [ ] Run full lint/typecheck/markdown: `bun run check` → **must pass**  
  → Ref: [`package.json` scripts], [`eslint.config.mjs`], [`.markdownlint.json`]  
- [ ] Write 2-3 end-to-end tests (manual checklist acceptable for MVP):  
  1. Start server with `ALLOW_NSFW=true`, `NSFW_MIN_AGE=18`  
  2. Start TUI → create SFW chat (user 25yo) → send message with profanity → verify stored/displayed message is filtered  
  3. Visit `http://localhost:3000` → create NSFW chat (user 25yo) → send message with profanity → verify stored/displayed message is filtered  
  4. Start server with `ALLOW_NSFW=false` → attempt to create NSFW chat → verify 403 error  
  5. Create user with birth year making them <18 (e.g., 2010 for age ~14) → attempt NSFW chat → verify age-based rejection  
  6. Create user aged exactly NSFW_MIN_AGE-1 → attempt NSFW chat → verify rejection  
  7. Create user aged exactly NSFW_MIN_AGE → attempt NSFW chat → verify allowed  
  8. Send a message that causes the assistant to generate a response with profanity → verify assistant response is filtered  
  9. Quit TUI, restart, verify message history appears (filtered versions)  
  10. Test error case: request invalid `/api/chats/999/messages` → 404  
- [ ] Update getting started guide with MVP-specific instructions  
  → Ref: [`docs/guide/getting-started.md`] (add "Run MVP" section)  
- [ ] Ensure `.gitignore` excludes `data/` (SQLite file) and `node_modules/`  
- [ ] Tag release `v0.1.0-mvp` (or similar) upon completion  

### 🔗 Cross-Reference Key Documents
- **Database Schema**: [`docs/schema.md`](#)  
- **API Reference**: [`docs/reference/api.md`](#)  
- **Frontend UX**: [`docs/frontend/`](#) (especially overview, chat layout, messages, input)  
- **TUI Implementation**: [`docs/tui.md`](#)  
- **Assistant Design**: [`docs/implementation.md`](#) → Enhanced Assistant section  
- **Error Handling Pattern**: [`docs/frontend/overview.md`](#) → Error Handling Pattern  
- **Design Tokens**: [`docs/frontend/overview.md`](#) → Design Token Reference  
- **Development Setup**: [`docs/guide/installation.md`](#)  
- **Code Quality**: [`package.json`] (scripts: `check`, `lint`, `typecheck`, `md:lint`)  
- **Profanity Filter**: New service (`src/profanity/service.ts`)  

### 🚫 Explicitly Out of Scope for MVP
- [ ] Plugin system → see [`docs/plugin-system.md`](#) (post-MVP)  
- [ ] Advanced memory (episodic/semantic) → see [`docs/memory-system.md`](#)  
- [ ] Artifacts system → see [`docs/artifacts-system.md`](#)  
- [ ] Agentic workspace mode → see [`docs/use-case-agentic-workspace.md`](#)  
- [ ] Full user registration dashboard, password reset, email verification (session auth middleware + login/logout is in scope; advanced account management deferred)  
- [ ] Media assets (images/audio/video) → see [`docs/assets.md`](#)  
- [ ] Theming system  
- [ ] World/Location entities  
- [ ] Internationalization  
- [ ] Per-user story notes and prompt injections (invisible to other players) → see [`docs/memory-system.md`](#) for related memory concepts (post-MVP)  
- [ ] Full administrator dashboard (server config via env vars/files is MVP)  
- [ ] Configurable profanity list (hardcoded for MVP)  

### 📈 Post-MVP Roadmap Alignment
Once MVP is verified, iterate toward roadmap features:
1. **Plugin System** → enables extensibility without core changes  
2. **Memory System** → enriches agent/contextual behavior (includes user story notes and injections)  
3. **Artifacts System** → adds code/documents datasets  
4. **Agentic Workspace** → repurposes Worlds/Locations/Characters as Epics/Tasks/Agents  
5. **UI/theming/etc.**  

Each will build on the solid foundation validated by this MVP.

---
*Last updated: $(date +%Y-%m-%d)*  
*Generated as part of MVP planning effort.*