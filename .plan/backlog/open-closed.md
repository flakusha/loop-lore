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
