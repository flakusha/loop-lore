# Open — In-Flight, Debt, Unwired Code & Deferred

> **Last updated:** 2026-08-08. Consolidated from `open.md` + `active.md` into this single
> doc (the former `active.md`'s decision queue + recent-wiring log now live in § In-flight
> below). Holds what is **currently in flight / needing a decision / open debt / deferred
> (P6+)**. The priority ladder P0→P6+ lives in `../priority.md`.

## Status header

P0 ✅ · P1 ✅ · P1.5 ✅ · P2 🟡 in progress · Regex ✅ · P3–P5 → 0.1.0 value tiers
(see `../priority.md`).

## In-flight / decision queue — rows needing a finalize-vs-defer call

> When a row is decided: finalize → check off in its `../priority.md` tier; defer → keep
> here in the Deferred section. Rows already shipped or explicitly deferred are removed.
> Rows that mirror a `../priority.md` tier or a section below are removed here.

| ID | Item | Ticket / where | Recommend | Decision |
| --- | --- | --- | --- | --- |
| A5 | Lint-ts debt (291 files) → `check` 16/17 | `../priority.md` "Open → close" | ▲ now | |
| A6 | Size-strict debt (10 files) → `check` 17/17 | `../priority.md` "Open → close" | ▲ now | |
| A7 | e2e browser stabilization (auth redirect-loop) | `../priority.md` "Open → close" | ▲ now | |
| A8 | Unwired-code close-out (LoRA, swipe, GM-role effect) | `../priority.md` P5 | ▲ now | |
| A9 | Release artifacts (release-process, tag `v0.1.0`, changelog) | `../priority.md` "Open → close" | ▲ now | |
| B1 | Registration frontend page | `../priority.md` P2-E / value #1 | ▲ now | |
| B7 | Prompt-template registry impl | `TASK-prompt-template-registry.md` | ▲ now | |
| B8 | Memory selection UI + cross-actor hardening test (test shipped) | `../priority.md` P4 | ▲ now | |
| B10 | Fine-tuning UX (provider health, fine-tune UI) | `../priority.md` P4 | ▲ now | |
| C1 | Chat-type matrix UI (group chat, GM panels, quest log, story frontend) | `../priority.md` P2-D | ▲ now | |
| C2 | NSFW 5-tier character rating runtime enforcement | `../priority.md` P4 | ▲ now | |
| C3 | Assistant tooling (tool-call display, creation wizards, `/commands` tiered) | `../priority.md` P2-C | ▲ now | |
| C4 | Char/world/location flows (multi-format import, menus, mood meter) | `../priority.md` P4 | ▲ now | |
| C5 | LLM providers (Anthropic/Ollama/Bedrock) | `../priority.md` P4 | ▲ now | |
| C6 | Assets (signed URLs, compression flow) | `../priority.md` P4 | ▲ now | |
| C7 | Group-chat VN party join/leave | `TASK-travel-party-migration.md` | ▲ now | |
| D1 | Assistant panel in chat sidebar | `../priority.md` P2-C | ▲ now | |
| D2 | Message actions UI (edit/delete/pin/react) | `../priority.md` P2-C | ▲ now | |
| D3 | Assistant role selector + expand command buttons | `../priority.md` P2-C | ▲ now | |
| E1 | Wire GM panels + quest-log + unified GM↔assistant view | `../priority.md` P2-D | ▲ now | |
| E2 | GM-guided story (user-as-GM UI + doc) | `../priority.md` P2-Da | ▲ now | |
| F2 | M5 ModerationHook safety (AUX) | `../priority.md` Hardening | ▲ now | ✅ shipped 2026-08-06 |
| G6 | Avatar-gallery visibility inheritance | `../priority.md` P2-F | ▲ now | |

**Deferred (do not decide now):** F1 (9 AUX LLM enrichment tasks) · F3 (M6 AUX telemetry) ·
G2 (world timeline §5.3/§5.4) · G3 (external music linking) · G4 (authoring ownership
indicators) — these sit in § Hardening / deferred clusters below. Rows removed here: all
shipped (F2/M5 → Resolved, B2–B6/B9, A1–A4, A#-domain done, G1) and the MFA row (deferred
P6+). "Remove dead rule `detectIntent`" (D4) dropped — already Removed 2026-08-07 (see
§ Dead / unwired code).

**Stale/dup (no decision needed):** login page htmx — auth views already exist.

## Recent wiring (reference)

- **AUX M5 ModerationHook safety** — shipped (2026-08-06): tokenized word-boundary
  matching, severity scoring, audit trail, non-destructive suppression.
- **Emotions** — EmotionHook emits canonical `EmotionType`; prompt `emotion` defaults +
  `detectAvatarChangeIntent` wired (2026-08-06).
- **401-guard unification** — migrated to canonical `requireUserId` (`c99704c1`).
- **Telemetry** — transport gate + `trackTelemetry()` + deduped page_view (2026-08-06).
- **Encryption write/read consistency** — in-flight worktree `encryption-write-read-consistency`
  (peer author; avoid touching `auto-gen.ts` message-write path until it lands).
- **World channels & invite-driven membership** — epic completed + recorded (2026-08-06).
- **Deduplication** — removed duplicate items from `.plan/` root files (future-features-plan.md,
  external-integrations-plan.md, gap-closure-report.md); consolidated into related epics
  and tasks (2026-08-07).
- **Multi-instance reconciliation spec** — expanded `docs/spec/multi-instance-reconciliation.md` with Phase 1-4 details, configuration, health endpoints, and integration points (2026-08-07).
- **`.plan/` root cleanup** — removed duplication from `.plan/` root. Merged `contract-*.md` → `epic-file-splitting.md`, `external-integrations-plan.md` → `epic-platform-integrations.md`, `reconciliation-frontend-ux.md` → `epic-frontend-backend-integration.md`. Moved `gap-closure-report.md` → `.plan/tickets/`. Deleted `future-features-plan.md` (empty), `implementation-plan.md` (epics-index.md supersedes). `.plan/` root now contains only `README.md`, `epics-index.md`, `cross-mechanics-integration-matrix.md` (2026-08-07).
- **Backlog consolidation** — `active.md` + `high-value.md` merged into `open.md`/`priority.md` (2026-08-08).

## Security & access — closed on dev (verified 2026-08-07)

> The 2026-08-06 audit round 3 auth gaps were fixed on branch `auth-access-fixes`
> (commits `8f2a6d71` + `73cda7b9`, neither an ancestor of dev HEAD) **and the fixes
> landed on `dev` under new hashes** after the branch was merged: `7dc68be7`
> (critical bypasses: message, nsfw-moderation, nsfw, worlds) + `c78e5466`
> (remaining access gaps: admin, assets, chat, world routes) + `c99704c1`
> (401-guard unification → canonical `requireUserId`). All rows below are **closed on dev**.

| # | Item                                                                                                                                                | Where                              | Status                                                         |
| - | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| 1 | `message-encryption.ts` returns AES-GCM key without auth — chat access bypass                                                                       | `src/routes/message-encryption.ts` | ✅ Closed (`requireUserId`+`checkChatAccess`)                  |
| 2 | `nsfw-moderation.ts` trusts `x-user-id` header — spoofable identity                                                                                 | `src/routes/nsfw-moderation.ts`    | ✅ Closed (`requireUserId`+`requireAdmin`/`requireOwnOrAdmin`) |
| 3 | `worlds.ts` allows any authed user to mutate public worlds                                                                                          | `src/routes/worlds.ts`             | ✅ Closed (`requireWorldOwner` on all 6 mutations)             |
| 4 | `nsfw.ts` — no auth/ownership on NSFW data                                                                                                          | `src/routes/nsfw.ts`               | ✅ Closed (`requireUserId` on all handlers)                    |
| 5 | Access gaps: chat-pins, chat-search join, vn-generate, character-emotions, chats export/participants, assets delete/link, world-scoped quests/story | across `src/routes/`               | ✅ Closed (`c78e5466`)                                         |
| 6 | World/location access checks                                                                                                                        | worlds/locations                   | ✅ Closed — see below for remaining refinements                |
| 7 | `rpg.ts` POST endpoints missing body validation                                                                                                     | `src/routes/rpg/` (dir)            | ✅ Resolved — file split to `src/routes/rpg/`; all 6 POST endpoints validate (verified 2026-08-08) |
| 8 | Duplicate export endpoint (`chats.ts` vs `chat-export.ts`)                                                                                          | `src/routes/`                      | ✅ Resolved — split into distinct endpoints: `POST /api/chats/batch/export` (`chats/batch.ts:39`) vs `GET /api/chats/:id/export` (`chat-export/export-route.ts:13`); no duplicate path (verified 2026-08-08) |

## Dead / unwired code

| #  | Item                                                                                                                                                              | Where                                                          | Status                                                                                                                                                                                                                     |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | Entire transport module (~9 files) unwired                                                                                                                        | `src/transport/`                                               | 🟡 Verified aspirational (2026-08-08): imported only by itself+tests; adapters are no-op stubs (`h2.ts`/`http1.ts` send() = Promise.resolve()); no WS server. Server serves via Bun native HTTP/1.1+TLS (`src/server/start.ts`); SSE handled separately in route modules. Keep, revisit when real-time chat ships |
| 2  | Telemetry `startRetentionCleanup` never called                                                                                                                    | `src/telemetry/cleanup.ts:12`                                  | 🟡 Call on server startup                                                                                                                                                                                                  |
| 3  | Notification prefs silent failure                                                                                                                                 | `src/notifications/service.ts:100-122`                         | 🟡 Return error on serialization failure                                                                                                                                                                                   |
| 4  | Dead rule `detectIntent` (superseded by LLM `classifyIntent`)                                                                                                     | `src/assistant/intent.ts`                                      | ✅ Removed 2026-08-07 (kept `detectAvatarChangeIntent`, wired)                                                                                                                                                             |
| 5  | LoRA routes implemented but `.use()` commented out                                                                                                                | `src/generation/lora/routes.ts`                                | 🟡 Documented deferral — code is intentionally gated "when feature is ready for production" (`elysia-app.ts:19,195`); wire deliberately when ready, not dead                                                               |
| 6  | Swipe-variant placeholder — regen row never filled by LLM                                                                                                         | `src/chat/service.ts` + `regenerate-variant.test.ts`           | ✅ Implemented + tested — `regenerateVariant` creates sibling variant with idempotency guard; covered by `tests` (stale claim)                                                                                             |
| 7  | 11 dead chat/service methods reimplemented inline in routes                                                                                                       | `src/chat/service.ts`                                          | 🟡 Consolidate or delete                                                                                                                                                                                                   |
| 8  | Frontend dead modules: `touch.ts`, `vendor.ts`, `app.ts`; Alpine components (`context-window`, `response-length`, `command-buttons`, `locale-picker`)             | `src/frontend/`                                                | 🟡 Partial — `context-window`/`response-length`/`command-buttons` now WIRED (`alpine/index.ts:29-31`); still DEAD: `touch.ts`, root `app.ts`, `vendor.ts` (all superseded by `alpine-init.ts`), `locale-picker.ts` never imported (verified 2026-08-08) |
| 9  | Duplicate SSE activity stream (two connections)                                                                                                                   | `src/frontend/alpine/notifications.ts:35` + `chat-activity.ts` | 🟡 Dedupe                                                                                                                                                                                                                  |
| 10 | `scenario-source.ts`, `sd.ts` dead + stub                                                                                                                         | `src/assistant/`                                               | 🟡 Delete                                                                                                                                                                                                                  |
| 11 | Music/SFX/Video generation stubs (no provider)                                                                                                                    | `src/assistant/commands/`                                      | 🟡 Implement provider or disable                                                                                                                                                                                           |
| 12 | RPG services unwired from production (Skills, Quest, Recipes, Achievements, NpcNavigation, Replayability, WorldLocationTraits) + combat/loot/xp no prod consumers | `src/rpg/*/service/`                                           | 🟡 Partial — WIRED: dice, stats, body-systems, encounters, fantasies, intimacy, seduction, `rpg/service.logDiceRoll`. UNWIRED (dead): achievements, replayability, skills, quests (routes/quests uses `story/quest-engine`), npc-navigation, world-location-traits, crafting/recipes, combat, xp, loot + `rpg/service` character-stats/loot/xp exports (verified 2026-08-08) |
| 13 | Dual quest system (`rpg/quests` vs `story/quest-engine`)                                                                                                          | divergence                                                     | 🟡 Consolidate                                                                                                                                                                                                             |
| 14 | `profanity.containsProfanity` wired (profanity_filter gate, `b275ef4d`); `admin.getUnhealthyProviders` genuinely-dead redundant helper                            | services                                                       | ✅ containsProfanity wired (opt-in hide); getUnhealthyProviders keep (info already via `/api/health` + `/api/admin/providers`)                                                                                             |

## Schema drift / latent bugs

| # | Item                                                                                        | Where                                             | Status                                        |
| - | ------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| 1 | Achievements, playthroughs, meta_progression tables missing from migrations (runtime crash) | `src/db/migrations/035_achievements_replayability.ts` | ✅ Resolved — migration 035 adds tables (verified 2026-08-08) |
| 2 | `dice_roll_history` missing index                                                           | `src/db/migrations/035_achievements_replayability.ts` | ✅ Resolved — `idx_dice_roll_history_user_chat` on `(user_id, chat_id)` added (verified 2026-08-08) |
| 3 | `migrateChat` parent_id not remapped (broken tree)                                          | `src/chat/service/carry-history.ts`                            | ✅ Fixed 2026-08-08 — remaps `parent_id` onto migrated-chat ids (+ test `carry-history.test.ts`) |
| 4 | `chat-search` param validation mismatch                                                      | `src/routes/chat-search/transfer.ts`                           | ✅ Fixed 2026-08-08 — schema key `chatId`→`id` (+ test `transfer.test.ts`) |
| 5 | `chat.html` broken Handlebars partial `{{> {{>`                                             | `src/views/chat.html:39-41`                       | 🟡 Fix                                        |
| 6 | `content/compress.ts` unguarded `.zst` read (latent crash)                                  | `src/content/compress.ts:96+203`                  | 🟡 Guard                                      |
| 7 | `age-gate/controller.ts` error message leak                                                 | `src/age-gate/controller.ts:91,126`               | 🟡 Generic error                              |
| 8 | Telemetry `chatId` data loss                                                                | `src/frontend/`                                   | 🟡 Fix (frontend i18n gaps closed 2026-08-06) |

## Release hardening (mirrors `../priority.md` "Open → close"; kept here for the open queue)

- ~~Lint-ts debt (291 files)~~ → resolved (`eslint` exits 0, `e729a7c2`) · Size-strict debt (129 files,
  `epic-file-splitting`, partially reduced 138→129 via `eb3ed64f`) · e2e browser auth-loop ·
  release-process + tag `v0.1.0` + changelog.

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
| 8 | Plugin ecosystem / three-tier memory / artifact / ComfyUI / provider ecosystem / RAG / social hub / decentralization / impersonation / 3D views / model-comparison reactions | ⏸ Deferred P6+ (see `future-features-plan.md` + `epics/`) |

## Resolved (moved off)

- memorySection cross-actor integration test — shipped (`memories.test.ts`).
- M5 ModerationHook safety — shipped (2026-08-06).
- GM role runtime effect — landed in `dev` (auto-gen branches prompt on `assistantRole`).
- Remove dead rule `detectIntent` — Removed 2026-08-07 (superseded by LLM `classifyIntent`).
- Duplicate-export / auth-bypass claims — flagged for **verification on `dev`** (see Security section above).
- Duplicate export endpoint — verified distinct endpoints (Security §8, 2026-08-08).
- Achievements/playthroughs/meta_progression tables — migration `035` landed (Schema §1, 2026-08-08).
- `dice_roll_history` index — migration `035` landed (Schema §2, 2026-08-08).
- `rpg.ts` POST body-validation claim — stale; all 6 `/api/rpg` POSTs validate (Security §7, 2026-08-08).

## Preserved note — concurrent author's claim (2026-08-06 → **landed on dev 2026-08-07**)

> The author's uncommitted `backlog.md` recorded the auth/access fixes as shipped **on branch
> `auth-access-fixes` (commits `8f2a6d71` + `73cda7b9`)**, marking rows 192–222 ✅. The original
> commits were not directly merged, but the fixes **landed on `dev`** under new hashes —
> `7dc68be7` (critical bypasses) + `c78e5466` (remaining gaps) + `c99704c1` (401-guard
> unification). **RESOLVED — do not treat as open.**

- **2026-08-06 auth/access fixes shipped (branch `auth-access-fixes`)**: **Commit `8f2a6d71`** closed the 4 critical bypasses — message-encryption key leak (`requireUserId`+`checkChatAccess`), nsfw-moderation (admin gates, real `userId` not `x-user-id`), nsfw.ts (all 21 handlers owner/`requireUserId`-gated), worlds public mutation (`requireWorldOwner` on all 6 mutations). **Commit `73cda7b9`** closed the remaining 9 gaps — admin provider-models gate + admin-templates (7 handlers) + character-emotions global create (`isAdminRole`); chat-pins/vn-generate/chats export+participants (`checkChatAccess`); chat-search join (world owner/public/member gate); assets delete/link/unlink/unshare (`requireAssetOwner`) + links/shares reads (`requireUserId`); world-scope checks.