<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Text-generation logit bias + logprobs inspection

**Status:** Not Started
**Summary:** Add `logitBias` + `logprobs` generation params with per-provider mapping and a power-user viewer.
**Context:** ST `public/scripts/logit-bias.js` + `logprobs.js`; loop-lore providers map samplers but grep `logit|logprob` in `src/`: 0 hits (2026-09-21 refs audit).
**Acceptance Criteria:**
- [ ] Biasing a token suppresses/promotes it (stubbed-provider test)
- [ ] Unsupported provider returns 422 naming the parameter
- [ ] Returned logprobs attach to message debug payload; viewer toggle renders them
**Epic:** epic-provider-plugin-ecosystem.md
**Type:** Feature | **Priority:** Low | **Effort:** S

## Problem

SillyTavern exposes per-request **logit bias** (token biasing UI — `public/scripts/logit-bias.js`) and a **logprobs viewer** (per-token probabilities — `public/scripts/logprobs.js`). Loop-lore's provider layer already maps a rich sampler set (`topP/topK/minP/typicalP/repeatPenalty/dryMultiplier` etc., `src/generation/providers/openai-compatible/http.ts`, `ollama-native/http.ts`, `anthropic/request.ts`) but has **no** `logit_bias` or `logprobs` parameter anywhere (grep `logit|logprob` in `src/`: 0 hits, verified 2026-09-21).

## Change

- Add `logitBias: Record<tokenId|tokenString, number>` and `logprobs: { top: number } | undefined` to the generation params type; map per provider where supported (OpenAI-compatible `logit_bias`/`logprobs`, local backends via llama.cpp params where available); unsupported providers → explicit validation error, not silent drop.
- Per-token bias UI: token string → tokenizer ID (reuses local tokenizer work in epic-chat-context-optimization).
- Response surface: attach returned logprobs to the message payload (debug field), viewer toggle in message actions for power users.

## Acceptance

- Biasing a token demonstrably suppresses/promotes it in a stubbed-provider test.
- Unsupported provider returns 422 naming the parameter, not silently ignoring it.

## Non-goals

- Text-level CFG guidance (SD `cfg_scale` is image-side and already exists).
