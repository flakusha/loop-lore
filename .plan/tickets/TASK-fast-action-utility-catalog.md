<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fast-action utility & flow-control catalog (/pass /story /draft /see /lore /more-actions …)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-frontend-chat-commands

**Summary:**
**Context:**
**Acceptance Criteria:**

## Summary

Remaining fast actions on top of `TASK-fast-action-prompt-pipeline`: narrative navigation, AI-assisted utility, and state-awareness commands.

## Scope

- **Flow:** `/pass` `/continue` — skip turn, advance to next logical event; `/story [directive]` — steer plot acceleration/transition; `/fast-forward` — time skip with summarization of passage of time and environmental change; `/undo` — revert last AI message (coordinate with existing `/regen` message actions — may be a thin alias over the regen/rewrite machinery, not a new history mechanism).
- **AI-assist:** `/draft` — three hidden action/dialogue suggestions; `/more-actions` — refresh menu-style options.
- **Awareness:** `/see` — environment snapshot (visible items/NPCs/danger); `/lore [keyword]` — knowledge-base query without breaking immersion; `/inventory` — item list. `/stats` already exists (`src/assistant/commands/stats.ts`) — `/see` and `/inventory` should follow its formatting conventions; `/lore` should query the memory/lore systems (`src/memory/`), not the LLM, when the answer is stored.
- Overlap guard: `/undo` vs FEAT-2026-014 smart-regen transforms; `/story` vs `epic-story-mode-ui` GM `/guide` commands — reuse guidance plumbing where present.

## Acceptance Criteria

- [ ] All flow/assist/awareness commands registered via the fast-action template kind
- [ ] `/undo` reuses regen/rewrite message-action machinery; no divergent history manipulation
- [ ] `/lore` hits stored knowledge before falling back to generation
- [ ] `/stats` parity: `/see`/`/inventory` output style matches existing `/stats` formatting
- [ ] Tests: each command's template or state path; no heavy-action state writes

## Linked Epics

- `epic-frontend-chat-commands.md`
- `epic-story-mode-ui.md` (GM guidance overlap)
- EPIC-2026-23 Assistant Commands
