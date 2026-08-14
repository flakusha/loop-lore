# Open — In-Flight, Debt, Unwired Code & Deferred

> **Last updated:** 2026-08-14 (dead code review pass). Consolidated from `open.md` + `active.md` into this single
> doc (the former `active.md`'s decision queue + recent-wiring log now live in § In-flight
> below). Holds what is **currently in flight / needing a decision / open debt / deferred
> (P6+)**. The priority ladder P0→P6+ lives in `../priority.md`.
>
> **Context recovery note (2026-08-14):** this refresh reflects (a) Gate C sub-items
> verified shipped on `dev` 2026-08-12, (b) **both worktrees merged** — item-systems
> backend wiring (`rpg-wire-routes`) and docs reconciliation (`docs-reconcile`) landed on
> `dev`, (c) SSE refactor already committed (`082c20cf`), (d) `dev` ahead of `origin/dev`
> by 39 commits (unreleased — push still pending, row W3 below). The only remaining worktree
> row is W3 (push); W1/W2/W4 resolved.

## Status header

P0 ✅ · P1 ✅ · P1.5 ✅ · P2 🟡 in progress (Gate C core shipped 2026-08-12; item-systems
wiring + docs reconciliation **merged 2026-08-14**) · Regex ✅ · P3–P5 → 0.1.0 value tiers
(see `../priority.md`) · Gate C: core done, GM-guided story (P2-Da) greenfield.

## In-flight / decision queue — rows needing a finalize-vs-defer call

> When a row is decided: finalize → check off in its `../priority.md` tier; defer → keep
> here in the Deferred section. Rows already shipped or explicitly deferred are removed.
> Rows that mirror a `../priority.md` tier or a section below are removed here.

| ID  | Item                                                                                    | Ticket / where                               | Recommend                       | Decision              |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------- | --------------------- |
| A5  | Lint-ts debt → `check` lint gate red — 655 problems (64 errors + 591 warnings), **last red gate**. Plan: `TASK-PLAN-LINT-TS-DEBT.md` (44 errors auto-fixable, 20 manual) | `../priority.md` "Open → close" + ticket | ▲ now (release-blocking) |  |
| A7  | e2e browser stabilization (auth redirect-loop)                                          | `../priority.md` "Open → close"              | ▲ now                           |                       |
| A8  | Unwired-code close-out (LoRA wire/drop + remaining RPG services)                        | `../priority.md` P5 + `epic-rpg-wiring-phase3.md` | ▲ now                     |                       |
| A9  | Release artifacts (release-process, tag `v0.1.0`, changelog) + push `dev`→`origin/dev`  | `../priority.md` "Open → close"              | ▲ now                           |                       |
| B8  | Memory selection UI (mid-chat, pinning) + prompt-template UX                           | `../priority.md` P4                          | ▲ now                           | 🟡 partial (prompt-template read-only preview shipped 2026-08-14; memory-selection UI open) |
| B10 | Fine-tuning UX (provider health, fine-tune UI)                                         | `../priority.md` P4                          | ▲ now                           |                       |
| C1  | Chat-type matrix UI remainder (group-chat UI, unified GM↔assistant view)               | `../priority.md` P2-D                        | ▲ now                           | 🟡 partial (participant panel shipped 2026-08-14 — list/add/remove + talkativity/initiative; turn-order indicator + side-channels remain) |
| C2  | NSFW 5-tier character rating runtime enforcement                                       | `../priority.md` P4                          | ▲ now                           |                       |
| C4  | Char/world/location flows (multi-format import, creation + export/import menus)        | `../priority.md` P4                          | ▲ now                           |                       |
| C5  | LLM providers (Anthropic/Ollama/Bedrock)                                               | `../priority.md` P4                          | ▲ now                           |                       |
| C6  | Assets signed URLs (compression flow ✅ 2026-08-12)                                    | `../priority.md` P4                          | ▲ now                           |                       |
| C7  | Group-chat VN party join/leave                                                         | `TASK-travel-party-migration.md`             | ▲ now                           |                       |
| D1  | Assistant panel in chat sidebar                                                        | `../priority.md` P2-C                        | ▲ now                           |                       |
| D2  | Message actions UI (edit/delete/pin/react)                                             | `../priority.md` P2-C                        | ▲ now                           |                       |
| E2  | GM-guided story (user-as-GM UI + doc) — **Gate C remainder**                           | `../priority.md` P2-Da                       | ▲ now                           |                       |
| F3  | M6 AUX telemetry (tokens/latency per call)                                              | `../priority.md` Hardening                   | ▲ now                           |                       |
| G2  | World timeline §5.3 forward-event steering + §5.4 cross-story convergence              | `epic-world-timeline*` (cluster B)           | ▲ now                           |                       |
| G6  | Avatar-gallery visibility inheritance                                                  | `../priority.md` P2-F                        | ▲ now                           |                       |
| W3  | **Push `dev` → `origin/dev`** (39 commits, Gate C + item-systems + docs reconciliation epics) | `dev` (ahead 39) | ▲ before release | |
| C3  | Assistant tooling remainder — creation wizards + tiered `/commands` (tool-call display ✅) | `../priority.md` P2-C                     | ▲ now                           | 🟡 partial (shipped: tool-call UI 2026-08-12) |
| D3  | Expand command buttons (GM role switching ✅)                                           | `../priority.md` P2-C                        | ▲ now                           | 🟡 partial             |
| E1  | Unified GM↔assistant view (GM panels ✅ + quest log ✅ 2026-08-12)                      | `../priority.md` P2-D                        | ▲ now                           | 🟡 partial             |

**Deferred (do not decide now):** F1 (9 AUX LLM enrichment tasks) · G3 (external music
linking) · G4 (authoring ownership indicators) — these sit in § Hardening / deferred
clusters below. Rows removed here: all shipped since last refresh — **B1** (register
frontend page ✅ 2026-08-12), **B7** (prompt-template registry `src/prompts/registry.ts` ✅
2026-08-12), **A6** (size-strict ✅ closed 2026-08-14 — re-cleared: chat-settings, chat-types/core, crafting/recipes split), **F2** (M5
ModerationHook ✅), **B2–B6/B9, A1–A4, A#-domain, G1** (previously resolved), **W1** (worktree
`rpg-wire-routes` ✅ merged 2026-08-14), **W2** (worktree `docs-reconcile` ✅ merged
2026-08-14), **W4** (SSE refactor ✅ committed `082c20cf`), and MFA (deferred P6+).
"Remove dead rule `detectIntent`" (D4) dropped — already Removed 2026-08-07 (see § Dead / unwired code).

**Stale/dup (no decision needed):** login page htmx — auth views already exist.

## Open / next actions (post-merge planning, 2026-08-14)

- **W3 (only worktree row left): Push `dev` → `origin/dev`** — 39 commits ahead, after
  `bun run check` + `bun test src/` gate on dev. Before release (row A9).
- **Broken internal markdown links (resolved 2026-08-14)** — the 17 dead links
  flagged pre-merge (across `docs/README.md`, `docs/spec/build-deploy.md`,
  `battle-integration.md`, `nsfw-integration.md`) are fixed: `bun run md:links` ✅
  green (196 files, 0 broken). The `docs-reconcile` merge landed the target-path
  corrections; no follow-up ticket needed.
- **dprint docs-formatting bug (fixed 2026-08-14, `d183b9d0`)** — dprint's markdown
  plugin truncated `docs/` table cell content with `…` ellipses and stripped spaces
  inside inline-code spans (`docs/reference/api.md`). This is what the prior session
  mis-attributed to "api.md backticks". Fixed by excluding `docs/**` from dprint
  (markdownlint stays the docs authority); the 2 corrupted docs files reverted to
  their lint-clean HEAD state. `format:dprint` + `md:lint` both green.
- **Gate reality corrected (2026-08-14)** — prior "remaining red gates" report was
  stale on 2 of 3: lint-ts is **655 problems (64 errors + 591 warnings)**, not
  "~196 warnings"; dprint blocker was **173-file TS trailing-comma drift**, not
  `docs/reference/api.md`. Only md-lint (84 issues/12 files) matched. Corrected
  counts now in `TASK-PLAN-LINT-TS-DEBT.md` / row A5. dprint + md-lint gates closed;
  lint-ts remains open (see A5).

## Item-systems deferred follow-ups (from `epic-item-systems-unification` backend 10/15)

> Backend wire-* work landed 2026-08-12 (10/10 tickets complete + review pass). The following
> were explicitly deferred and remain open — see `epic-item-systems-unification.md`
> § Remaining Points for full details.

| # | Deferred point | Blocks on | Where tracked |
|---|----------------|-----------|---------------|
| IS1 | Crafting station def/instance CRUD + `GET stations` route | `StationsService` (`TASK-complete-crafting-system-services`) | `TASK-wire-crafting-routes.md` |
| IS2 | Crafting attempt execution (`POST /craft`: consume materials → output, success/skill/level checks) | `CraftingProcessService` | `TASK-wire-crafting-routes.md` |
| IS3 | Crafting orders placed/fulfilled via HTTP (+ payment) | `CraftingProcessService` + TradeService (payment primitive exists) | `TASK-wire-crafting-routes.md`, `TASK-implement-trade.md` |
| IS4 | Trade offer/accept/cancel lifecycle (persistent pending exchanges) | — | `TASK-implement-trade.md` |
| IS5 | NPC trading (sell to NPC, buy from NPC inventory) | `TASK-npc-inventory-frontend` | `TASK-implement-trade.md` |
| IS6 | Trade history queryable | — | `TASK-implement-trade.md` |
| IS7 | Combat-action equipment usage + durability degradation in combat | — | `TASK-battle-item-integration.md` |

## Recent wiring (reference)

- **SSE refactor (merged `082c20cf`)** — `sse-utils.ts` extracted from
  `stream-to-client.ts`; `src/generation/generate-route/sse-utils.ts`; chat.html stream
  markup simplified (2026-08-13/14, committed on `dev`).
- **Item-systems unification backend 10/15 (merged 2026-08-14, `rpg-wire-routes`)** — single item
  taxonomy, NPC inventory → `world_items.owner_actor_id`, actor items (equip/carry/
  transfer), world items → equipment, loot persisted as world items, item-transfer event
  handler, crafting recipe CRUD, currency ledger + atomic two-sided trade, module splits
  under size gate (2026-08-12, 13 commits, merged to `dev`).
- **Gate C sub-items verified complete on `dev` (2026-08-12)** — register page
  (`/register` + `POST /api/auth/register`), prompt registry (`src/prompts/registry.ts`),
  GM panels (`chat/gm-panel.html`) + quest log (`/views/quests`), world/location access
  (`requireWorldAccess`/`requireWorldOwner` on all locations handlers), assistant
  tool-call UI (persisted `messages.tool_calls` migration 037, rendered collapsible
  blocks, live `tool_call` SSE). Worktree: `p2g-gate-c`.
- **Size-strict debt closed (2026-08-12)** — `size:strict` reports 0 files over 250L.
- **Docs reconciliation (merged 2026-08-14, `docs-reconcile`)** — docs nav link in sidebar
  (`{{docsNav}}` gated on `DOCS_ENABLED`, 10 locales), 2 dead vitepress sidebar links
  fixed, 5 new guide pages (first-chat, personas, worlds, gallery, settings) +
  rewritten getting-started; **3/4 tickets done** (fix-dangling-links, guide-how-tos,
  ui-endpoint-linkage), **1 in progress** (`TASK-docs-reconcile-implementation.md` —
  spec-vs-`src/` audit). Follow-on open: 17 broken internal markdown links
  (see § Open / next actions below).
- **AUX M5 ModerationHook safety** — shipped (2026-08-06): tokenized word-boundary
  matching, severity scoring, audit trail, non-destructive suppression.
- **Emotions** — EmotionHook emits canonical `EmotionType`; prompt `emotion` defaults +
  `detectAvatarChangeIntent` wired (2026-08-06).
- **401-guard unification** — migrated to canonical `requireUserId` (`c99704c1`).
- **Telemetry** — transport gate + `trackTelemetry()` + deduped page_view (2026-08-06).
- **World channels & invite-driven membership** — epic completed + recorded (2026-08-06).
- **Multi-instance reconciliation spec** — expanded `docs/spec/multi-instance-reconciliation.md` (2026-08-07).
- **`.plan/` root cleanup + backlog consolidation** — two-file backlog (`open.md` +
  `priority.md`) established (2026-08-07/08).

## Security & access — closed on dev (verified 2026-08-07 + 2026-08-12)

> The 2026-08-06 audit round 3 auth gaps were fixed on branch `auth-access-fixes`
> (commits `8f2a6d71` + `73cda7b9`) and **landed on `dev`** under new hashes:
> `7dc68be7` (critical bypasses) + `c78e5466` (remaining access gaps) + `c99704c1`
> (401-guard unification → canonical `requireUserId`). World/location access checks
> (formerly "SKIPPED 2026-08-06 — merge-risk") were **verified enforced 2026-08-12** on
> all locations handlers. All rows below are **closed on dev**.

| # | Item                                                                                                          | Where                              | Status                                                                        |
| - | ------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| 1 | `message-encryption.ts` returns AES-GCM key without auth — chat access bypass                                | `src/routes/message-encryption.ts` | ✅ Closed (`requireUserId`+`checkChatAccess`)                                 |
| 2 | `nsfw-moderation.ts` trusts `x-user-id` header — spoofable identity                                          | `src/routes/nsfw-moderation.ts`    | ✅ Closed (`requireUserId`+`requireAdmin`/`requireOwnOrAdmin`)                |
| 3 | `worlds.ts` allows any authed user to mutate public worlds                                                   | `src/routes/worlds.ts`             | ✅ Closed (`requireWorldOwner` on all 6 mutations)                            |
| 4 | `nsfw.ts` — no auth/ownership on NSFW data                                                                   | `src/routes/nsfw.ts`               | ✅ Closed (`requireUserId` on all handlers)                                   |
| 5 | Access gaps: chat-pins, chat-search join, vn-generate, character-emotions, chats export/participants, assets | across `src/routes/`               | ✅ Closed (`c78e5466`)                                                        |
| 6 | World/location access checks                                                                                 | worlds/locations                   | ✅ Closed — enforced on all locations handlers (verified 2026-08-12)          |
| 7 | `rpg.ts` POST endpoints missing body validation                                                              | `src/routes/rpg/` (dir)            | ✅ Resolved — file split; all 6 POST endpoints validate (verified 2026-08-08) |
| 8 | Duplicate export endpoint (`chats.ts` vs `chat-export.ts`)                                                   | `src/routes/`                      | ✅ Resolved — distinct endpoints (verified 2026-08-08)                        |

## Dead / unwired code

| #  | Item                                                                                                                                                              | Where                                                          | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | Entire transport module (~9 files) unwired                                                                                                                        | `src/transport/`                                               | 🟡 WIRE → `TASK-transport-server-wiring`: imported only by itself+tests; adapters are no-op stubs; no WS server. Server serves via Bun native HTTP/1.1+TLS (`src/server/start.ts`). Keep, revisit when real-time chat ships                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2  | Telemetry `startRetentionCleanup` never called                                                                                                                     | `src/telemetry/cleanup.ts:12`                                  | ✅ Resolved — wired in `server/start.ts:154-155` (verified 2026-08-14)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 3  | Notification prefs silent failure                                                                                                                                 | `src/notifications/service.ts:100-122`                         | ✅ Resolved — `setPrefs` throws on serialization failure; error propagates to Elysia handler (verified 2026-08-14)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 4  | Dead rule `detectIntent` (superseded by LLM `classifyIntent`)                                                                                                     | `src/assistant/intent.ts`                                      | ✅ Removed 2026-08-07 (kept `detectAvatarChangeIntent`, wired)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 5  | LoRA routes implemented but `.use()` commented out                                                                                                                | `src/generation/lora/routes.ts`                                | 🟡 Documented deferral — intentionally gated "when feature is ready for production"; wire deliberately when ready, not dead                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 6  | Swipe-variant placeholder — regen row never filled by LLM                                                                                                         | `src/chat/service.ts` + `regenerate-variant.test.ts`           | ✅ Implemented + tested — `regenerateVariant` creates sibling variant with idempotency guard (stale claim)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 7  | 11 dead chat/service methods reimplemented inline in routes                                                                                                       | `src/chat/service/`                                            | ✅ **REMOVED 2026-08-14** — 16 dead exports: context.ts deleted (3 methods), messages.ts deleted (re-export), participants.ts trimmed to updateImpersonation only (6 removed), write.ts −3 methods, visibility.ts −1 method, barrel cleaned. −416 lines. |
| 8  | Frontend dead modules: `touch.ts`, `vendor.ts`, root `app.ts`; Alpine `locale-picker.ts`                                                                          | `src/frontend/`                                                | ✅ **DELETE** — verified 2026-08-14: `vendor.ts` + root `app.ts` replaced by `alpine-init.ts` (build-frontend.mjs confirms "replaces vendor.js + app.js"); `touch.ts` 0 imports; `locale-picker.ts` 0 imports. `vendor-shims.d.ts` KEEP (ambient types for Alpine, tsconfig auto-include). `alpine/app.ts` KEEP (wired via `alpine/index.ts`).                                                                                                                                                                                                                                                                            |
| 9  | Duplicate SSE activity stream (two connections)                                                                                                                   | `src/frontend/alpine/notifications.ts` + `chat-activity.ts`   | ✅ **DEDUPED 2026-08-14** — chatActivity now delegates to NotificationsManager singleton; duplicate EventSource removed; connectActivitySSE/disconnectActivitySSE lifecycle removed; manager exposes getUnseenCount/getAllUnseen/clearUnseen API. |
| 10 | `scenario-source.ts`, `sd.ts` dead + stub                                                                                                                         | `src/assistant/`                                               | ✅ **DELETE** — verified 2026-08-14: 0 imports across entire `src/`. `scenario-source.ts`: all TODO stubs (never implemented). `sd.ts`: SD adapter stub returning mock data.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 11 | Music/SFX/Video generation stubs (no provider)                                                                                                                    | `src/assistant/commands/`                                      | 🟡 Implement provider or disable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 12 | RPG services unwired from production                                                                                                                              | `src/rpg/*/service/`                                           | 🟡 WIRE → **WIRED + MERGED 2026-08-14 (`rpg-wire-routes`)**: items taxonomy + actor items, NPC inventory, world-items→equipment, loot persist, item-transfer events, crafting recipe CRUD, trade ledger (see `epic-item-systems-unification.md` 10/15). **STILL UNWIRED**: achievements, replayability, skills, quests (dual-system), npc-navigation, world-location-traits, crafting stations/attempts/orders, combat, xp (tickets: `TASK-wire-*-routes` × 8, `TASK-consolidate-quest-engines`, `TASK-crafting-stations-execution` — see `epic-rpg-wiring-phase3.md`) (verified 2026-08-14)                                                                                                                                    |
| 13 | Dual quest system (`rpg/quests` vs `story/quest-engine`)                                                                                                          | divergence                                                     | 🟡 WIRE → `TASK-consolidate-quest-engines` (then `TASK-wire-quests-routes`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 14 | `profanity.containsProfanity` wired (profanity_filter gate, `b275ef4d`); `admin.getUnhealthyProviders` redundant helper                                            | services                                                       | ✅ containsProfanity wired (opt-in hide); getUnhealthyProviders keep (info via `/api/health` + `/api/admin/providers`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Schema drift / latent bugs

| # | Item                                                                                        | Where                                                 | Status                                                                                             |
| - | ------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1 | Achievements, playthroughs, meta_progression tables missing from migrations (runtime crash) | `src/db/migrations/035_achievements_replayability.ts` | ✅ Resolved — migration 035 adds tables (verified 2026-08-08)                                      |
| 2 | `dice_roll_history` missing index                                                           | `src/db/migrations/035_achievements_replayability.ts` | ✅ Resolved — `idx_dice_roll_history_user_chat` added (verified 2026-08-08)                        |
| 3 | `migrateChat` parent_id not remapped (broken tree)                                          | `src/chat/service/carry-history.ts`                   | ✅ Fixed 2026-08-08 — remaps `parent_id` (+ test `carry-history.test.ts`)                           |
| 4 | `chat-search` param validation mismatch                                                     | `src/routes/chat-search/transfer.ts`                  | ✅ Fixed 2026-08-08 — schema key `chatId`→`id` (+ test `transfer.test.ts`)                          |
| 5 | `chat.html` broken Handlebars partial `{{> {{>`                                             | `src/views/chat.html:39-41`                           | ✅ Resolved 2026-08-12 — includes rewritten one-per-line; `views.test.ts` 65/65 green               |
| 6 | `content/compress.ts` unguarded `.zst` read (latent crash)                                  | `src/content/compress.ts`                             | ✅ Resolved 2026-08-12 — `.zst` read guarded on `zstdFn`; `src/content/` 27/27 green                |
| 7 | `age-gate/controller.ts` error message leak                                                  | `src/age-gate/service.ts:92`                          | ✅ Fixed 2026-08-14 — removed user input echo from error message; generic "Invalid birth date. Expected YYYY-MM-DD format." |
| 8 | Telemetry `chatId` data loss                                                                | `src/frontend/`                                       | 🟡 Open                                                                                            |

## Release hardening (mirrors `../priority.md` "Open → close"; kept here for the open queue)

- 🟡 **Lint-ts debt** → **open — the only red gate** — `bun run lint` exits 1 (0 errors,
  ~196 warnings; ESLint 10 flat config fails on warnings). Requires warning remediation
  (see `TASK-PLAN-LINT-TS-DEBT`).
- ✅ **Size-strict debt** → closed (`size:strict` reports 0 files over 250L, verified
  2026-08-12; gate stays non-blocking until `TASK-size-strict-debt.md` promotion AC lands).
- 🟡 e2e browser auth-loop → `TASK-PLAN-E2E-STABILIZATION`.
- 🟡 release-process + tag `v0.1.0` + changelog + push `dev`→`origin/dev` →
  `TASK-PLAN-RELEASE-V010` + `epic-release-010.md`.

## Hardening / deferred clusters

| # | Item                                                                                                                                                                         | Status                                                    |
| - | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1 | AUX M6 telemetry (tokens/latency per call)                                                                                                                                   | 🟡 Open (M1–M5 done)                                      |
| 2 | World timeline §5.3 forward-event steering + §5.4 cross-story convergence                                                                                                    | 🟡 Greenfield (cluster B)                                 |
| 3 | Avatar-gallery visibility inheritance                                                                                                                                        | 🟡 Open                                                   |
| 4 | External music linking UI                                                                                                                                                    | 🟡 Open                                                   |
| 5 | Party join/leave with VN narration                                                                                                                                           | 🟡 Open                                                   |
| 6 | Authoring/creation ownership indicators                                                                                                                                      | 🟡 Open                                                   |
| 7 | MFA (TOTP) + `/api/sessions`                                                                                                                                                 | ⏸ Deferred P6+ (local-only auth)                          |
| 8 | Plugin ecosystem / three-tier memory / artifact / ComfyUI / provider ecosystem / RAG / social hub / decentralization / impersonation / 3D views / model-comparison reactions | ⏸ Deferred P6+ (see `epics/`)                             |

## Resolved (moved off)

- Gate C tool-call UI + register page + prompt registry + GM panels + quest log +
  world/location access — verified shipped on `dev` (2026-08-12).
- Size-strict debt — closed (2026-08-12, 0 files over 250L).
- `chat.html` malformed partial + `compress.ts` unguarded `.zst` read — fixed (2026-08-12).
- Item-systems unification backend subset (10/15) — landed in worktree `rpg-wire-routes`
  (2026-08-12), **merged to `dev` 2026-08-14** (row W1 resolved).
- memorySection cross-actor integration test — shipped (`memories.test.ts`).
- M5 ModerationHook safety — shipped (2026-08-06).
- GM role runtime effect — landed in `dev` (auto-gen branches prompt on `assistantRole`).
- Remove dead rule `detectIntent` — Removed 2026-08-07 (superseded by LLM `classifyIntent`).
- Duplicate-export / auth-bypass claims — verified on `dev` (Security section, 2026-08-08).
- Achievements/playthroughs/meta_progression tables — migration `035` landed (Schema §1).
- `dice_roll_history` index — migration `035` landed (Schema §2).
- `rpg.ts` POST body-validation claim — stale; all 6 `/api/rpg` POSTs validate (Security §7).

## Preserved note — concurrent author's claim (2026-08-06 → **landed on dev 2026-08-07**)

> The author's uncommitted `backlog.md` recorded the auth/access fixes as shipped **on branch
> `auth-access-fixes` (commits `8f2a6d71` + `73cda7b9`)**, marking rows 192–222 ✅. The original
> commits were not directly merged, but the fixes **landed on `dev`** under new hashes —
> `7dc68be7` (critical bypasses) + `c78e5466` (remaining gaps) + `c99704c1` (401-guard
> unification). **RESOLVED — do not treat as open.**
