<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Variant — LLM-Only Group Chat

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** Shipped 2026-10-22 — the variant is selectable in the new-chat form and its full `VARIANT_DEFAULTS` column set is persisted on create, including the required validation prompt seeded from `prompt_override_default`, pinned by the per-variant matrix test in `src/routes/chats/create.coverage.test.ts`. The entry-point tab branching for this variant is deferred to the parent epic's open cross-cutting work.
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Ticket
**Tags:** chat, variant, llm, validation, sandbox, group
**Epic:** epic-chat-variants-taxonomy

## Summary

Variant 7: a multi-LLM sandbox used for validation, tracking, and prompt fuzzing. Multiple LLM personas interact under a turn budget; useful for emergent-behaviour harnesses and red-team prompt suites.

## Schema Mapping

Primary tuple: `(chat_type = 'group', chat_mode = 'battle', chat_purpose = 'validation')`.

Auxiliary columns on `chats`:

| Column | Value | Reason |
|---|---|---|
| `max_turns` | required | Hard cap on total turns across participants |
| `auto_advance` | `1` | LLM roster drives next turn |
| `gm_config` | `{ validation: { harness, roster, scenario, tracking } }` | Holds sandbox + roster config |
| `talkativity` | `7` | Rich output but slightly trimmed vs solo variant |
| `prompt_override` | required | Per-roster seed prompt |

`chat_participants` contains N `assistant` rows; no `user` rows.

## Creation Flow Mapping

- Entry point: internal Sandbox tab.
- Picker: `group` + `validation`.
- "Add participants" picks 2–5 LLM personas from the test roster.
- World/location skipped.
- "Advanced" panel: roster, `max_turns`, scenario seed, tracking.

## Acceptance Criteria

- [ ] Creation persists `chat_type = 'group'`, `chat_mode = 'battle'`, `chat_purpose = 'validation'`.
- [ ] `chat_participants` has 2–5 `assistant` rows; no `user` rows.
- [ ] Turn arbitration picks the next speaker per existing battle-mode rules.
- [ ] Run captures per-speaker token usage + outputs into the validation harness.
- [ ] No human moderation hooks fire (variant is sandbox-only); admin read access remains.

## Related Epics / Tickets

- Parent: `epic-chat-variants-taxonomy`
- `epic-actor-turn-skip` — turn skipping in battle mode
- `epic-battle-action-systems` — turn arbitration
- Sibling variants: `TASK-chat-variant-llm-only`, `TASK-chat-variant-llm-only-group-gm`

**Resolved:** 2026-10-22 registry-driven close: git issue a69217f (registry tip: 289232044 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-CHAT-VARIANT-LLM-ONLY-GROUP)
