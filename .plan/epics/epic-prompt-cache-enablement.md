<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Provider Prompt-Cache Enablement + Cache-Token Observability

**Effort:** Small
**Type:** epic
**Tags:** generation, prompt-cache, observability, cost
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Medium

## Summary

The cache principle is half-implemented by accident: prompt assembly is stable-prefix ordered (`src/assistant/prompt/registry.ts:44-105`) and the `cache_prompt` plumbing exists end-to-end (`cachePrompt` → llama-server, `generate-route/types.ts:82-84` → `provider-request.ts:92-93` → `openai-compatible/http.ts:58-59`), but nothing turns it on and cache savings are invisible (`anthropic/types.ts:47-49` typed, `ExecUsage` `exec-recorder.ts:15-18` has no cache fields). Externally validated practice: providers expose exactly these counters for verification (Anthropic prompt-caching docs, 2026-11; LiteLLM).

## Scope

- (a) Propagate `cacheReadTokens`/`cacheCreationTokens` into `ExecUsage`, exec-log rows, and `aux.call` telemetry (first ticket).
- (b) Config key `[generation] cachePromptDefault` applied to llama.cpp/OpenAI-compatible dispatches (opt-in first; default-on decision inside the epic).
- (c) Per-provider cache-hit-rate in admin provider health.
- (d) Byte-stability test pinning section order so the cacheable prefix is contractually stable.

## Related Epics / Boundaries

- `TASK-ctx-cache-note` (`epic-chat-context-optimization.md:114`, Low) — a telemetry *note*, not implementation; this epic owns the implementation and should close that note.
- EPIC-RAG-EVALUATION-OBSERVABILITY `9ef32dd` B-E3 — owns a **RAG-query semantic cache** (`rag_prompt_cache`): different layer (query results vs provider KV prefix); boundary stated to avoid conflation.
- Coverage check: `giwt search "prompt cache"` → no matches; `search cachePrompt` → no ticket owns it (2026-11-01).

## Tickets

- `TASK-cache-token-propagation-into-execusage-exec-log-and-aux-call` (`962f2e9`, Medium) — cache-token propagation (4 ACs per research doc).

## Open Questions

- Default-on vs opt-in for `cachePromptDefault` — decision deliberately deferred to inside the epic (research doc: "opt-in first, default-on decision inside the epic").
