<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Chat-memory + moderation model survey (Llama-Guard, compactors)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Adopt small models for chat memory + moderation domains. Grounded state: src/memory/extraction.ts routes summarization through callAux (auxiliary role, 2s timeout); src/generation/hooks/moderation-hook.ts is keyword-only (SEVERE_KEYWORDS word-boundary, no LLM consumer); chat moderation primitives in src/chat/moderation.ts are permission/audit only. Candidates: Llama-Guard-3-1B-GGUF (QuantFactory/mradermacher, smallest guard GGUF, generative policy verdict) vs Laya typed-decisions (mys/laya-typed-decisions-GGUF ggmlc full-model, calibrated choice/score/noul in one encoder pass, ~25ms/noul on RTX4050, NOT llama.cpp) for injection-guard/toxicity routing; Qwen3-Embedding-0.6B 32k ctx for compaction-window overflow. Scope: per-workflow pick (memory extract vs NSFW flag vs tox flag), wire guard verdict into moderation-hook alongside keyword path, eval vs 2s AUX timeout.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
