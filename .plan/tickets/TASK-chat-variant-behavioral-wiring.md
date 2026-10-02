<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat variant behavioral wiring

**Status:** Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Ticket
**Tags:** chat, variant, taxonomy, creation, behavioral
**Epic:** epic-chat-variants-taxonomy

## Summary

Drive per-variant behavior from the taxonomy mapping: when a chat is created with a `variant`, persist its auxiliary defaults (`max_turns`, `auto_advance`, `talkativity`, `prompt_override_default`, `chat_purpose`) onto the row — not just the `(type, mode)` triple. Epic fit: `epic-chat-variants-taxonomy` (whose variant table at :28-41 defines the twelve canonical variants mapping onto existing `chats` columns) owns the mapping; `epic-group-chat` owns turn orchestration, which already reads the generic columns and needs no per-variant logic. Caveat: `chat_purpose` currently has no `chats` column (`schema-core.ts:652-688`) — triple `purpose` is validated but not persisted (see AC note); persisting it needs a schema or `gm_config` decision.

## Context

Parent: twelve `TASK-chat-variant-*.md` member tickets (e.g. `TASK-chat-variant-rpg-group.md`: variant 12 maps to `chat_type='group'`, `chat_mode='battle'`, `chat_purpose='rpg'` with `auto_advance=1`, `talkativity=5`, `gm_config.rpg_party`). Canonical table: `VARIANT_DEFAULTS` in `src/chat/types/variants.ts:73` (all 12 variants, e.g. `llm_only`/`llm_only_group` carry `max_turns: 50, auto_advance: 1`).

Grep-verified wiring gap — creation drops the auxiliary defaults:

- `resolveVariantOverrides` (`src/routes/chats/create-variant.ts:26`) pins only `type`/`mode`/`gm_config`; it never reads `max_turns`, `auto_advance`, `talkativity`, `prompt_override_default`, or `purpose` from the variant table.
- `CreateChatParams` (`src/chat/service/types.ts:39`) has no `maxTurns`/`autoAdvance`/`talkativity`/`promptOverride` fields, and the create route (`src/routes/chats/create.ts:202-227`) passes none of them — so a `variant: "rpg_group"` chat lands with `auto_advance=NULL` instead of `1`.
- Runtime already honors the generic columns (no per-variant branching needed): `src/generation/auto-gen/group-cascade.ts:101-108` reads `max_turns`/`auto_advance`; turn state reads `max_turns` (`src/turning/turn-manager/state.ts:150-168`). Persisting variant defaults at creation is sufficient.

## Acceptance Criteria

- [ ] Creating a chat with `variant` persists its `max_turns`, `auto_advance`, `prompt_override` (from `prompt_override_default`), and `chat_purpose` from `VARIANT_DEFAULTS` — verified per variant (at minimum: `rpg_group` → `auto_advance=1` + battle mode; `llm_only`/`llm_only_group` → `max_turns=50, auto_advance=1`; `assistant` → `auto_advance=0`). NOTE: `Chats` has no `purpose`/`chat_purpose` column (`schema-core.ts:652-688`) — triple `purpose` is validate-only today (`ChatCreateBody.purpose`, `validateVariantTriple`); the implementer must either add the column or record the purpose inside `gm_config`/equivalent, and update this AC to the chosen mechanism.
- [ ] Explicit caller-supplied values override variant defaults (mirroring the existing triple-validation pattern in `create-variant.ts:49-57`); mismatched triple still rejects with 400 via `validateVariantTriple`.
- [ ] Variant-seeded `talkativity` reaches participants (or a follow-up ticket is filed if participant seeding is out of scope — no silent drop).
- [ ] Existing runtime behavior unchanged: `bun test src/generation/` (auto-gen cascade `max_turns`/`auto_advance` tests) and `src/chat/variants.test.ts` pass unmodified.
- [ ] Creation-path test per variant asserts the persisted row matches `VARIANT_DEFAULTS` for the full column set, not just the triple.
