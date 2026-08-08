# Priority — Workstack & 0.1.0 Value Tiers (P0–P6+)

> **Last updated:** 2026-08-08 (consolidated from `priority.md` + `high-value.md` into
> this single tier doc). Holds the **entire priority ladder** P0→P6+. `../open.md` holds
> debt & deferred work; `../active.md` was merged into `../open.md` (2026-08-08).
> Non-value work sits in `../open.md` unless it blocks these tiers.

## Status header

P0 ✅ · P1 ✅ · P1.5 ✅ · P2 🟡 in progress · Regex ✅ · P3–P5 → 0.1.0 value tiers
(§ P3–P5 below) · P6+ → `../open.md`.

## P0 — Critical Path (Blocking)

| Area           | Item                                                                                                                                   | Effort | Status                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Data Integrity | Phase 1 — config guards (reject `sqlite` when `INSTANCE_COUNT > 1`, warn on network FS WAL, fix stale MySQL claim in architecture doc) | Low    | ✅ Complete (`src/config/load.ts`)                                                                                                    |
| NSFW           | Moderation Safety Infrastructure — gate, consent, audit, flagging                                                                      | Medium | 🟡 Partial — runtime config + live enforcement + mood-shift shipped (2026-08-03); audit-log UI + consent display shipped (2026-08-06) |
| Shared Schemas | Reputation, Consent, NSFW Content Rating (`src/schemas/`)                                                                              | Medium | ✅ Complete                                                                                                                           |

## P1 — High Priority (Post-P0)

| Epic               | Item                                                               | Effort | Status                      |
| ------------------ | ------------------------------------------------------------------ | ------ | --------------------------- |
| NSFW Integration   | Gaps — Housing, Weather, Social, Disease                           | Medium | ✅ Complete                 |
| Battle Integration | Gaps — Items, Social, NPC, Weather, Resolution                     | High   | ✅ Complete (`src/battle/`) |
| Data Integrity     | Phase 2 — `data_version` optimistic concurrency, `409` on mismatch | Medium | ✅ Complete                 |

## P1.5 — Accessibility

- ✅ Complete as of 2026-07-31 (focus traps, aria-live, reduced-motion, contrast, touch).

## P2 — Core Workstream (Next Work)

> Emphasis: VN mode, chat, assistant, tool calling, GM flows, GM-guided story, auth/access, gallery.
> RPG mechanics deferred to P2-later. Detailed per-tier tickets live in `../tickets/`.

| Tier     | Topic                                 | Tickets                                                                                                                                                                               | Status                                                                                                                                                        |
| -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-A     | Visual Novel Mode                     | `TASK-visual-novel-mode.md`, `TASK-vn-branching-choices.md`, `TASK-vn-dynamic-generation.md`, `TASK-vn-qa-mode.md`, `TASK-vn-scene-template-system.md`, `TASK-vn-template-actions.md` | ✅ Complete (backend + frontend, 2026-07-31); verify `bun test src/story/`                                                                                    |
| P2-B     | Chat System                           | `TASK-chat-*.md` (autorenaming, backgrounds, external-music, room-search-join, room-filters, message-search, sectioning, transfer-location, travel-party, AUX-*)                      | 🟡 In progress — autorenaming/sections/invites/filters/message-search/transfer shipped; music-linking + party-join/leave + AUX-* open                         |
| P2-C     | Assistant & Tool Calling              | `TASK-assistant-commands-extension.md`, `TASK-assistant-command-execution-intent-detection.md`, `TASK-wire-gm-service-story-mode.md`, `TASK-assistant-gm-flows-reconciliation.md`     | 🟡 In progress — slash parser/commands wired, GM role runtime effect, LLM `classifyIntent`; tool-call display + command palette open                          |
| P2-D     | GM Flows                              | `TASK-gm-shadow-notes.md`, `TASK-gm-whitenotes.md`, `TASK-assistant-gm-flows.md`                                                                                                      | 🟡 GM panels + shadow/whitenotes shipped; unified GM↔assistant view + quest-log UI open                                                                       |
| P2-Da    | GM-Guided Story Creation (user as GM) | `TASK-gm-guided-story-creation.md`                                                                                                                                                    | 🟡 Greenfield — participant type, `/guide` command, guidance panel, turn-order wiring                                                                         |
| P2-E     | Authorization & Access                | `TASK-auth-register-route.md`, `TASK-encryption-access-management.md`, `TASK-dedupe-message-access-checks.md`, `TASK-fix-message-reactions-access.md`, `TASK-authoring-creation.md`   | 🟡 Backend auth/access shipped (register/login/views, feFetch, message+reaction gating, encryption UI); MFA deferred P6+; authoring ownership indicators open |
| P2-E†    | Unify 401 Guard Helpers (debt)        | `TASK-unify-401-guard-helpers.md`                                                                                                                                                     | ✅ Shipped 2026-08-06 (`c99704c1`) — remaining handler-funneled extraction tracked in `../open.md`                                                            |
| P2-F     | Gallery                               | `TASK-gallery-minimal-image-asset-viewer.md`, `TASK-config-gallery-attachment-idempotent.md`                                                                                          | ✅ Backend + frontend; avatar-gallery visibility inheritance open                                                                                             |
| P2-G     | LoRA Discovery & Application          | `TASK-lora-discovery-application.md`                                                                                                                                                  | 🟡 Routes implemented but `.use()` commented out — wire or drop (see `../open.md`)                                                                            |
| P2-later | RPG Mechanics                         | `TASK-rpg-mechanics-dice-stats.md`, `TASK-rpg-mechanics-combat.md`, `TASK-rpg-mechanics-xp-loot.md`                                                                                   | ⏸ Deferred                                                                                                                                                    |
| P2-later | Character System                      | `TASK-character-system-p2.md`                                                                                                                                                         | ⏸ Deferred                                                                                                                                                    |
| P2-later | World & Locations                     | `epic-world-locations.md`                                                                                                                                                             | ⏸ Deferred                                                                                                                                                    |

### P2-A details — VN mode

Scene renderer, portrait manager, transition engine, typewriter, settings, CSS,
GmConfig VN fields, chat-settings UI, choice cards, QA mode, template engine +
scene/dialogue templates, transition triggers, dynamic story + choice generation,
image preloading — all shipped (`src/frontend/vn/` + `src/story/`). Open: gallery-in-scene
inheritance, `bun test src/story/` verification.

### P2-C details — Assistant & tool calling

- Slash command parser + 21 handlers wired (`messages.ts:543`, 2026-08-01).
- GM role switching UI shipped; runtime effect branches prompt on `assistantRole` (auto-gen).
- LLM `classifyIntent` wired (short-reply, 2026-08-05); rule `detectIntent` is dead code (removed — see `../open.md`).
- Open: tool-call result display, command palette expansion (summarize/rewrite/translate), assistant↔GM interface reconciliation, GM config type authoring (human/hybrid).

### P2-E details — Auth & access

- Auth routes + views: `src/routes/auth.ts` (login/register/demo-login/logout/me), `src/views/{login,register}.html`, `fe-fetch.ts` (CSRF + 401 redirect).
- Access: message + reaction gated via `checkChatAccess`; per-chat encryption key + key-mgmt UI + chat-list 🔒 badge; 401 guards unified (`requireUserId` canonical).
- MFA (TOTP) deferred to P6+ (2026-08-05, local-only auth).
- Open: authoring/creation ownership indicators; `world/location` access checks (see `../open.md`).

## P3 — Core Foundation (0.1.0 value tiers)

> **0.1.0 scope = highest-value features.** P3→P5 follow this list; non-value work sits
> in P6+ (`../open.md`) unless it blocks these tiers. "P4/P5" workstreams below carry the
> **open remainder** of each P3 row (the status column is the summary; the P4/P5 sections
> list what still needs doing to close the row).

| #  | Value feature                                           | Status                 | Where / next                                                                                                                                |
| -- | ------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | User registration                                       | 🟡 partial             | `POST /api/auth/register` ✅; register frontend page pending                                                                                |
| 2  | User authentication                                     | 🟡 partial             | login/logout/demo-login/`/me` ✅; `/api/sessions` pending; MFA deferred P6+                                                                 |
| 3  | Correct access (chats/assets/worlds/locations)          | 🟢 core / 🟡 gaps      | actor ownership; 401 guards unified; message/reaction checks ✅; **world/location access checks SKIPPED 2026-08-06** (merge-risk — revisit) |
| 4  | Encryption + compression flow                           | ✅ wired               | browser AES-256-GCM; `pipeline.ts` messages + asset encrypt/decrypt; per-chat key + 🔒 badge (2026-08-06)                                   |
| 5  | Chats — all 9 types                                     | 🟡 P2-B                | autorenaming/sections/invites/filters/message-search/transfer ✅                                                                            |
| 6  | NSFW features, prompting, opt-in, sfw/nsfw caps         | 🟢 core / 🟡 UI        | runtime config + enforcement ✅; audit-log UI + consent display ✅ (2026-08-06); character 5-tier rating UI open                            |
| 7  | Metadata extraction + captioning                        | 🟢 done                | regex pipeline + caption-route                                                                                                              |
| 8  | i18n                                                    | 🟢 done                | `ctx.t` + locales ✅; frontend strings + locale switcher ✅ (2026-08-06)                                                                    |
| 9  | Visual novel mode                                       | ✅ complete            | `src/frontend/vn/` + `src/story/`; gallery-in-scene inheritance open                                                                        |
| 10 | Gallery + (image) asset preview                         | 🟢 backend+frontend    | `gallery.ts` + `assetRoutes` ✅                                                                                                             |
| 11 | User + admin panels, settings, fine-tuning              | 🟡 partial             | admin user mgmt ✅; fine-tuning UI / provider health pending                                                                                |
| 12 | (Side panels) without leaving chat                      | 🟡 partial             | chat-settings modal ✅; in-chat asset preview + linkage panel pending                                                                       |
| 13 | Chat settings menus — templates, tuning                 | 🟡 partial             | setup-template selector ✅; detailed tuning frontend open                                                                                   |
| 14 | Character/world/location flows                          | 🟡 partial             | character-io ✅; world/location creation + export/import menus pending                                                                      |
| 15 | LLM support (chat/captioning/intent/embeddings)         | 🟢 chat/caption/intent | providers ✅; `classifyIntent` wired; embeddings greenfield                                                                                 |
| 16 | Assistant creative tooling                              | 🟡 partial             | command buttons + parser ✅; tool-call UI + creation wizards pending                                                                        |
| 17 | Frontend fully wired                                    | 🟡 ongoing             | menus/modals/side-menus/documentation                                                                                                       |
| —  | IO: import/export (characters/worlds/locations/stories) | 🟡 partial             | JSON char import ✅; PNG/YAML/TOML/CHARX + world/loc/story export ✅ (2026-08-06)                                                           |
| —  | Stop generation (chat/VN)                               | 🟢 shipped             | chat abort/cancel + VN in-scene stop overlay (2026-08-06)                                                                                   |
| —  | Notifications + center                                  | 🟢 shipped             | SSE + unread badge + center UI + per-type mute (2026-08-06)                                                                                 |
| —  | Filtering & search                                      | 🟡 partial             | chat room filters + message search ✅; world/location search pending                                                                        |
| —  | Memory injection (high priority)                        | 🟢 per-viewer ✅       | `memorySection` 1024-token budget (2026-08-01); cross-actor test shipped                                                                    |
| —  | Template injection (high priority)                      | 🟢 shipped             | `LLM_PROMPT_DEFAULTS` + `resolveSystemPrompt`; registry impl pending                                                                        |

## P4 — Core Experience (open remainder of P3 rows)

- [ ] Memory + template injection UX — memory selection UI (mid-chat, pinning); prompt-template registry (P3 memory/template rows)
- [ ] Character/world/location flows — multi-format import, creation + settings menus, mood & happiness meter (P3 #14)
- [ ] Assistant tooling — tool-call display, creation wizards, `/commands` tiered access (P3 #16 / P2-C)
- [ ] LLM providers — Anthropic/Ollama/Bedrock (embeddings foundation) (P3 #15)
- [ ] Assets — signed URLs; asset storage compression flow (P3 #10)
- [ ] Fine-tuning experience — provider health panel; fine-tuning UI for chat/persona/character (P3 #11)
- [ ] NSFW — character 5-tier rating runtime enforcement (P3 #6)
- [ ] Chat UI — group chat, GM panels + quest log, story-mode frontend (P2-B/P2-D) — message search ✅, transfer/location ✅

## P5 — Wiring, Search & Polish (release-scoped)

- [x] IO (export/import) ✅; Stop generation ✅; Notification center ✅; chat message search ✅
- [ ] Frontend wiring — all menus/modals/side-menus/documentation linkage; register page; in-chat asset preview + linkage; assistant panel; message actions UI (see P4/P2 tiers)
- [ ] **Implemented → wired** — wire/drop LoRA routes (P2-G); swipe-variant placeholder; GM role runtime effect committed (not just "works locally"). ~~dead `detectIntent`~~ ✅ removed (see `../open.md`).

## Post-P3 — Road to Happy 0.1.0

`package.json` already declares `version: 0.1.0`. "Happy 0.1.0" = Gate C **and** the release-hardening below all green, then a signed tag + release notes.

### Definition of "happy"

- **Gate C** — VN, chat, assistant+tool calling, GM flows, GM-guided story, auth/access, gallery usable.
- **Gate D** — P3–P5 0.1.0 value tiers operational; P6+ non-blocking.
- **`bun run check` 17/17 green** — 2 red gates are pre-existing debt, not feature work.
- **e2e browser suite stable** — today ~51/85; auth redirect-loop + page-load timeouts.
- **No committed-state-only gates** — GM role runtime effect must be committed, not just "works locally".

### Open → close (blocking release)

- [ ] **Lint-ts debt** — ~261 errors / 291 pre-existing files. Refactor tickets; gate → 16/17.
- [ ] **Size-strict debt** — 10 pre-existing files >250L. Split or gate-exempt; → 17/17.
- [ ] **e2e browser stabilization** — kill auth redirect-loop (`/views/login?redirect=<nested login>`), fix page-load timeouts.
- [ ] **Unwired/leftover close-out** — wire/drop LoRA routes, swipe placeholder, GM-role commit (see P5 "Implemented → wired").
- [ ] **Release artifacts** — `docs/meta/release-process.md`, signed tag `v0.1.0`, changelog/release notes.

### Hardening (before tagging, non-blocking)

- memorySection cross-actor integration test — ✅ shipped (`src/assistant/prompt/sections/memories.test.ts`)
- AUX queue M5–M6 — M5 ModerationHook safety ✅ shipped (2026-08-06); M6 AUX telemetry open
- World timeline §5.3 forward-event steering + §5.4 cross-story convergence (cluster B greenfield)
- Frontend gaps in P2-B/C/D/E (music linking, party join/leave, quest-log UI, tool-call display, avatar-gallery visibility inheritance)
- `.plan/open-items.md` — resolved: consolidated into `.plan/backlog/open.md` (2026-08-06)

## Milestone Gates

| Gate   | Trigger | Criteria                                                                                                       |
| ------ | ------- | -------------------------------------------------------------------------------------------------------------- |
| Gate A | Post-P0 | Observability + testing stable; Data Integrity 1; NSFW moderation live; shared schemas enforced                |
| Gate B | Post-P1 | Import/Export + Admin with encryption; NSFW + Battle integrations; Data Integrity 2; memory tiers + cross-chat |
| Gate C | Post-P2 | VN wired; chat functional; assistant + tool calling; GM flows; GM-guided story; auth/access; gallery usable    |
| Gate D | Post-P3 | P3–P5 value tiers operational; P6+ non-blocking                                                                |
