<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Cache-token propagation into ExecUsage, exec log and aux.call telemetry

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-prompt-cache-enablement
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Context

First ticket of epic-prompt-cache-enablement.md. Prefix-cache plumbing exists end-to-end (`cachePrompt` request param -> llama-server `cache_prompt`: `generate-route/types.ts:82-84` -> `provider-request.ts:92-93` -> `openai-compatible/http.ts:58-59`) but nothing defaults it on and cache savings are invisible: Anthropic `cache_read_input_tokens`/`cache_creation_input_tokens` are typed (`anthropic/types.ts:47-49`) and dropped — `ExecUsage` (`src/harness/exec-recorder.ts:15-18`) carries only prompt/completion tokens. Prompt assembly is already stable-prefix ordered (`src/assistant/prompt/registry.ts:44-105`).

Boundaries: TASK-ctx-cache-note (`epic-chat-context-optimization.md:114`, Low) is a telemetry *note*, not implementation — this ticket supersedes its substance; EPIC-RAG-EVALUATION-OBSERVABILITY (`9ef32dd`) B-E3 owns a RAG-query semantic cache (`rag_prompt_cache`) — different layer (query results vs provider KV prefix). Coverage: `giwt search "prompt cache"` -> no matches; `search cachePrompt` -> no ticket.

Epic: epic-prompt-cache-enablement.md. Later epic tickets (not filed here): cachePrompt default config key `[generation] cachePromptDefault`; per-provider cache-hit rate in admin provider health; byte-stability test pinning section order.

## Summary

Propagate `cacheReadTokens`/`cacheCreationTokens` into `ExecUsage`, exec-log rows (`.harness/executions.jsonl`), and `aux.call` telemetry (`src/aux-pipeline/runner.ts`).

## Acceptance Criteria

- [ ] `ExecUsage` extended; `computeCostUsd` (`exec-recorder.ts:67-76`) unchanged for unpriced providers; rows include cache fields when the provider reports them and omit them when not (fixture-backed test).
- [ ] Anthropic usage mapping forwards the already-typed fields (`anthropic/types.ts:47-49`).
- [ ] Zero behavior change for providers that report no cache tokens (all existing tests pass unchanged).
- [ ] `aux.call` telemetry events carry the new fields when present.

## Caveats

- [ ] Additive-only shape change: consumers of ExecUsage/exec-log must tolerate absent fields.
- [ ] Observability: cache fields are themselves the observability deliverable.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
