<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: MoodHook + EmotionHook JSDoc claims "Uses the LLM"; both are regex-only

**Status:** ✅ Resolved
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

## Adjacent nit: spurious `async` on `canHandle`

All 4 hooks (`emotion-hook.ts:20`, `mood-hook.ts:20`, `moderation-hook.ts:109`,
`nsfw-hook.ts:44`) declare `canHandle` as `async` and carry the
`// eslint-disable-next-line @typescript-eslint/require-await` disable comment.
Functionally correct (JS auto-wraps the bare `return`), but the `async`
modifier is superfluous — `canHandle` has no `await` in any of the 4 bodies.
A sync function returning `boolean` doesn't satisfy the `HookHandler.canHandle`
interface (`types.ts:54` mandates `Promise<boolean>`), so the `async`
keyword is the legitimate way to satisfy the interface — but the disable
comment makes the intent explicit at the call site.

If the interface is loosened to `boolean | Promise<boolean>` in a follow-up,
all 4 `canHandle` methods can drop both the `async` keyword and the
disable comment in one pass. Trivial, low-risk, but cross-cuts the
`HookHandler` contract — coordinate with the other hook consumers
(custom user-defined hooks via `registerHook`) before changing.

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
4. (Adjacent nit) Defer the `canHandle` `async`-cleanup to a separate pass
   that loosens `HookHandler.canHandle` to `boolean | Promise<boolean>` —
   noted above for future reference.

## Acceptance Criteria

- [x] Both JSDoc blocks no longer claim "Uses the LLM".
- [x] If proper-fix path chosen: context is read for at least one
      meaningful gating decision (privacy or content-rating).
- [x] Existing tests (`hooks.test.ts:80-184`, `e2e-integration.test.ts:174-272`)
      still green.
- [x] `bun run check` green.
- [ ] `canHandle` async-cleanup explicitly NOT included in this fix's scope
      (tracked as future-work above).

## Resolution

Took the **proper fix** path:

1. JSDoc was already updated (prior session) to say "Uses keyword matching" + "LLM-based classification is planned".
2. Wired `_context` → `context` in both `MoodHook` and `EmotionHook`:
   - **Privacy gating**: `canHandle` returns `false` when `context.privacyLevel === "private"` (skip detection for private chats).
   - **NSFW delta scaling**: `MoodHook.execute` amplifies mood delta by 1.5× for NSFW-rated actors (`Math.round(baseDelta * 1.5)`).
   - **Payload enrichment**: Both hooks now include `actorId` and `chatId` from context in the `data` payload (partially addresses `BUG-emotion-mood-hook-payload-missing-actor-chat.md`).
3. Added tests for privacy gating, actorId/chatId payload, and NSFW delta scaling.
4. All 52 hook tests pass; all 510 generation tests pass.
