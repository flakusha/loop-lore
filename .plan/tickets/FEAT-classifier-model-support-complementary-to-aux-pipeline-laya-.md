<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Classifier model support complementary to AUX pipeline (Laya/Jev)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Large

## Summary

Research: dedicated classifier models (convaiinnovations/laya, TypeSafe Jev) as complement to the generative AUX pipeline, not a replacement.

Grounded state (src/):
- src/aux-pipeline/runner.ts callAux(task, config, db, messages, opts): single shared policy (2s timeout, temp 0, BYO apiKey parity, telemetry aux.call), graceful null on any failure. AuxTaskName = transition|intent|memory|nsfw|gm-tool|prompt-improve|prompt-analysis|injection-check|message-action|chat-title.
- Classifier-shaped tasks already route through generative LLMs: detectNsfwWithLlm (src/generation/hooks/nsfw-classifier.ts, JSON rating parse), classifyIntent (src/generation/auto-gen/classify-intent.ts), transition-classifier (src/chat/transition-classifier.ts), prompt-injection step 2 (src/validation/prompt-injection.ts).
- ModelRole enum (src/db/enums-core/flags.ts) already has moderation/embeddings/summarization values, but VALID_ROLES (src/admin/model-roles.ts) exposes only main/auxiliary/captioning. model_role_overrides.role is plain-text PK (001_init.ts) — no CHECK constraint, so a new role value needs NO migration.

Laya facts (huggingface.co/convaiinnovations/laya, Apache-2.0):
- 421M ModernBERT-large + decision head, non-autoregressive: typed choice/score/noul answers, calibrated probs, single forward pass ~33ms GPU / 193-464ms CPU, 100+ langs via mmBERT subfolder (322M, ctx 1024).
- Router(preload=True) required in prod: lazy max_loaded=1 costs 7-10s rebuild per language switch.
- Honest limits: base checkpoints near-chance zero-shot on specialised benchmarks (0.362 vs 0.461 majority baseline); >20 options degrades (Banking77 0.425 vs Jev 0.870, shared head_max_len budget); raw ECE 0.213 pre-temperature. Capability comes from fine-tuning (typed-decisions ckpt 0.766, notebook provided).
- Jev: closed API, $0.042/1M tokens, 236-276ms p50, better at 50+ options out-of-box.

Scope: add classifier ModelRole value + VALID_ROLES entry, route classifier-shaped AUX tasks to it with generative fallback (callAux null path already exists), document fine-tune-vs-Jev decision per label set. See sibling tickets for llama-swap recipe, llama.cpp/TS path, eval harness.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
