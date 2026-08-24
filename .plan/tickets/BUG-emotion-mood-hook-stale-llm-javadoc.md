<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: MoodHook + EmotionHook JSDoc claims "Uses the LLM"; both are regex-only

**Status:** ⬜ Not Started
**Priority:** P3
**Effort:** Trivial
**Epic:** epic-emotion-avatar-message-binding
**Related:** BUG-emotion-mood-hook-payload-missing-actor-chat.md, TASK-aux-llm-emotion-classifier.md, TASK-aux-mood-classification.md, src/generation/hooks/mood-hook.ts, src/generation/hooks/emotion-hook.ts

## Summary

`src/generation/hooks/mood-hook.ts:7` and `src/generation/hooks/emotion-hook.ts:7`
both carry JSDoc claiming "Uses the LLM to analyze content". Neither does —
both are keyword-based with `String.includes()` over hardcoded word lists
(`mood-hook.ts:46-87`, `emotion-hook.ts:45-90`). The JSDoc is stale from a
pre-AUX-pipeline redesign and misleads future contributors.

The hooks also receive `HookContext` as second parameter but ignore it
(parameter is underscore-prefixed). This compounds the misleading framing:
the contract invites context-aware behavior (privacy gating, NSFW
content-rating checks, actor-specific overrides), but the implementation
reads no context at all.

## Context

The AUX-pipeline redesign (`src/aux-pipeline/runner.ts`, `prompts.ts`) was
designed to route every auxiliary classification through a shared LLM
runner (shared timeout, BYO parity, telemetry). Existing tickets track the
replacement work:

- `TASK-aux-llm-emotion-classifier.md` — replace keyword `EmotionHook` with
  AUX classifier
- `TASK-aux-mood-classification.md` — replace keyword `MoodHook` with AUX
  classifier
- `TASK-aux-enrichment-emotion-avatar-task.md` — wrapper scaffolding for
  `src/aux-pipeline/tasks/emotion-avatar.ts`

Until those land, the hooks still advertise "LLM" in their docstrings —
which has caused repeated stale audit rows (see
`BUG-stale-audit-claim-aux-emotion-mood-task-tables.md`).

For comparison: the actual LLM-using hook (`src/generation/hooks/nsfw-hook.ts:7`)
correctly states "Uses keyword detection to classify content NSFW level" —
the LLM path is a separate `detectNsfwWithLlm` function (`nsfw-classifier.ts:52`)
explicitly named.

## Fix

1. Update `mood-hook.ts:7-9` JSDoc:
   ```ts
   /**
    * Mood Hook — Detects mood shifts in content and fires mood delta events.
    *
    * Uses keyword matching (positive / negative / neutral word lists) to
    * score content mood and emits mood-shift events that downstream systems
    * (mood UI, post-store persistence) can react to. LLM-based classification
    * is planned (see TASK-aux-mood-classification.md).
    */
   ```
2. Update `emotion-hook.ts:6-8` JSDoc symmetrically.
3. Decide whether to wire `_context` now or rename to `_`:
   - **Quick fix**: rename `_context` → `_` on both `execute` methods,
     remove the ESLint disable comment if it becomes unused, and add
     `@param content - Assistant message content to analyze` JSDoc only.
   - **Proper fix** (preferred): wire context — read
     `context.privacyLevel` to skip detection when privacy is `private`,
     read `context.actorContentRating` to scale intensity for NSFW
     characters. This subsumes the BUG-emotion-mood-hook-payload-missing-actor-chat.md
     fix in the same diff.

## Acceptance Criteria

- [ ] Both JSDoc blocks no longer claim "Uses the LLM".
- [ ] If quick-fix path chosen: `_context` renamed to `_` in both signatures.
- [ ] If proper-fix path chosen: context is read for at least one
      meaningful gating decision (privacy or content-rating).
- [ ] Existing tests (`hooks.test.ts:80-184`, `e2e-integration.test.ts:174-272`)
      still green.
- [ ] `bun run check` green.