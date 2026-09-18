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
