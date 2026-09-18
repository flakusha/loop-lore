<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Variant — LLM-Only Chat

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Low
**Type:** Feature Ticket
**Tags:** chat, variant, llm, validation, sandbox, direct
**Epic:** epic-chat-variants-taxonomy

## Summary

Variant 6: a chat with no humans in it — used for validating LLM functionality, prompt regression, and tracking. One LLM persona talks to itself (or to a scripted harness) under a turn budget.

## Schema Mapping

Primary tuple: `(chat_type = 'direct', chat_mode = 'battle', chat_purpose = 'validation')`.

Auxiliary columns on `chats`:

| Column | Value | Reason |
|---|---|---|
| `max_turns` | required (validation budget) | Hard cap on turns per run |
| `auto_advance` | `1` | LLM drives next turn automatically |
| `gm_config` | `{ validation: { harness, expected_outputs, scoring } }` | Holds validation config |
| `talkativity` | `8` (verbose) | Validation needs rich output to inspect |
| `prompt_override` | required (test prompt) | Validates a specific prompt template |

`chat_participants` contains one `assistant` row; no `user` rows.

## Creation Flow Mapping

- Entry point: internal Sandbox tab (admin / dev only).
- Picker: `direct` + `validation`.
- "Add participants" offers a single LLM persona picker (from the test roster).
- World/location skipped.
- "Advanced" panel: `max_turns`, `auto_advance` (locked on), harness script, scoring rules, expected output blurb.

## Acceptance Criteria

- [ ] Creation persists `chat_type = 'direct'`, `chat_mode = 'battle'`, `chat_purpose = 'validation'`.
- [ ] `chat_participants` has exactly one row; `user_id` is the system test user.
- [ ] `max_turns` and `auto_advance` are required; missing them rejects the create.
- [ ] LLM turn arbitration runs autonomously; conversation ends at `max_turns` or when harness signals done.
- [ ] Run output is captured into the validation harness for regression scoring.

## Related Epics / Tickets

- Parent: `epic-chat-variants-taxonomy`
- `epic-actor-turn-skip` — turn skipping relevant when harness signals early
- `epic-battle-action-systems` — battle mode turn arbitration re-used
- Sibling variants: `TASK-chat-variant-llm-only-group`, `TASK-chat-variant-llm-only-group-gm`
