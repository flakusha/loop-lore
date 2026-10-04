<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: llama-swap sample config finalization (unblocks rotation policy)

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-llm-request-scheduler

**Summary:**

FEAT-llama-swap-rotation-exclusion-policy is blocked on user sample config still in ironing-out. Deliverable: committed configs/config.llama-swap.example.yaml reviewed against the Part-1 contract (model set, per-model footprint, reload semantics), promoted to a tested fixture input for the real-llm e2e ticket. Until this lands, rotation/exclusion parser has no target shape. Epic: epic-llm-request-scheduler.

**Context:**

FEAT-llama-swap-rotation-exclusion-policy is blocked on a sample config still being ironed out. Direction matters: the rotation ticket's Part-1 contract specifies the interface loop-lore needs; the sample finalizes against that contract, not vice versa. Otherwise the parser gets reverse-engineered from a moving file.

**Scope:**

Part-1 contract review gate only — no parser, no rotation implementation (those live in FEAT-llama-swap-rotation-exclusion-policy). Deliverable: `configs/config.llama-swap.example.yaml` reviewed line-by-line against the Part-1 contract and promoted to a tested fixture input for the real-LLM path. Read-only w.r.t. the user's real config: loop-lore never rewrites it.

**Acceptance Criteria:**

- [ ] Part-1 contract reviewed: model-set parse (model ids + OpenAI-compatible alias per entry), per-model footprint/grouping (`swap`/`exclusive`/`persistent` or `matrix` DSL as expressed in `configs/config.llama-swap.example.yaml:193-208`), reload semantics (restart-required; no watcher — per FEAT-llama-swap-rotation-exclusion-policy Part 2, `src/config/schema/auto-start.ts:172-173` `LlamaSwapAutoStartConfig.configPath` read-once-at-startup).
- [ ] `configs/config.llama-swap.example.yaml` finalized against that contract: every Part-1 field maps to a concrete YAML location; placeholders (`<placeholder-*>`) confined to values, never to structure; vscode `$schema` modeline (`configs/config.llama-swap.example.yaml:8`) intact.
- [ ] Sample promoted to tested fixture: a parser test (in FEAT-llama-swap-rotation-exclusion-policy scope) loads the committed sample and asserts the expected model set — fixture input, not parser implementation, is this ticket's deliverable.
- [ ] Read-not-manage: AC cites no write path to the user's file; parse failure posture matches fail-open precedent `src/services/server-external-manager/start-llama.ts:214-223` (log + default, never throw at startup).
- [ ] Unblock signal: FEAT-llama-swap-rotation-exclusion-policy Part 1 can be marked satisfied against this sample without rework — reviewer confirms contract-to-YAML mapping, notes any gap as a follow-up ticket rather than scope-creeping this one.

**Reuse refs:** `configs/config.llama-swap.example.yaml` (sample under review), FEAT-llama-swap-rotation-exclusion-policy Part 1 §1-3 (model set / per-model properties / reload semantics), `src/config/schema/auto-start.ts:172-173` (`configPath`), `src/services/server-external-manager/start-llama.ts:166-179,214-223` (spawn + fail-open read), normative contract §5 (read-only: `tree/feat-llm-scheduler-docs/docs/spec/generation-scheduler.md`).
