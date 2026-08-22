<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

## P0 — Critical Path (Blocking)

| Area           | Item                                                                                                                                   | Effort | Status                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Data Integrity | Phase 1 — config guards (reject `sqlite` when `INSTANCE_COUNT > 1`, warn on network FS WAL, fix stale MySQL claim in architecture doc) | Low    | ✅ Complete (`src/config/load.ts`)                                                                                                    |
| NSFW           | Moderation Safety Infrastructure — gate, consent, audit, flagging                                                                      | Medium | ✅ Complete — runtime config + live enforcement + mood-shift + audit-log UI + consent display (2026-08-06)                            |
| Shared Schemas | Reputation, Consent, NSFW Content Rating (`src/schemas/`)                                                                              | Medium | ✅ Complete                                                                                                                           |

## P1 — High Priority (Post-P0)

| Epic               | Item                                                               | Effort | Status                      |
| ------------------ | ------------------------------------------------------------------ | ------ | --------------------------- |
| NSFW Integration   | Gaps — Housing, Weather, Social, Disease (G6–G9)                  | Medium | ⬜ Deferred → P6 (epic ⬜ Not Started; matrix P6+ deferred) |
| Battle Integration | Gaps — Items, Social, NPC, Weather, Resolution (G1–G5)           | High   | ⬜ Deferred → P6 (epic ⬜ Not Started; matrix P6+ deferred) |
| Data Integrity     | Phase 2 — `data_version` optimistic concurrency, `409` on mismatch | Medium | ✅ Complete                 |

## P1.5 — Accessibility

- ✅ Complete as of 2026-07-31 (focus traps, aria-live, reduced-motion, contrast, touch).

## P2 — Core Workstream (Next Work)

> Emphasis: VN mode, chat, assistant, tool calling, GM flows, GM-guided story, auth/access,
> gallery, reconcile bugs (build-fix + security + broken features). RPG mechanics deferred to
> P2-later — **except the item-systems backend wiring which merged to `dev` 2026-08-14 from
> worktree `rpg-wire-routes`** (see P2-later row + `epic-rpg-wiring-phase3.md`).
> Detailed per-tier tickets live in `../tickets/`.

### P2-Reconcile — Reconcile Bugs (Build-fix + Security + Broken Features)

> Added 2026-08-21 from reconcile review (Scout Batch C). 9 tickets, all high-priority defects
> that block 0.1.0 quality.

| Ticket | Area | Effort | Why P2 |
|--------|------|--------|--------|
| `BUG-impersonate-buildimpresult-referenceerror` | impersonation | Small | Impersonation broken (ReferenceError) |
| `BUG-impersonate-commands-register-empty-callback` | impersonation | Small | Impersonate commands no-op |
| `BUG-npc-navigation-routes-all-stubbed` | npcs | Large | NPC nav entirely stubbed |
| `BUG-chat-swipe-index-race` | chat | Small | Data corruption risk |
| `WIRE-impersonate-command-palette-no-actionpayload-dispatch` | impersonation | Medium | Impersonate FE dead |
| `WIRE-characters-create-avatar-linking-missing` | characters | Medium | Character creation missing asset wiring |
| `WIRE-nsfw-audit-page-missing-inline-authz` | nsfw | Small | **Security** — unguarded audit route |

> **Closed (verify on `dev` 2026-08-22):** `BUG-gallery-duplicate-serveGalleryGrid`,
> `BUG-users-persona-handlers-horizontal-priv-esc`, `BUG-rpg-route-authz-gaps-*`.
>

| Tier     | Topic                                 | Tickets                                                                                                                                                                               | Status                                                                                                                                                        |
| -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-A     | Visual Novel Mode                     | `TASK-visual-novel-mode.md`, `TASK-vn-branching-choices.md`, `TASK-vn-dynamic-generation.md`, `TASK-vn-qa-mode.md`, `TASK-vn-scene-template-system.md`, `TASK-vn-template-actions.md` | ✅ Complete (backend + frontend, 2026-07-31); verify `bun test src/story/`                                                                                    |
| P2-B     | Chat System                           | `TASK-chat-*.md` (autorenaming, backgrounds, external-music, room-search-join, room-filters, message-search, sectioning, transfer-location, travel-party, AUX-*)                      | 🟡 In progress — autorenaming/sections/invites/filters/message-search/transfer shipped; music-linking + party-join/leave + group-chat matrix UI open           |
| P2-C     | Assistant & Tool Calling              | `TASK-assistant-commands-extension.md`, `TASK-assistant-command-execution-intent-detection.md`, `TASK-wire-gm-service-story-mode.md`, `TASK-assistant-gm-flows-reconciliation.md`     | 🟡 In progress — slash parser/commands, GM role runtime effect, LLM `classifyIntent`, **tool-call display ✅ (2026-08-12)**; command palette + creation wizards + tiered `/commands` open |
| P2-D     | GM Flows                              | `TASK-gm-shadow-notes.md`, `TASK-gm-whitenotes.md`, `TASK-assistant-gm-flows.md`                                                                                                      | 🟡 **GM panels ✅ + quest log ✅ (2026-08-12)** + shadow/whitenotes shipped; unified GM↔assistant view open                                                                                  |
| P2-Da    | GM-Guided Story Creation (user as GM) | `TASK-gm-guided-story-creation.md`                                                                                                                                                    | ✅ **Done 2026-08-14** — participant type, `/guide` + `/scene` commands, guidance panel, `PUT /api/v1/chats/:id/gm-guidance`, `gmGuidance` threaded into `GameMasterService` (`4b0dd146`); merged to `dev`                                                                                              |
| P2-E     | Authorization & Access                | `TASK-auth-register-route.md`, `TASK-encryption-access-management.md`, `TASK-dedupe-message-access-checks.md`, `TASK-fix-message-reactions-access.md`, `TASK-authoring-creation.md`   | 🟡 **Backend auth/access shipped incl. world/location access ✅ (2026-08-12)**; MFA deferred P6+; authoring ownership indicators open                            |
| P2-E†    | Unify 401 Guard Helpers (debt)        | `TASK-unify-401-guard-helpers.md`                                                                                                                                                     | ✅ Shipped 2026-08-06 (`c99704c1`) — remaining handler-funneled extraction tracked in `../open-inflight.md`                                                            |
| P2-F     | Gallery                               | `TASK-gallery-minimal-image-asset-viewer.md`, `TASK-config-gallery-attachment-idempotent.md`                                                                                          | ✅ Backend + frontend; avatar-gallery visibility inheritance complete (G6)                                                                                             |
| P2-G     | LoRA Discovery & Application          | `TASK-lora-discovery-application.md`                                                                                                                                                  | 🟡 Routes implemented but `.use()` commented out — wire or drop (see `../open-inflight.md`)                                                                            |
| P2-later | RPG Mechanics (wire phase-3)          | `TASK-rpg-mechanics-dice-stats.md`, `TASK-rpg-mechanics-combat.md`, `TASK-rpg-mechanics-xp-loot.md`, `TASK-wire-*-routes.md` × 8, `TASK-consolidate-quest-engines.md`                 | 🟡 **Item-systems backend merged 2026-08-14 (`rpg-wire-routes`)** + **7 more services wired 2026-08-14 (`51a7bc01`)**: achievements, skills, npc-navigation, replayability, world-location-traits, xp-loot, combat; quest engines consolidated. Remaining: crafting stations/execution, trade lifecycle, NPC trading → `epic-rpg-wiring-phase3.md` |
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
- LLM `classifyIntent` wired (short-reply, 2026-08-05); rule `detectIntent` removed (see `../open-inflight.md`).
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

