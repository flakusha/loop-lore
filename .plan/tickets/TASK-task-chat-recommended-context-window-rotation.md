<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TASK-chat-recommended-context-window-rotation

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-chat-context-optimization

**Summary:**

Owner epic: `.plan/epics/epic-chat-context-optimization.md`

## Background

Per-chat context today defaults to the provider/model maximum, but inference degrades as the filled context grows (KV-cache memory + attention cost scale with length; long filled contexts are slower and lower-quality than tight ones). What exists:

- Window computation: `src/chat/context-window.ts:53-146` (`computeContextWindow()` sliding window over `MessageRef[]` with `DEFAULT_MIN_RECENT=8` at `:33`).
- Budget selection: `src/memory/budget.ts:26-80` (`selectWithinBudget()` importance/confidence sort, pinned never dropped, default 1024 tokens at `:17`); `src/memory/provision.ts:63-95` (`provisionMemories()` scope/privacy/shareability then budget).
- Assembly: `src/assistant/prompt-assembler.ts:59-107` (19 ordered `PROMPT_SECTIONS` from `src/assistant/prompt/registry.ts:44`, whole-section drop over budget at `:91-93`); counts via char heuristic `src/chat/token-utils.ts:23-26` (`estimateTokens` = chars/4).
- Per-model window lookup already exists: `getContextWindowForModel` (`src/admin/model-capabilities.ts:189`, overrides module).

Established solutions: llama.cpp KV-cache behavior - context length eats VRAM/latency superlinearly, so smaller effective windows stay in fast memory - https://insiderllm.com/guides/kv-cache-optimization-guide ; Letta/MemGPT virtual context management - pinned in-context blocks + archival/recall memory outside the window, agents page between them with functions - https://docs.letta.com/advanced/memory-management , https://www.leoniemonigatti.com/blog/memgpt.html . Full KV-quantization/paged-attention tuning DEFERRED (llama.cpp server-side concern, not prompt assembly).

## Change

1. Per-chat `recommended_context_tokens` setting (chat column + `gm_config` override + server default; resolver mirrors `src/chat/response-length.ts`): effective budget = min(recommended, model max). Defaults stay conservative (e.g. 8k) even when the model advertises 128k.
2. Full/partial rotation via recall: when history exceeds the recommended window, older segments roll into lossy-by-summary (`ContextCompactor` `[Conversation Summary]`) + remain retrievable through `provisionMemories` recall instead of raw verbatim refill; lossless `keepLast` recent window untouched (epic lossless/lossy contract).
3. Wire effective budget into `PromptAssembler` ctx (`prompt-assembler.ts:59-93`) + `computeContextWindow` callers so both PATH A and the debug PATH B honor it; emit `tokenBudget vs modelMax` + rotation events to telemetry (compression metadata per `epic-chat-context-optimization.md:42-44`).

## Acceptance

- Setting a 4k recommended window on a 128k model caps assembled prompts at ~4k; unset falls back to model max (existing behavior, no regression).
- Long chat exceeding the window stays coherent: summary + recall path answers questions about rotated-out segments; verbatim refill of the full history is never required.
- Inference latency measured lower (or context bounded) on the canary fixture: report p50/p95 generation latency before/after on a fixed 50-turn script; land only if bounded window is not slower.
- Existing provision/injection tests still green; lossless tiers never summarized.

**Caveats:** TOCTOU: budget resolved once per assembly from the same chat row read; concurrent settings edits apply next turn, never mid-assembly. Security: rotated-out segments keep scope/privacy - recall path re-applies `provisionMemories` filters. Partial failure: compactor failure falls back to truncate-oldest, never fails generation. Rollback: column nullable, NULL = legacy behavior. Stale state: summary pinned to explicit message range; never re-summarize already-rotated ranges. Observability: emit budget source (chat/gm/server/model-max), rotated token counts, recall hit rate.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
