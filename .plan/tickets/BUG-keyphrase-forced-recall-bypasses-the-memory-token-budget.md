<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Keyphrase forced recall bypasses the memory token budget

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-memory-knowledge-systems

**Summary:** collectKeyphraseHits draws from allAccepted (pre-budget) and applyKeyphraseRecalls appends forced hits after selectWithinBudget and the injection filter, bounded only by the recall limit (default 3, hard cap 20). A 1024-token memory budget can be overflowed by up to 20 entries. **Context:** Research .tmp/research/memory-management-injection-shipped-2026-11-24.md gap 2. Evidence: src/assistant/prompt/sections/memories.ts:96 vs 216, src/assistant/prompt/sections/memories-keyphrase.ts:137-177, MAX_LIMIT=20. **Acceptance Criteria:** forced recalls charged against the section token budget (or clamped so selected+forced fits maxTokens and maxPerMessage); test overflows no more than the budget allows. **Caveats:** TOCTOU between budget check and append; observability (forced ids already audit-logged with keyphrase flag, keep it); stale cooldown interplay.
