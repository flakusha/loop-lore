---
title: "FEAT-067: Model capability registry"
status: open
priority: medium
labels: [feature, generation, providers]
epic: epic-byok-api-keys
related: [FEAT-068, FEAT-060]
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-067: Model capability registry

## What

Build a persistent registry of LLM model capabilities (context window, function calling, vision, thinking/reasoning, pricing, parameter size) that auto-populates from provider metadata and allows user overrides.

## Why

Several features need to know model capabilities at runtime:
- Token budget advisor (FEAT-068) needs accurate context window size
- Model comparison A/B (FEAT-060) needs to know which models support function calling
- Prompt assembly needs to know if tool-calling is available
- UI needs to display model info in provider health panels

Currently, `ModelInfo` is extracted per-request from `/v1/models` responses but never persisted. If a provider goes offline, the capability data is lost.

## Current State

- `src/generation/providers/openai-compatible/metadata.ts` — `modelInfoFromOpenAi()` extracts `ModelInfo` (id, contextWindow, maxOutput, thinking, toolCalling, modalities, paramSize, ownedBy)
- `src/generation/providers/types.ts` — `ModelInfo` interface
- `src/frontend/alpine/context-window.ts` — uses hardcoded 32000 default
- No persistence — metadata is ephemeral per-request

## Acceptance Criteria

- [ ] **`model_capabilities` table** — migration adding `model_capabilities` table: `provider_id`, `model_id`, `context_window`, `max_output`, `supports_tools`, `supports_vision`, `supports_thinking`, `modalities` (JSON), `param_size`, `owned_by`, `last_seen`, `user_override` (boolean), `notes`
- [ ] **Auto-populate on provider health check** — when `/api/admin/providers` health check runs, persist discovered model metadata
- [ ] **User override API** — `PATCH /api/admin/models/:id/capabilities` lets admins manually set/override capabilities
- [ ] **Query helper** — `getModelCapabilities(db, providerId, modelId)` returns merged auto-detected + user-override data
- [ ] **Context window resolution** — `context-window.ts` resolves maxTokens from registry instead of hardcoded 32000
- [ ] **Provider health panel** — admin UI shows registered models with their capabilities
- [ ] Unit tests for auto-populate, override merge, and fallback behavior

## Implementation Notes

- Table schema: compound unique key on `(provider_id, model_id)` — one row per provider+model pair
- Merge strategy: user_override fields take precedence when set; auto-detected fields fill gaps
- Staleness: models not seen in >30 days get `stale` flag; admin can bulk-refresh
- Keep `ModelInfo` as the in-memory type; add `persistModelInfo(db, info, providerId)` + `loadModelInfo(db, providerId, modelId)`
- Size gate: model-capability files should stay <200L each

## Dependencies

- Blocked by: nothing (standalone infrastructure)
- Blocks: FEAT-068 (token budget advisor reads from registry), FEAT-060 (model comparison uses capability data)
