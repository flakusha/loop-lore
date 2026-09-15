<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: LLM-enhance for chat and text windows with leveled rewrites

**Status:** ✅ Done
**Epic:** epic-assistant-gm-flows, epic-conversation-branching
**Priority:** medium
**Effort:** Medium

## Summary

Chat windows and text windows need an llm-enhance action with selectable levels: from minor grammar/language fixes up to a full rewrite that follows the imposed world/chat/GM style. Frontend chat-management follow-up from chat-turning-bugfix-batch-9. Scope: web UI enhance affordance on inputs, level selector (e.g. fix-language / polish / rewrite-in-style), prompt assembly reusing world + chat + GM style context, non-destructive preview (ties into input versioning rollback). Out of scope: auto-send of enhanced text. Acceptance: each level produces visibly distinct output; full-rewrite level demonstrably follows world/chat/GM style; original text restorable.

## Acceptance Criteria

- [x] Implementation complete — 8 levels (spellcheck, wording, expand, strict, creative, style-chat, style-group) in `prompt-improve.ts`; backend `POST /api/generation/prompt` in `generation/prompt-route.ts`; local-first via browser inference; non-destructive via `_promptImproveBackup` + `restorePromptDraft()`
- [x] Tests passing — 13 prompt-improve tests + 10 prompt-analyze tests green
- [x] Documentation updated — this ticket reflects implementation status
