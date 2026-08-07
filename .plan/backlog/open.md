# Open — Debt, Unwired Code & Deferred (P6+)

> **Last updated:** 2026-08-06. Consolidated from `open-items.md` + `backlog.md` +
> `immediate.md` P6+. This is the **open-debt / deferred** holder. Actively-worked and
> priority/value items live in `../active.md`, `../priority.md`, `../high-value.md`.

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
| 7 | `rpg.ts` POST endpoints missing body validation                                                                                                     | `src/routes/rpg.ts:52-257`         | 🟡 Open                                                        |
| 8 | Duplicate export endpoint (`chats.ts` vs `chat-export.ts`)                                                                                          | `src/routes/`                      | 🟡 Open — consolidate                                          |

## Dead / unwired code

| #  | Item                                                                                                                                                              | Where                                                          | Status                                                                                                                                                                                                                     |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | Entire transport module (~9 files) unwired                                                                                                                        | `src/transport/`                                               | 🟡 Aspirational roadmap infra (spec `transport-unified.md` Status: Partial; HTTP/2 stub; no client). Not a lost user feature — server serves over HTTP/1.1; SSE rolled separately. Keep, revisit when real-time chat ships |
| 2  | Telemetry `startRetentionCleanup` never called                                                                                                                    | `src/telemetry/cleanup.ts:12`                                  | 🟡 Call on server startup                                                                                                                                                                                                  |
| 3  | Notification prefs silent failure                                                                                                                                 | `src/notifications/service.ts:100-122`                         | 🟡 Return error on serialization failure                                                                                                                                                                                   |
| 4  | Dead rule `detectIntent` (superseded by LLM `classifyIntent`)                                                                                                     | `src/assistant/intent.ts`                                      | ✅ Removed 2026-08-07 (kept `detectAvatarChangeIntent`, wired)                                                                                                                                                             |
| 5  | LoRA routes implemented but `.use()` commented out                                                                                                                | `src/generation/lora/routes.ts`                                | 🟡 Documented deferral — code is intentionally gated "when feature is ready for production" (`elysia-app.ts:19,195`); wire deliberately when ready, not dead                                                               |
| 6  | Swipe-variant placeholder — regen row never filled by LLM                                                                                                         | `src/chat/service.ts` + `regenerate-variant.test.ts`           | ✅ Implemented + tested — `regenerateVariant` creates sibling variant with idempotency guard; covered by `tests` (stale claim)                                                                                             |
| 7  | 11 dead chat/service methods reimplemented inline in routes                                                                                                       | `src/chat/service.ts`                                          | 🟡 Consolidate or delete                                                                                                                                                                                                   |
| 8  | Frontend dead modules: `touch.ts`, `vendor.ts`, `app.ts`; Alpine components (`context-window`, `response-length`, `command-buttons`, `locale-picker`)             | `src/frontend/`                                                | 🟡 Remove or wire                                                                                                                                                                                                          |
| 9  | Duplicate SSE activity stream (two connections)                                                                                                                   | `src/frontend/alpine/notifications.ts:35` + `chat-activity.ts` | 🟡 Dedupe                                                                                                                                                                                                                  |
| 10 | `scenario-source.ts`, `sd.ts` dead + stub                                                                                                                         | `src/assistant/`                                               | 🟡 Delete                                                                                                                                                                                                                  |
| 11 | Music/SFX/Video generation stubs (no provider)                                                                                                                    | `src/assistant/commands/`                                      | 🟡 Implement provider or disable                                                                                                                                                                                           |
| 12 | RPG services unwired from production (Skills, Quest, Recipes, Achievements, NpcNavigation, Replayability, WorldLocationTraits) + combat/loot/xp no prod consumers | `src/rpg/*/service.ts`                                         | 🟡 Wire or remove — Skills table+types landed (`b275ef4d`, still no route)                                                                                                                                                 |
| 13 | Dual quest system (`rpg/quests` vs `story/quest-engine`)                                                                                                          | divergence                                                     | 🟡 Consolidate                                                                                                                                                                                                             |
| 14 | `profanity.containsProfanity` wired (profanity_filter gate, `b275ef4d`); `admin.getUnhealthyProviders` genuinely-dead redundant helper                            | services                                                       | ✅ containsProfanity wired (opt-in hide); getUnhealthyProviders keep (info already via `/api/health` + `/api/admin/providers`)                                                                                             |

## Schema drift / latent bugs

| # | Item                                                                                        | Where                                             | Status                                        |
| - | ------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| 1 | Achievements, playthroughs, meta_progression tables missing from migrations (runtime crash) | `src/rpg/{achievements,replayability}/service.ts` | 🔴 Add migration or remove service            |
| 2 | `dice_roll_history` missing index                                                           | `src/db/migrations/026_rpg_mechanics.ts`          | 🟡 Add `(user_id, chat_id)` index             |
| 3 | `migrateChat` parent_id not remapped (broken tree)                                          | `src/chat/service.ts:527+`                        | 🟡 Bug                                        |
| 4 | `chat-search.ts` param validation mismatch (`:id` vs `<id>`)                                | `src/routes/chat-search.ts:300`                   | 🟡 Align                                      |
| 5 | `chat.html` broken Handlebars partial `{{> {{>`                                             | `src/views/chat.html:39-41`                       | 🟡 Fix                                        |
| 6 | `content/compress.ts` unguarded `.zst` read (latent crash)                                  | `src/content/compress.ts:96+203`                  | 🟡 Guard                                      |
| 7 | `age-gate/controller.ts` error message leak                                                 | `src/age-gate/controller.ts:91,126`               | 🟡 Generic error                              |
| 8 | Telemetry `chatId` data loss                                                                | `src/frontend/`                                   | 🟡 Fix (frontend i18n gaps closed 2026-08-06) |

## Release hardening (mirrors `../high-value.md`; kept here for the open queue)

- Lint-ts debt (291 files) · Size-strict debt (10 files) · e2e browser auth-loop ·
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
- Duplicate-export / auth-bypass claims — flagged for **verification on `dev`** (see Security section above).

## Preserved note — concurrent author's claim (2026-08-06 → **landed on dev 2026-08-07**)

> The author's uncommitted `backlog.md` recorded the auth/access fixes as shipped **on branch
> `auth-access-fixes` (commits `8f2a6d71` + `73cda7b9`)**, marking rows 192–222 ✅. The original
> commits were not directly merged, but the fixes **landed on `dev`** under new hashes —
> `7dc68be7` (critical bypasses) + `c78e5466` (remaining gaps) + `c99704c1` (401-guard
> unification). **RESOLVED — do not treat as open.**

- **2026-08-06 auth/access fixes shipped (branch `auth-access-fixes`)**: **Commit `8f2a6d71`** closed the 4 critical bypasses — message-encryption key leak (`requireUserId`+`checkChatAccess`), nsfw-moderation (admin gates, real `userId` not `x-user-id`), nsfw.ts (all 21 handlers owner/`requireUserId`-gated), worlds public mutation (`requireWorldOwner` on all 6 mutations). **Commit `73cda7b9`** closed the remaining 9 gaps — admin provider-models gate + admin-templates (7 handlers) + character-emotions global create (`isAdminRole`); chat-pins/vn-generate/chats export+participants (`checkChatAccess`); chat-search join (world owner/public/member gate); assets delete/link/unlink/unshare (`requireAssetOwner`) + links/shares reads (`requireUserId`); world-scoped quests/story-states/story-items solo alignment. Backlog rows 192/193/194/196/197/210/211/212/213/214/216/217/219/220/222 marked ✅. Verdict: all 🔴 + 🟡 access-control round-3 rows closed; remaining round-3 = dead code, schema drift, duplicate-export consolidation, rpg.ts validation, telemetry/notification/age-gate rows.
