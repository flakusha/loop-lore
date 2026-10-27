<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Classifier model support complementary to AUX pipeline (Laya/Jev)

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-classifier-template-packs
**Summary:** Dedicated classifier models (Laya/Jev-class) as a complement to the generative AUX pipeline — classifier ModelRole value, routing with generative fallback, fine-tune-vs-Jev decision per label set.
**Context:** Classifier-shaped AUX tasks (NSFW, intent, transitions, injection-check) currently route through generative LLMs via callAux; grounded state and Laya/Jev facts in ## Summary below.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Caveats:** partial failure — a classifier verdict that never arrives must degrade to the generative path or `null`, never block a turn (ruled out: `callAux` already returns graceful `null` on any failure and the routing keeps the generative fallback); rollback — adding a `ModelRole.Classifier` value and routing classifier-shaped tasks to it must be revertible per task without a schema migration (ruled out: `model_role_overrides.role` is a plain-text PK with no CHECK constraint, so a new role value needs no migration and the routing falls back when the role is unset); stale state — base Laya checkpoints are near-chance zero-shot on specialised labels (0.362 vs 0.461 majority baseline) and probabilities are not calibrated, so a classifier left pointed at an un-fine-tuned checkpoint silently grades worse than the generative path it replaced (ruled out: the per-label-set fine-tune-vs-Jev decision is an explicit deliverable of this ticket, and cutoffs are configured per model id); authorization — the classifier role must be assignable only by an admin through the existing role-override surface (ruled out: `VALID_ROLES` in `src/admin/model-roles.ts` is the admin-facing allowlist, extended with the new value); security — a remote closed classifier (Jev) sends conversation content off-host, so it may only be used where an admin has explicitly configured it (ruled out: the ticket keeps Jev out of the default path and the local llama.cpp transport is the default); observability — `aux.call` telemetry must record which transport answered, otherwise a classifier regression is invisible (ruled out: the existing telemetry event is extended with the transport, per the runner's single shared policy); TOCTOU, parallelism, lock/unlock lifecycle, data races and idempotency — not applicable to a read-only classification call (ruled out: no writes, no locks, no shared mutable state).

## Summary

Research: dedicated classifier models (convaiinnovations/laya, TypeSafe Jev) as complement to the generative AUX pipeline, not a replacement.

Grounded state (src/):
- src/aux-pipeline/runner.ts callAux(task, config, db, messages, opts): single shared policy (2s timeout, temp 0, BYO apiKey parity, telemetry aux.call), graceful null on any failure. AuxTaskName = transition|intent|memory|nsfw|gm-tool|prompt-improve|prompt-analysis|injection-check|message-action|chat-title.
- Classifier-shaped tasks already route through generative LLMs: detectNsfwWithLlm (src/generation/hooks/nsfw-classifier.ts, JSON rating parse), classifyIntent (src/generation/auto-gen/classify-intent.ts), transition-classifier (src/chat/transition-classifier.ts), prompt-injection step 2 (src/validation/prompt-injection.ts).
- ModelRole enum (src/db/enums-core/flags.ts) already has moderation/embeddings/summarization values, but VALID_ROLES (src/admin/model-roles.ts) exposes only main/auxiliary/captioning. model_role_overrides.role is plain-text PK (001_init.ts) — no CHECK constraint, so a new role value needs NO migration.

Laya facts (huggingface.co/convaiinnovations/laya, Apache-2.0):
- 421M ModernBERT-large + decision head, non-autoregressive: typed choice/score/noul answers, temperature-scaled probs (upstream: not guaranteed calibrated — cutoffs belong per model and per quantization), single forward pass ~33ms GPU / 193-464ms CPU, 100+ langs via mmBERT subfolder (322M, ctx 1024).
- Router(preload=True) required in prod: lazy max_loaded=1 costs 7-10s rebuild per language switch.
- Honest limits: base checkpoints near-chance zero-shot on specialised benchmarks (0.362 vs 0.461 majority baseline); >20 options degrades (Banking77 0.425 vs Jev 0.870, shared head_max_len budget); raw ECE 0.213 pre-temperature. Capability comes from fine-tuning (typed-decisions ckpt 0.766, notebook provided).
- Jev: closed API, $0.042/1M tokens, 236-276ms p50, better at 50+ options out-of-box.

Scope: add classifier ModelRole value + VALID_ROLES entry, route classifier-shaped AUX tasks to it with generative fallback (callAux null path already exists), document fine-tune-vs-Jev decision per label set. See sibling tickets for llama-swap recipe, llama.cpp/TS path, eval harness.

Update 2026-10-26: llama.cpp now serves native decision models over `POST /v1/systemone` (typed `choice`/`score`/`noul`, probabilities, zero generated text), so the serving story for a dedicated classifier is no longer "run the Laya decision head outside llama.cpp" — see `TASK-llama-cpp-decision-model-client-for-aux-classification.md` for the client and `TASK-llama-cpp-support-for-classifier-models-gguf-encoder-serving.md` for the serving verdicts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
