<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: External RNG rolls visible in prompts

**Status:** Done
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

ST D&D Dice pattern: macro replaced client-side pre-send so the AI sees the number, not the macro - a story describing a game vs a game. Scope: dice/roll helper outside the model (extend src/regex/dice.ts DICE_SIMPLE), roll result injected into prompt context + rendered in chat; never wand-only. Home: math-resolution / math-economy research epics. Research: .tmp/research/metaapps-summary-2026-11-03.md gap 1.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
