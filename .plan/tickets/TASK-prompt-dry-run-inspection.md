<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Prompt dry-run inspection (itemized prompt viewer)

**Status:** Not Started
**Summary:** Dry-run endpoint + viewer rendering the itemized next-turn prompt with per-block token counts.
**Context:** ST `public/scripts/itemized-prompts.js` + `/pm-render`; loop-lore assembles multi-source context with no user-visible rendering; searches `dry run|prompt inspection|itemized`: 0 matches (2026-09-21 refs audit).
**Acceptance Criteria:**
- [ ] Dry-run output block-matches the actual next-turn prompt (fixture test)
- [ ] Token totals equal context-stats accounting; no LLM call made
- [ ] Encrypted content redacted per chat-privacy rules
**Epic:** epic-chat-context-optimization.md
**Type:** Feature | **Priority:** Medium | **Effort:** S–M

## Problem

SillyTavern lets power users inspect the **assembled prompt before sending** — itemized prompts per request block (`public/scripts/itemized-prompts.js`) and `/pm-render` — which is how GM/lore/context bugs get diagnosed. Loop-lore assembles context across memory tiers, lore, GM shadow/whitenotes, persona, and RAG (epic-chat-context-optimization, epic-context-injection-correctness) but offers **no user-visible rendering of the assembled prompt**: searches `dry run|prompt inspection|itemized prompt` across `.plan/` + `docs/` return zero matches (verified 2026-09-21 reference-platform gap audit).

## Change

- Dry-run endpoint: assemble the exact prompt for the next turn (no LLM call) and return itemized blocks (system / persona / memory / lore entries / GM notes / history / user) with per-block token counts (reuses `src/chat/context-stats.ts` counting).
- Frontend viewer (chat settings → "Inspect next prompt"), read-only, admin/GM-gated option; redacts encrypted content per chat-privacy rules.
- Blocks are addressable by the same keys the injection pipeline uses so a wrong block is directly traceable to its builder (pairs with epic-context-injection-correctness).

## Acceptance

- Dry-run output matches the actual prompt sent on the following turn (block-for-block, fixture test).
- Token totals equal context-stats accounting; no generation cost incurred.

## Non-goals

- Editing/reordering prompt blocks from the viewer (prompt-manager scope: TASK-prompt-library).
