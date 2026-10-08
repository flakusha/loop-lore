<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: LLM enhance any text surface

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-chat-composer-flows
**Tags:** frontend, llm, enhance, composer

**Summary:**

## Problem

The LLM enhance action (Improve/Analyze) is only available inside the chat composer. Other text surfaces (GM guidance, character bios, world descriptions, etc.) have no way to invoke it. The `FEAT-llm-enhance-outside-the-chat-composer` ticket specifies the full feature; this ticket is the executable slice for the standalone enhance action.

## Change

Implement the standalone enhance action:
- `enhanceText({text, level, chatId?}): Promise<string|null>` in `src/frontend/alpine/text-enhance.ts` — local-first (deterministic → browser model) then `POST /api/v1/generation/prompt`; no `$refs` dependency.
- `UndoEnhance` bounded (≥5) previous-value stack for non-destructive replace + undo.
- `prompt-request.ts` `chatId` becomes optional (backend already optional in `src/generation/prompt-route.ts`).

Cross-reference: `FEAT-llm-enhance-outside-the-chat-composer` (may merge later).

## Acceptance

- Composer Improve/Analyze unchanged (no regression).
- `enhanceText` callable from any surface (no chat coupling).
- Non-destructive replace + undo via bounded stack.

**Context:**

`enhanceText` in `text-enhance.ts` lifts the composer's local-first chain (deterministic → browser model → POST /api/v1/generation/prompt) into a standalone primitive with no `$refs`/active-chat coupling; `prompt-request.ts` already had optional `chatId`, matching the backend route. The composer's `improvePrompt` now delegates to it — observer hooks (`onLocal`, `onServerFailure`) preserve the exact toast copy including the injection-blocked variant and the local-engine debug log. `UndoEnhance` is a bounded LIFO; the composer keeps its reactive `_promptImproveHistory` array because `input-area.html` binds its length.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
