<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Prompt improvement shared service (gradation levels)

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-prompt-improvement.md
**Status:** In Progress
**Priority:** High

## Problem

`/improve` is a placeholder slash command (`src/assistant/commands/improve.ts`)
with no shared implementation behind it; the composer has no improvement
affordance at all. Multiple entry points would each need their own prompt
engineering.

## Scope

- Extend `AuxTaskName` with `"prompt-improve"` and `"prompt-analysis"`.
- New `src/prompt-improve/` module: level-parameterized system prompts,
  `improvePrompt()` (per-level temperature/maxTokens/timeout via `callAux`
  opts) and `analyzePrompt()` (JSON result parse with confidence clamp,
  mirroring `parseIntentClassification` hardening).
- Deterministic local-polish fallback when aux is unavailable or fails
  (reuse the existing heuristics idea: capitalization, punctuation,
  whitespace — never lose user text).
- `POST /api/generation/prompt` route (auth + optional `checkChatAccess`
  scoping), `style-chat`/`style-group` levels build a style reference from
  the chat's recent messages.
- Re-wire `/improve` command to delegate to the shared service.

## Acceptance

- `bun test src/prompt-improve/ src/generation/prompt-route.test.ts` green with `registerProvider("mock", …)` fixtures.
- `/improve` behavior preserved (local fallback message unchanged in shape).

## Clarification 2026-09-26

Current behavior: the shared service SHIPS. `src/prompt-improve/` has `index.ts:10-24` (unified re-export), `service.ts` (`improvePrompt`, `improveOrPolish`, `analyzePrompt`, `parseAnalysis` with confidence clamp, `polishText` local fallback), `prompts.ts` (per-level params + analysis prompt). `AuxTaskName` already includes `"prompt-improve"` + `"prompt-analysis"` (`src/aux-pipeline/types.ts:20-21`). `/improve` delegates via `src/assistant/commands/improve.ts:29-78` with bare-ctx local-polish degrade (lines 50-56) and unchanged fallback message shape. Route `handlePromptImprove` at `src/generation/prompt-route.ts:56-144` (auth 401, `checkChatAccess` scoping, injection scan score>=5 → 403, style-context from last 5 messages for `style-*` levels).

Scope disambiguation: the route mounts ONLY at `/api/v1/generation/prompt` (`controller.ts:129`); the `/api/generation/prompt` path in the ticket scope and in the `prompt-route.ts:7` header comment is stale. Ticket acceptance paths (`src/prompt-improve/` tests + `src/generation/prompt-route.test.ts`, 7.5KB, exists) are correct — run both green, fix the stale path strings, close.

Scoped next step: run `bun test src/prompt-improve/ src/generation/prompt-route.test.ts`, correct the two stale path references. Related open git issue: `5c7ec8c` (turn skip fires generation without catch and on deduped advance — same AUX-generation error-handling class as `improveOrPolish` fallback).

Acceptance:

- [ ] `bun test src/prompt-improve/ src/generation/prompt-route.test.ts` green with `registerProvider("mock", …)` fixtures
- [ ] `/improve` fallback message shape unchanged (local-heuristics tag intact)
- [ ] Stale `/api/generation/prompt` references corrected to `/api/v1/generation/prompt`
