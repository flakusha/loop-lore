---
title: "FEAT-060: Model comparison A/B"
status: open
priority: medium
labels: [feature, generation, admin]
epic: epic-byok-api-keys
related: [FEAT-067, FEAT-062, FEAT-068]
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-060: Model comparison A/B

## What

Side-by-side comparison of LLM model responses for the same prompt, with quality rating and exportable comparison reports.

## Why

When choosing between models (or tuning parameters), users need to see how different models handle the same input. Currently this requires manually switching models and copying responses. A/B comparison makes model evaluation systematic and shareable.

## Current State

- `src/generation/` — multi-provider generation pipeline
- `src/generation/providers/` — OpenAI, local, ComfyUI providers
- No comparison tooling exists

## Acceptance Criteria

- [ ] **`/api/generation/compare`** — accepts prompt + array of model configs, returns parallel generation results with timing metadata
- [ ] **Comparison view** — side-by-side response display with: response text, latency, token count, estimated cost
- [ ] **Quality rating** — user can rate each response (1-5 stars) and add notes
- [ ] **Comparison history** — saved comparisons accessible via `/api/comparisons` with pagination
- [ ] **Export** — comparison report as JSON or markdown (prompt, responses, ratings, metadata)
- [ ] **Parameter sweep** — optional: same model with different temperature/top_p values
- [ ] Unit tests for parallel generation and report formatting

## Implementation Notes

- Route: `src/routes/generation/compare.ts` (new)
- Parallel: `Promise.allSettled()` for independent model calls — one failure doesn't block others
- Storage: `model_comparisons` table: `id`, `prompt`, `results` (JSON), `ratings` (JSON), `created_at`
- UI: new comparison page or modal in admin panel
- Cost estimation: use FEAT-067 registry for pricing data when available
- Size gate: comparison files <250L each

## Dependencies

- Blocked by: FEAT-067 (model capability registry for accurate model info)
- Blocks: nothing
