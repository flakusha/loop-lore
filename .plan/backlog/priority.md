# Priority — High-Priority Workstack (P0–P2)

> **Last updated:** 2026-08-06 (consolidated from `immediate.md` / `backlog.md` into
> `.plan/backlog/`). This file holds the **high-priority** tiers; `../high-value.md`
> holds the 0.1.0 value tiers (P3–P5); `../active.md` holds what is in flight /
> needing a decision; `../open.md` holds debt & deferred work.

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
- LLM `classifyIntent` wired (short-reply, 2026-08-05); rule `detectIntent` is dead code (see `../open.md`).
- Open: tool-call result display, command palette expansion (summarize/rewrite/translate), assistant↔GM interface reconciliation, GM config type authoring (human/hybrid).

### P2-E details — Auth & access

- Auth routes + views: `src/routes/auth.ts` (login/register/demo-login/logout/me), `src/views/{login,register}.html`, `fe-fetch.ts` (CSRF + 401 redirect).
- Access: message + reaction gated via `checkChatAccess`; per-chat encryption key + key-mgmt UI + chat-list 🔒 badge; 401 guards unified (`requireUserId` canonical).
- MFA (TOTP) deferred to P6+ (2026-08-05, local-only auth).
- Open: authoring/creation ownership indicators; `world/location` access checks (see `../open.md`).
