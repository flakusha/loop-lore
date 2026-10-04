<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: llama-swap sample config finalization (unblocks rotation policy)

**Status:** Not Started
**Priority:** Medium
**Effort:** Small
**Epic:** `.plan/epics/epic-llm-request-scheduler.md`

**Summary:** Finalize the user-prepared llama-swap sample config against the Part-1 contract in `FEAT-llama-swap-rotation-exclusion-policy` (model set, per-model footprint, reload semantics), then promote it to a tested fixture input for the rotation parser. Until this lands, the rotation/exclusion parser has no target shape. Prerequisite input — not a scheduler build ticket.

**Context:** Only `configs/config.llama-swap.example.yaml` is committed; no live config exists yet. The example already documents group-engine rotation (`llm-rotation` exclusive/swap group, `helpers` persistent group), TTL/offload mechanics, and startup preload — finalization verifies that shape against the contract rather than inventing a new one.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] Example reviewed field-by-field against the Part-1 contract: every model has a requestable id, group membership (`llm-rotation` vs `helpers`) is explicit, TTL/preload semantics documented inline (already largely present — verify, don't rewrite).
- [ ] Any contract-required field missing from the example is added with a `<placeholder-…>` value per the file's existing convention — never a real local path.
- [ ] Rotation-parser test fixtures mirror this file's shape; drift between fixture and example is a test failure.
- [ ] No live credentials, paths, or host-specific values committed; `bun run check` green.

## Reuse refs

- `configs/config.llama-swap.example.yaml` — the file under review
- `src/services/server-external-manager/start-llama.ts:167-223` — spawn + fail-open config-read precedent
- `src/config/schema/auto-start.ts:169-174` — `LlamaSwapAutoStartConfig.configPath`
- `FEAT-llama-swap-rotation-exclusion-policy.md` — Part-1 contract this finalizes against
