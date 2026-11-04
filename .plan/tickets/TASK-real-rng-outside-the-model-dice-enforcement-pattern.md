<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Real RNG outside the model (dice-enforcement pattern)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-mechanics-governance
**Tags:** rng, dice, research-gap
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

ST Dice extension lesson (research 01/02/04): wand-menu rolls are show-only, never reach the AI. Portable pattern: roll at prompt-build ({{roll}}/{{pick}} macros in core-macros.js, droll.validate/roll, pre-send substitution), function-tool route (off default, chat-completion only, recursion cap 5). Nothing binds the model — enforcement lives outside it. Loop-lore home: math-resolution/math-economy epics + /roll command. Research: .tmp/research/ai-cheat/01-outside-takes.md gap 1, 02-followup-takes.md section 2, 04-code-internals.md dice section. Merged from dupe TASK-external-rng-rolls-visible-in-prompts (083258f, closed): extend src/regex/dice.ts DICE_SIMPLE as the roll helper, inject result into prompt context + render in chat (never wand-only).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
