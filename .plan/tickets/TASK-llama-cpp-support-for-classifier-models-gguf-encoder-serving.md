<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: llama.cpp support for classifier models (GGUF encoder serving)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Serve encoder classifiers (ModernBERT/DeBERTa/MiniLM fine-tunes, bge-reranker, Laya GGUF if available) via llama-server alongside existing LLM serving.

Grounded state:
- LlamaCppAutoStartConfig (src/config/schema/auto-start.ts) + llamaCppMeta (src/config/sections/generation/llama.ts) already type single-model spawn; multi-model rotation goes through llama-swap proxy.
- llm-serving.md documents extended llama.cpp fields wired end-to-end (reasoning_budget, grammar, response_format); classifier serving needs OpenAI-compatible chat/completions on encoder BERT backbones — verify which llama-server build serves ModernBERT-class GGUFs (embeddings endpoint vs chat).
- Open questions: GGUF availability for each candidate (Laya ships safetensors — needs conversion or Python sidecar); CPU thread/cgroup sizing for 200-400M encoders next to a GPU LLM.

Scope: per-candidate serving verdict (native llama-server / conversion needed / sidecar), minimal config delta, latency check vs 2s AUX timeout.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
