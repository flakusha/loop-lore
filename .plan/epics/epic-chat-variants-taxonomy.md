<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Chat Variants Taxonomy

**Overview:** (see sections below)


**Status:** Done
**Status Note:** Shipped 2026-10-22. The premise was stale in two directions: the canonical table and the server-side pinning already existed (`src/chat/types/variants.ts`, `src/routes/chats/create-variant.ts`), while the new-chat form exposed only two of the twelve variants — the real gap was reachability, not declaration. Landed: an explicit `null` override survives instead of silently falling back to the variant default, a template preset no longer overrides the chosen variant, the variant talkativity is seeded on every participant rather than the owner alone, the llm-only variants get a real validation prompt, and all twelve variants are selectable in the new-chat form — the duplicate client-side taxonomy is gone. Still open, deliberately: the four entry-point tabs (Characters / Assistant / Social / Sandbox) that the single picker replaces, and the one-time backfill of the triple onto chats that pre-date migration `044_chat_purpose.ts`, which stays as cross-cutting work in the backlog. No schema migration was needed or made.
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** chat, taxonomy, chat-type, chat-mode, chat-purpose, gm, rpg, group-chat

## Overview

Loop Lore has accumulated a constellation of chat-shaped product surfaces (assistant prompts, 1×1 user chats, RPG scenes, GM-guided group stories, LLM-only validation chats, IRC mirrors, etc.) that today mostly share the same `chats` table without an explicit taxonomy to distinguish them. This epic fixes that by declaring **twelve canonical chat variants** that map onto the existing `chats` schema columns — `chat_type`, `chat_mode`, `chat_purpose` — plus the auxiliary knobs `max_turns`, `auto_advance`, `gm_config`, `talkativity`, `prompt_override`.

**Constraint:** No schema migration. Every variant below is expressible with columns that already exist. Where a variant requires capability the current columns do not capture (e.g. RPG `world_id` binding), the ticket notes it but does not introduce a new column — that work is deferred to `epic-world-chat-channels-invites` / `epic-rpg-wiring-phase3`.

**Authority for "chat admin":** for every group/admin/gm variant, "chat admin" means any of: (a) a global admin user, (b) the chat's creator, or (c) an assigned / owning gm for that chat. Gm themselves may be LLM, user, or both depending on chat setup — this is per-variant and called out below.

## Variant → Primary Tuple

The primary key for any chat is the `(chat_type, chat_mode, chat_purpose)` triple. Auxiliary columns capture group/admin/gm behaviour.

| # | Variant | chat_type | chat_mode | chat_purpose | Notes |
|---|---------|-----------|-----------|--------------|-------|
| 1 | assistant chat | `direct` | `story` | `assistant` | User ↔ assistant; one user, one assistant |
| 2 | assistant group chat | `group` | `story` | `assistant` | Multiple users collaboratively prompting one assistant |
| 3 | user chat (1×1) | `direct` | `story` | `social` | Encrypted, two-user |
| 4 | user group chat | `group` | `story` | `social` | Classical encrypted group, public + private variants |
| 5 | user group chat with admin/moderator | `group` | `story` | `social` | Public social group with admin/mod scope |
| 6 | llm-only chat | `direct` | `battle` | `validation` | No humans; LLM talks to LLM, validation harness |
| 7 | llm-only group chat | `group` | `battle` | `validation` | Multi-LLM sandboxes, tracking, prompt fuzzing |
| 8 | llm-only group chat with admin/gm | `group` | `story` | `guided` | GM-driven narrative; gm is an LLM (or LLM+user) |
| 9 | chat (with character) | `direct` | `story` | `roleplay` | User + one LLM character |
| 10 | group chat (multi-character) | `group` | `story` | `roleplay` | Multiple users + multiple characters; admin/gm implied |
| 11 | rpg chat | `direct` | `story` | `rpg` | Attached to a world, happens in a location, rules enforced |
| 12 | rpg group chat | `group` | `battle` | `rpg` | Multi-user party, turn rules, world+location binding |

> Notes:
> - Variant 12 uses `chat_mode = battle` because RPG group turn arbitration is mechanically identical to the battle turn orchestration already supported by that enum. The behavioural difference vs. variant 11 is the participant structure (`group` + turn rules) and the world binding, not the mode label.
> - Where a variant needs RPG-specific binding (`world_id`, `location_id`), it piggybacks on existing `chats` fields populated by the world-chat epic and `epic-rpg-wiring-phase3`.

## Auxiliary Columns by Variant

| # | Variant | max_turns | auto_advance | gm_config | talkativity | prompt_override |
|---|---------|-----------|-------------|-----------|-------------|-----------------|
| 1 | assistant chat | null | 0 | null | 5 (default) | optional assistant persona override |
| 2 | assistant group chat | null | 0 | null | 4 | optional |
| 3 | user chat (1×1) | null | 0 | null | 5 (column default — no LLM) | null |
| 4 | user group chat | null | 0 | null | 5 (column default — no LLM) | optional (summarizer) |
| 5 | user group chat admin | null | 0 | `moderation` block | 5 (column default — no LLM) | null |
| 6 | llm-only chat | set (validation budget) | 1 | `validation` block | 8 | required (test prompt) |
| 7 | llm-only group chat | set | 1 | `validation` block | 7 | required |
| 8 | llm-only group + gm | per gm | 0 (gm-driven) | `gm_profile` block | 6 | gm persona override |
| 9 | chat (character) | null | 0 | null | 7 | optional character persona |
| 10 | group chat (multi-char) | null | 0 | `cast` block | 6 | optional per-character overrides |
| 11 | rpg chat | null | 0 | null | 6 | optional house-rules override |
| 12 | rpg group chat | set (turn cap) | 1 | `rpg_party` block | 5 | optional house-rules override |

## Chat Creation Flow — Variant Branching

Current chat creation (see `epic-chat-lifecycle-moderation` and existing frontend modal) prompts for: name, optional characters, optional world/location, optional NSFW toggle, optional initial system prompt. Each variant below hooks into that flow at the indicated step.

| Flow step | Where variants diverge |
|---|---|
| "Who's this for?" picker | Determines chat_type (direct/group) + a coarse purpose hint (assistant / roleplay / rpg / social / guided / validation) |
| "Add participants" | Direct variants invite one; group variants invite many; RPG variants also invite party + gm |
| "Start in a world/location" | Required for rpg variants; optional for character/llm; absent for pure user/social |
| "Invite event" (rpg only) | Triggers `epic-rpg-core-wiring` introduction → small intro story → transition into chat |
| "Pick a gm" (rpg + gm variants) | Llm / user / hybrid; populates `gm_config` |
| "Advanced: mode, turn cap, talkativity, prompt override" | Advanced panel surfaces the auxiliary columns above |

The Characters tab is the canonical entry point for variants 9–12; the Assistant tab is the entry point for variants 1–2; the Social/People tab is the entry point for variants 3–5; an internal "Sandbox" tab is the entry point for variants 6–8.

> Shipped state: those four tabs do not exist yet — the new-chat form carries a
> single picker offering all twelve variants. Splitting it per tab is the
> deferred entry-point work below.

## Tasks

### Taxonomy (High Priority)

- [x] TASK-chat-variant-assistant — variant 1: assistant chat (direct / story / assistant)
- [x] TASK-chat-variant-assistant-group — variant 2: assistant group chat (group / story / assistant)
- [x] TASK-chat-variant-user-1x1 — variant 3: user 1×1 chat (direct / story / social, encrypted)
- [x] TASK-chat-variant-user-group — variant 4: user group chat (group / story / social)
- [x] TASK-chat-variant-user-group-admin — variant 5: user group chat with admin/moderator (group / story / social + gm_config.moderation)
- [x] TASK-chat-variant-llm-only — variant 6: llm-only validation chat (direct / battle / validation)
- [x] TASK-chat-variant-llm-only-group — variant 7: llm-only group validation chat (group / battle / validation)
- [x] TASK-chat-variant-llm-only-group-gm — variant 8: llm-only group with gm (group / story / guided)
- [x] TASK-chat-variant-character — variant 9: chat with character (direct / story / roleplay)
- [x] TASK-chat-variant-character-group — variant 10: multi-user + multi-character group (group / story / roleplay + gm_config.cast)
- [x] TASK-chat-variant-rpg — variant 11: rpg chat (direct / story / rpg + world/location binding)
- [x] TASK-chat-variant-rpg-group — variant 12: rpg group chat (group / battle / rpg + turn rules + world binding)

### Cross-cutting (Medium Priority — opened if/when needed)

- [x] Frontend variant picker — all twelve variants are selectable in the new-chat form
- [ ] Frontend variant picker entry-point branches — the Characters/Assistant/Social/Sandbox tabs the single picker currently replaces
- [x] Create-chat payload validator per variant — `validateVariantTriple` guards `routes/chats/create`
- [ ] Migration of legacy chats into the taxonomy — `(chat_type, chat_mode)` remap for chats predating migration `044_chat_purpose.ts`


## Files (Target Surface)

Columns this epic maps onto, and the files it changed. The epic is no longer
documentation-only: the backend wiring predated it, but it was half-wired and
the UI could not reach most of the table.

- `src/db/migrations/001_init.ts` — `gm_config`, `max_turns`, `auto_advance`, `prompt_override` on `chats`
- `src/db/migrations/044_chat_purpose.ts` — `purpose` on `chats`
- `src/db/enums-core/users.ts` — `ChatType`, `ChatMode`, `ChatPurpose` enums
- `src/db/schema-core.ts` — generated `Chats`, `ChatParticipants`, `ChatSetupTemplates` types
- `src/chat/types/variants.ts` — the canonical `VARIANT_DEFAULTS` table
- `src/routes/chats/create-variant.ts` — `resolveVariantOverrides`, the trust boundary
- `src/routes/chats/create.ts` — variant pinning on create
- `src/chat/service/crud/create.ts` — participant seeding (talkativity)
- `src/frontend/pages/new-chat/index.ts`, `src/frontend/pages/new-chat/submit.ts`, `src/views/new-chat.html` — the variant picker
- `src/components/chat/participant-mgmt.html` — per-participant talkativity control

## Linked Tasks

- TASK-chat-variant-assistant.md
- TASK-chat-variant-assistant-group.md
- TASK-chat-variant-user-1x1.md
- TASK-chat-variant-user-group.md
- TASK-chat-variant-user-group-admin.md
- TASK-chat-variant-llm-only.md
- TASK-chat-variant-llm-only-group.md
- TASK-chat-variant-llm-only-group-gm.md
- TASK-chat-variant-character.md
- TASK-chat-variant-character-group.md
- TASK-chat-variant-rpg.md
- TASK-chat-variant-rpg-group.md

## Related Epics / Tickets

- `epic-chat-lifecycle-moderation.md` — context window, transitions, moderation hooks all apply to every variant
- `epic-group-chat.md` — group-chat turn orchestration; foundations for variants 2/4/5/7/8/10/12
- `epic-chat-privacy.md` — encryption posture for variants 3/4/5
- `epic-chat-transfer-location.md` — location transfer mechanics; referenced by variants 11/12
- `epic-frontend-encryption.md` — E2E encryption for user variants (3/4/5)
- `epic-message-seen-state.md` — read-receipts / presence (group variants 2/4/5/7/8/10/12)
- `epic-actor-turn-skip.md` — turn skipping; relevant to variants 6/7/12 (turn-driven)
- `epic-narration-actor-separation.md` — narration routing; relevant to variants 8/10/11/12
- `epic-visual-novel-mode.md` — VN rendering; cross-cuts character/roleplay variants (9/10)
- `epic-world-chat-channels-invites.md` — world/channel invitation mechanics; referenced by 11/12
- `epic-rpg-wiring-phase3.md`, `epic-rpg-core-wiring.md`, `epic-rpg-mechanics.md` — RPG mechanics on which variants 11/12 sit
- `TASK-chat-sectioning-multi-location.md` — sectioned chat per location; relevant to variant 11
- `TASK-group-chat-mention-routing.md` — mention routing in group variants (2/4/5/7/8/10/12)
- `TASK-rpg-chat-questions.md` — OOC question handling in RPG variants (11/12)
- `TASK-rpg-history-committing-chats-per-world.md` — per-world history commit; relevant to variant 11
- `TASK-chat-transfer-location.md` — chat location transfer; relevant to variants 11/12
- `TASK-chat-branch-merge.md` — chat branch + merge; applies to narrative variants
- `TASK-chat-lifecycle-moderation.md` — moderation surface for every variant with humans in
- `FEAT-chat-template-config-lifecycle.md` — template lifecycle; provides the `chat_setup_templates` table consumed by assistant / character variants
- `FEAT-irc-integration-channels-as-group-chat-pm-as-chat.md` — IRC channel↔group-chat, PM↔direct-chat mapping (variant 3/4 surface)

## Migration Strategy

None. This epic is taxonomy-only. No schema changes. Where a future feature demands a column this epic cannot express (e.g. explicit `is_gm_assisted_boolean` or `world_binding_kind`), that work is filed under the relevant owner epic (e.g. `epic-rpg-wiring-phase3`).

For pre-existing chats that pre-date the unified schema, a one-time backfill task — opened in the cross-cutting list above — will compute `(chat_type, chat_mode, chat_purpose)` from existing columns where possible and leave ambiguous rows flagged for manual triage.

## Open Questions

1. **Variant 12 chat_mode = battle**: rationale is turn-arbitration parity with existing battle-mode orchestration. If `epic-rpg-wiring-phase3` ends up with a separate `rpg` mode in `ChatMode`, variant 12 should flip to that instead. Decision deferred until that epic lands.
2. **`chat_purpose` enum shape**: settled — `ChatPurpose` in `src/db/enums-core/users.ts` carries the six canonical strings (`assistant | roleplay | rpg | social | guided | validation`) plus the legacy `main | side | notes` trio that nothing reads. `chats.purpose` is a plain text column, so the enum is enforced in code by `validateVariantTriple` rather than by a DB check constraint.
3. **Authority resolution**: "chat admin" unification across variants needs a small resolver (creator OR global admin OR owning gm). The resolver does not require a column — it derives from existing `chat_participants.role` + a per-chat `owner_user_id` — but no ticket currently owns it. Opened as cross-cutting.
4. **Variant 8 (llm-only + gm) vs variant 12 (rpg group) overlap**: variant 8 has a gm but no world; variant 12 has a world but no required gm. Today the only differentiator is `chat_purpose`. If product wants both "world + gm" cleanly, an explicit `gm_required boolean` on `chats` would help — but adding that column is out of scope here and parked under `epic-rpg-wiring-phase3`.

**Resolved:** 2026-10-22 registry-driven close: git issue 685caea (registry tip: 70c38804b Konstantin Fedotov Auto-closed: appended .md marker marks EPIC-CHAT-VARIANTS-TAXONOMY done)
