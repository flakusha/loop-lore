# High-Value — 0.1.0 Value Tiers (P3–P5) & Release Gate

> **Last updated:** 2026-08-06 (consolidated from `immediate.md` / `backlog.md` into
> `.plan/backlog/`). P3→P5 follow the **0.1.0 highest-value feature list** below.
> Non-value work sits in P6+ (`../open.md`) unless it blocks these tiers.

## 0.1.0 scope = highest-value features

User registration/auth, correct access (chats/assets/worlds/locations), encryption +
compression flow, all 9 chat types, NSFW features/prompting/opt-in/sfw-nsfw caps, metadata
extraction + captioning, i18n, VN mode, gallery + asset preview, user/admin panels +
settings + fine-tuning, in-chat side panels, chat settings menus, character/world/location
flows, LLM support (chat/captioning/intent/embeddings), assistant creative tooling, IO
(import/export), stop-generation, notifications center, filtering/search, and memory +
template injection (high priority — key for chats).

## P3 — Core Foundation

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
| 17 | Implemented → must be wired                             | 🟡 ongoing             | LoRA routes, dead `detectIntent`, swipe placeholder                                                                                         |
| 18 | Frontend fully wired                                    | 🟡 ongoing             | menus/modals/side-menus/documentation                                                                                                       |
| —  | IO: import/export (characters/worlds/locations/stories) | 🟡 partial             | JSON char import ✅; PNG/YAML/TOML/CHARX + world/loc/story export ✅ (2026-08-06)                                                           |
| —  | Stop generation (chat/VN)                               | 🟢 shipped             | chat abort/cancel + VN in-scene stop overlay (2026-08-06)                                                                                   |
| —  | Notifications + center                                  | 🟢 shipped             | SSE + unread badge + center UI + per-type mute (2026-08-06)                                                                                 |
| —  | Filtering & search                                      | 🟡 partial             | chat room filters + message search ✅; world/location search pending                                                                        |
| —  | Memory injection (high priority)                        | 🟢 per-viewer ✅       | `memorySection` 1024-token budget (2026-08-01); cross-actor test shipped                                                                    |
| —  | Template injection (high priority)                      | 🟢 shipped             | `LLM_PROMPT_DEFAULTS` + `resolveSystemPrompt`; registry impl pending                                                                        |

## P4 — Core Experience (not-yet-done value workstreams)

- [x] Chats UI (group chat, GM panels + quest log, story-mode frontend) — message search ✅, transfer/location ✅
- [x] NSFW — audit-log UI + consent display ✅; character NSFW 5-tier rating runtime enforcement
- [ ] Memory + template injection UX — memory selection UI (mid-chat, pinning); prompt-template registry
- [ ] Character/world/location flows — multi-format import, creation + settings menus, mood & happiness meter
- [ ] Assistant tooling — tool-call display, creation wizards, `/commands` tiered access
- [ ] LLM providers — Anthropic/Ollama/Bedrock (embeddings foundation)
- [ ] Assets — signed URLs; asset storage compression flow
- [ ] Fine-tuning experience — provider health panel; fine-tuning UI for chat/persona/character

## P5 — Wiring, Search & Polish

- [x] IO (export/import) ✅; Stop generation ✅; Notification center ✅; chat message search ✅
- [ ] Frontend wiring — all menus/modals/side-menus/documentation linkage; register page; in-chat asset preview + linkage; assistant panel; message actions UI
- [ ] Implemented → wired — LoRA routes, dead `detectIntent`, swipe-variant placeholder, GM role runtime effect

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
- [ ] **Unwired/leftover close-out** — wire/drop LoRA routes, remove dead `detectIntent`, swipe placeholder, GM-role commit.
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
