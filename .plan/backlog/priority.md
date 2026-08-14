# Priority — Workstack & 0.1.0 Value Tiers (P0–P6+)

> **Last updated:** 2026-08-14. Holds the **entire priority ladder** P0→P6+. `../open.md`
> holds debt & deferred work and the in-flight/decision queue (remaining row W3 — push).
> Non-value work sits in `../open.md` unless it blocks these tiers.
>
> **Since 2026-08-14 refresh:** Gate C core shipped + verified on `dev` (2026-08-12) —
> tool-call UI, register page, prompt registry, GM panels, quest log, world/location
> access; size-strict debt closed (only red gate left: lint-ts); **item-systems backend
> wiring 10/15 + docs-reconciliation epic both merged to `dev` 2026-08-14**
> (worktrees `rpg-wire-routes` + `docs-reconcile`).

## Status header

P0 ✅ · P1 ✅ · P1.5 ✅ · P2 🟡 in progress · Regex ✅ · P3–P5 → 0.1.0 value tiers
(§ P3–P5 below) · P6+ → `../open.md` · Gate C core ✅ (GM-guided story P2-Da greenfield).

## P0 — Critical Path (Blocking)

| Area           | Item                                                                                                                                   | Effort | Status                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Data Integrity | Phase 1 — config guards (reject `sqlite` when `INSTANCE_COUNT > 1`, warn on network FS WAL, fix stale MySQL claim in architecture doc) | Low    | ✅ Complete (`src/config/load.ts`)                                                                                                    |
| NSFW           | Moderation Safety Infrastructure — gate, consent, audit, flagging                                                                      | Medium | ✅ Complete — runtime config + live enforcement + mood-shift + audit-log UI + consent display (2026-08-06)                            |
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

> Emphasis: VN mode, chat, assistant, tool calling, GM flows, GM-guided story, auth/access,
> gallery. RPG mechanics deferred to P2-later — **except the item-systems backend wiring
> which merged to `dev` 2026-08-14 from worktree `rpg-wire-routes`** (see P2-later row + `epic-rpg-wiring-phase3.md`).
> Detailed per-tier tickets live in `../tickets/`.

| Tier     | Topic                                 | Tickets                                                                                                                                                                               | Status                                                                                                                                                        |
| -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-A     | Visual Novel Mode                     | `TASK-visual-novel-mode.md`, `TASK-vn-branching-choices.md`, `TASK-vn-dynamic-generation.md`, `TASK-vn-qa-mode.md`, `TASK-vn-scene-template-system.md`, `TASK-vn-template-actions.md` | ✅ Complete (backend + frontend, 2026-07-31); verify `bun test src/story/`                                                                                    |
| P2-B     | Chat System                           | `TASK-chat-*.md` (autorenaming, backgrounds, external-music, room-search-join, room-filters, message-search, sectioning, transfer-location, travel-party, AUX-*)                      | 🟡 In progress — autorenaming/sections/invites/filters/message-search/transfer shipped; music-linking + party-join/leave + group-chat matrix UI open           |
| P2-C     | Assistant & Tool Calling              | `TASK-assistant-commands-extension.md`, `TASK-assistant-command-execution-intent-detection.md`, `TASK-wire-gm-service-story-mode.md`, `TASK-assistant-gm-flows-reconciliation.md`     | 🟡 In progress — slash parser/commands, GM role runtime effect, LLM `classifyIntent`, **tool-call display ✅ (2026-08-12)**; command palette + creation wizards + tiered `/commands` open |
| P2-D     | GM Flows                              | `TASK-gm-shadow-notes.md`, `TASK-gm-whitenotes.md`, `TASK-assistant-gm-flows.md`                                                                                                      | 🟡 **GM panels ✅ + quest log ✅ (2026-08-12)** + shadow/whitenotes shipped; unified GM↔assistant view open                                                                                  |
| P2-Da    | GM-Guided Story Creation (user as GM) | `TASK-gm-guided-story-creation.md`                                                                                                                                                    | 🟡 Greenfield — participant type, `/guide` command, guidance panel, turn-order wiring (**Gate C remainder**)                                                   |
| P2-E     | Authorization & Access                | `TASK-auth-register-route.md`, `TASK-encryption-access-management.md`, `TASK-dedupe-message-access-checks.md`, `TASK-fix-message-reactions-access.md`, `TASK-authoring-creation.md`   | 🟡 **Backend auth/access shipped incl. world/location access ✅ (2026-08-12)**; MFA deferred P6+; authoring ownership indicators open                            |
| P2-E†    | Unify 401 Guard Helpers (debt)        | `TASK-unify-401-guard-helpers.md`                                                                                                                                                     | ✅ Shipped 2026-08-06 (`c99704c1`) — remaining handler-funneled extraction tracked in `../open.md`                                                            |
| P2-F     | Gallery                               | `TASK-gallery-minimal-image-asset-viewer.md`, `TASK-config-gallery-attachment-idempotent.md`                                                                                          | ✅ Backend + frontend; avatar-gallery visibility inheritance open                                                                                             |
| P2-G     | LoRA Discovery & Application          | `TASK-lora-discovery-application.md`                                                                                                                                                  | 🟡 Routes implemented but `.use()` commented out — wire or drop (see `../open.md`)                                                                            |
| P2-later | RPG Mechanics (wire phase-3)          | `TASK-rpg-mechanics-dice-stats.md`, `TASK-rpg-mechanics-combat.md`, `TASK-rpg-mechanics-xp-loot.md`, `TASK-wire-*-routes.md` × 8, `TASK-consolidate-quest-engines.md`                 | 🟡 **Item-systems backend 10/15 merged 2026-08-14 (`rpg-wire-routes`)**; remaining unwired services → `epic-rpg-wiring-phase3.md`                               |
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
- LLM `classifyIntent` wired (short-reply, 2026-08-05); rule `detectIntent` removed (see `../open.md`).
- **Tool-call UI shipped 2026-08-12** — `messages.tool_calls` persisted (migration 037),
  returned by read API, rendered as collapsible blocks, live via `tool_call` SSE.
- Open: command palette expansion (summarize/rewrite/translate), creation wizards,
  `/commands` tiered access, assistant↔GM interface reconciliation, GM config type
  authoring (human/hybrid).

### P2-E details — Auth & access

- Auth routes + views: `src/routes/auth.ts` (login/register/demo-login/logout/me),
  `src/views/{login,register}.html`, `fe-fetch.ts` (CSRF + 401 redirect).
- Access: message + reaction gated via `checkChatAccess`; per-chat encryption key +
  key-mgmt UI + chat-list 🔒 badge; 401 guards unified (`requireUserId` canonical).
- **World/location access enforced 2026-08-12** — `requireWorldAccess`/`requireWorldOwner`
  on all locations handlers (stale "SKIPPED" claim from 2026-08-06 superseded).
- MFA (TOTP) deferred to P6+ (2026-08-05, local-only auth); `/api/sessions` pending.
- Open: authoring/creation ownership indicators.

## P3 — Core Foundation (0.1.0 value tiers)

> **0.1.0 scope = highest-value features.** P3→P5 follow this list; non-value work sits
> in P6+ (`../open.md`) unless it blocks these tiers. "P4/P5" workstreams below carry the
> **open remainder** of each P3 row (the status column is the summary; the P4/P5 sections
> list what still needs doing to close the row).

| #  | Value feature                                           | Status                 | Where / next                                                                                                                                |
| -- | ------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | User registration                                       | 🟢 complete            | `POST /api/auth/register` ✅ + `/register` page ✅ (2026-08-12)                                                                             |
| 2  | User authentication                                     | 🟡 partial             | login/logout/demo-login/`/me` ✅; `/api/sessions` pending; MFA deferred P6+                                                                 |
| 3  | Correct access (chats/assets/worlds/locations)          | 🟢 core                | actor ownership; 401 guards unified; message/reaction checks ✅; **world/location access enforced ✅ (2026-08-12)**                          |
| 4  | Encryption + compression flow                           | ✅ wired               | browser AES-256-GCM; `pipeline.ts` messages + asset encrypt/decrypt; per-chat key + 🔒 badge (2026-08-06)                                   |
| 5  | Chats — all 9 types                                     | 🟡 P2-B                | autorenaming/sections/invites/filters/message-search/transfer ✅                                                                            |
| 6  | NSFW features, prompting, opt-in, sfw/nsfw caps         | 🟢 core / 🟡 UI        | runtime config + enforcement ✅; audit-log UI + consent display ✅ (2026-08-06); character 5-tier rating UI open                            |
| 7  | Metadata extraction + captioning                        | 🟢 done                | regex pipeline + caption-route                                                                                                              |
| 8  | i18n                                                    | 🟢 done                | `ctx.t` + locales ✅; frontend strings + locale switcher ✅ (2026-08-06)                                                                    |
| 9  | Visual novel mode                                       | ✅ complete            | `src/frontend/vn/` + `src/story/`; gallery-in-scene inheritance open                                                                        |
| 10 | Gallery + (image) asset preview                         | 🟢 backend+frontend    | `gallery.ts` + `assetRoutes` ✅; signed URLs open (P4)                                                                                      |
| 11 | User + admin panels, settings, fine-tuning              | 🟡 partial             | admin user mgmt ✅; fine-tuning UI / provider health pending                                                                                |
| 12 | (Side panels) without leaving chat                      | 🟡 partial             | chat-settings modal ✅; in-chat asset preview + linkage panel pending                                                                       |
| 13 | Chat settings menus — templates, tuning                 | 🟡 partial             | setup-template selector ✅; prompt-template registry `src/prompts/registry.ts` ✅ (2026-08-12); detailed tuning frontend open                |
| 14 | Character/world/location flows                          | 🟡 partial             | character-io ✅; world/location creation + export/import menus pending                                                                      |
| 15 | LLM support (chat/captioning/intent/embeddings)         | 🟢 chat/caption/intent | providers ✅; `classifyIntent` wired; embeddings greenfield                                                                                 |
| 16 | Assistant creative tooling                              | 🟡 partial             | command buttons + parser ✅; **tool-call UI ✅ (2026-08-12)**; creation wizards pending                                                     |
| 17 | Frontend fully wired                                    | 🟡 ongoing             | menus/modals/side-menus/docs — docs reconciliation **merged 2026-08-14** (`docs-reconcile`); 17 broken internal md links open (see `../open.md`)                            |
| —  | IO: import/export (characters/worlds/locations/stories) | 🟡 partial             | JSON char import ✅; PNG/YAML/TOML/CHARX + world/loc/story export ✅ (2026-08-06)                                                           |
| —  | Stop generation (chat/VN)                               | 🟢 shipped             | chat abort/cancel + VN in-scene stop overlay (2026-08-06)                                                                                   |
| —  | Notifications + center                                  | 🟢 shipped             | SSE + unread badge + center UI + per-type mute (2026-08-06)                                                                                 |
| —  | Filtering & search                                      | 🟡 partial             | chat room filters + message search ✅; world/location search pending                                                                        |
| —  | Memory injection (high priority)                        | 🟢 per-viewer ✅       | `memorySection` 1024-token budget (2026-08-01); cross-actor test shipped                                                                    |
| —  | Template injection (high priority)                      | 🟢 shipped             | `LLM_PROMPT_DEFAULTS` + `resolveSystemPrompt`; registry impl `src/prompts/registry.ts` ✅ (2026-08-12); UX pending (P4)                     |

## P4 — Core Experience (open remainder of P3 rows)

- [ ] Memory + template injection UX — memory selection UI (mid-chat, pinning); template injection UX (registry impl shipped)
- [ ] Character/world/location flows — multi-format import, creation + settings menus, mood & happiness meter (P3 #14)
- [ ] Assistant tooling — creation wizards, `/commands` tiered access (tool-call display ✅ 2026-08-12) (P3 #16 / P2-C)
- [ ] LLM providers — Anthropic/Ollama/Bedrock (embeddings foundation) (P3 #15)
- [ ] Assets — signed URLs (compression flow ✅ 2026-08-12) (P3 #10)
- [ ] Fine-tuning experience — provider health panel; fine-tuning UI for chat/persona/character (P3 #11)
- [ ] NSFW — character 5-tier rating runtime enforcement (P3 #6)
- [ ] Chat UI — group chat matrix UI, unified GM↔assistant view (GM panels ✅ + quest log ✅ 2026-08-12) (P2-B/P2-D)

## P5 — Wiring, Search & Polish (release-scoped)

- [x] IO (export/import) ✅; Stop generation ✅; Notification center ✅; chat message search ✅; swipe-variant ✅ (implemented + tested); GM role runtime effect ✅ (committed on `dev`)
- [ ] Frontend wiring — all menus/modals/side-menus/documentation linkage; in-chat asset preview + linkage; assistant panel; message actions UI (see P4/P2 tiers)
- [ ] **Implemented → wired** — wire/drop LoRA routes (P2-G); SSE refactor ✅ (merged `082c20cf`, row W4 resolved in `../open.md`); remaining RPG services → `epic-rpg-wiring-phase3.md`; ~~dead `detectIntent`~~ ✅ removed (see `../open.md`)

## Post-P3 — Road to Happy 0.1.0

`package.json` already declares `version: 0.1.0`. "Happy 0.1.0" = Gate C **and** the
release-hardening below all green, then a signed tag + release notes. Consolidated
tracking: `epic-release-010.md`.

### Definition of "happy"

- **Gate C** — VN, chat, assistant+tool calling, GM flows, GM-guided story, auth/access,
  gallery usable. **Core shipped + verified 2026-08-12; remainder: GM-guided story (P2-Da)**.
- **Gate D** — P3–P5 0.1.0 value tiers operational; P6+ non-blocking.
- **`bun run check` 17/17 green** — 1 red gate remains (lint-ts; size-strict closed 2026-08-12).
- **e2e browser suite stable** — today ~51/85; auth redirect-loop + page-load timeouts.
- **No committed-state-only gates** — GM role runtime effect ✅ committed on `dev`
  (2026-08-07+); no remaining "works locally" claims.

### Open → close (blocking release)

- [ ] **Lint-ts debt** — ~196 warnings / 291 pre-existing files → `check` 16/17 (last red gate). Refactor tickets; gate → 17/17.
- [x] **Size-strict debt** — ✅ closed 2026-08-12 (0 files over 250L).
- [ ] **e2e browser stabilization** — kill auth redirect-loop (`/views/login?redirect=<nested login>`), fix page-load timeouts.
- [ ] **Unwired/leftover close-out** — wire/drop LoRA routes, RPG services phase-3 (see `epic-rpg-wiring-phase3.md`); SSE refactor ✅ committed (`082c20cf`; row W4 resolved in `../open.md`).
- [ ] **Release artifacts** — `docs/meta/release-process.md`, signed tag `v0.1.0`, changelog/release notes, **push `dev`→`origin/dev`** (39 commits; row W3 in `../open.md`).

### Hardening (before tagging, non-blocking)

- memorySection cross-actor integration test — ✅ shipped (`src/assistant/prompt/sections/memories.test.ts`)
- AUX queue M5–M6 — M5 ModerationHook safety ✅ shipped (2026-08-06); M6 AUX telemetry open
- World timeline §5.3 forward-event steering + §5.4 cross-story convergence (cluster B greenfield)
- Frontend gaps in P2-B/C/D/E (music linking, party join/leave, unified GM↔assistant view, creation wizards, avatar-gallery visibility inheritance)
- `.plan/open-items.md` — resolved: consolidated into `.plan/backlog/open.md` (2026-08-06)

## 0.1.0 Quick Wins — Emergent-Platform Analysis (2026-08-14)

> Features that **land in 0.1.0** (no P6+ blocker), drawn from the emergent-platform
> sweep (inspiration: Kindroid, Nomi, SillyTavern QR, RisuAI dynamic-*, Inworld AI,
> generative-agents, Luma/Runway). Mapped to existing epics, in-flight P2–P5 work,
> and matrix gaps G18–G23. Full analysis: `docs/ideas/emergent-platform-landscape-2026.md`.
>
> These build on infrastructure **already shipped** — slash-command parser (21 handlers),
> tool-call SSE (migration 037), memorySection (1024-token), regex extraction pipeline,
> emotion avatars, prompt registry, VN mode, item-systems backend.

| # | Capability | Builds on | Effort | Dependencies | Matrix gap |
| -- | ---------- | --------- | ------ | ------------ | ---------- |
| 1 | **Quick-Reply / event-driven automation** — button sets + auto-execute on startup/user/ai events (SillyTavern QR, RisuAI dynamic-* inspiration) | Slash-command parser + 21 handlers (`messages.ts:543`), regex pipeline | Med | None — pure frontend + thin route | G22 |
| 2 | **Dynamic memory writes via tool-call** — assistant emits durable memory note mid-response (RisuAI dynamic-memory inspiration) | Tool-call SSE (`messages.tool_calls`, migration 037), memorySection | Med | Memory selection UI (item 5) for UX | G23 |
| 3 | **Emotion-reactive portraits** — extend existing emotion avatars with `<Emotion>` tag + per-emotion sprite swap (RisuAI/SillyTavern inspiration) | Emotion avatars (shipped), assets polymorphic linking, `status_effects` | Low–Med | Per-character emotion images in gallery | G21 (partial) |
| 4 | **Regex output-transform phase split** — extend regex pipeline from single-phase to 4-phase (editinput/output/process/display) (RisuAI 4-phase inspiration) | Regex extraction pipeline (`src/regex/`) | Low–Med | None — pure logic + frontend toggle | G22 (partial) |
| 5 | **Memory selection UI — mid-chat pinning** — select/memory-pin/purge UI in chat sidebar (emergent ambient-memory trend: Kindroid, Nomi, Zhumu) | MemorySection, cross-chat memory (shipped), B8 in-flight | Low–Med | B8 already in-flight — this is the UX layer | G23 (partial) |
| 6 | **Template injection UX** — registry impl shipped (`src/prompts/registry.ts`) → slider/select UI for prompt templates in chat settings | Prompt registry (P3 #13, shipped 2026-08-12), chat-settings modal | Low | None — frontend only | — |
| 7 | **In-chat asset preview + linkage side panel** — gallery assets viewable/linkable without leaving chat (P4/P5 row) | Gallery + assetRoutes (shipped), chat-side-panel UI | Med | Signed URLs (C6 in-flight) | G21 (partial) |
| 8 | **Creation wizards (assistant)** — character/world/location/item creation wizard flows via assistant (P2-C/P4 in-flight) | Assistant tool-call UI, creation-wizard prompts, assistant commands | Med | Assistant commands extension (C3 in-flight) | — |
| 9 | **GM-guided story (P2-Da)** — the one Gate-C remainder: participant type, `/guide` command, guidance panel, turn-order wiring | GM panels + quest log (shipped), slash-command parser | Med–High | None — greenfield | — |
| 10 | **Vector RAG / embeddings foundation** — first-class embeddings support for semantic memory recall (candidate #1, SillyTavern DataBank inspiration) | LLM providers (P3 #15 embeddings greenfield), memorySection | Med–High | Provider: OpenAI/local embedding endpoint | — |
| 11 | **Asset-consistency reference conditioning** — keep character look across generated images via reference image (Luma/Runway/Krea inspiration) | Emotion avatars + text2img providers, asset system | Med–High | Provider: img2img with reference conditioning | G21 |
| 12 | **Chat-type matrix UI remainder** — group-chat UI + unified GM↔assistant view (P2-B/P2-D in-flight) | GM panels (shipped), chat-types backend | Med | GM↔assistant reconciliation (E1 open) | — |

**0.1.0 sequencing recommendation (by ROI):**
- **First wave** (low effort, high delight): items 3, 4, 6 — pure logic/frontend, no new infra
- **Second wave** (medium effort, high user-value): items 1, 2, 5 — extends shipped slash/automation infra
- **Third wave** (medium effort, gate-critical): items 7, 8, 12 — frontend wiring to close P4/P5
- **Must-land** (release-blocking): item 9 (GM-guided story, Gate-C remainder)
- **P4 foundation** (medium-high, starts embeddings): item 10 — don't defer past 0.1.0 if feasible
- **P6+ pull candidates** (if time permits): items 11, 12 — asset-consistency + chat matrix

**Cross-ref:** matrix gaps G21 (asset-consistency), G22 (event-driven automation), G23 (dynamic memory) are the emergent-sweep quick wins with **no P6+ blocker** — all achievable in 0.1.0.

## Milestone Gates

| Gate   | Trigger | Criteria                                                                                                       | Status |
| ------ | ------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| Gate A | Post-P0 | Observability + testing stable; Data Integrity 1; NSFW moderation live; shared schemas enforced                | ✅     |
| Gate B | Post-P1 | Import/Export + Admin with encryption; NSFW + Battle integrations; Data Integrity 2; memory tiers + cross-chat | ✅     |
| Gate C | Post-P2 | VN wired; chat functional; assistant + tool calling; GM flows; GM-guided story; auth/access; gallery usable    | 🟡 core ✅ 2026-08-12; **GM-guided story (P2-Da) greenfield** |
| Gate D | Post-P3 | P3–P5 value tiers operational; P6+ non-blocking                                                                | ⬜     |
