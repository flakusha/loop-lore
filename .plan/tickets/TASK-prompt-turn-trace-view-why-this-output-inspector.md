<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Prompt/turn trace view (why-this-output inspector)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-analytics-observability
**Tags:** observability, prompt-inspector, trace, research-gap
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability
**Summary:** Add a permissioned turn/session trace inspector that explains model output from existing generation attempts, messages, and aux telemetry.
**Context:** Open WebUI session explorer/waterfall patterns validate the product shape. Loop-Lore already persists generation attempts, assistant/tool-result messages, and aux telemetry; no parallel trace store is needed.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Related:** TASK-observability-traceid-plus-true-histograms, TASK-admin-llm-execution-analytics-per-model-per-provider-rollups, FEAT-GENERATION-USAGE-ANALYTICS

## Summary

Provide a why-this-output view for a single turn/session: model/provider, prompt-section token breakdown when available, generation attempts, tool results, aux judge trail, latency, usage, and failure/cancel reason.

## Scope

- Reuse `generation_attempts`, assistant/tool-result messages, and aux telemetry.
- Owning-user access by default; admin content access requires the existing explicit chat-content permission.
- Aggregate usage endpoints remain separate from raw prompt/message content and must not inherit content-export permission implicitly.
- Stable trace/attempt identifiers and correlation across generation, tool, and aux events.
- One bounded trace response; no generic analytics explorer or new event pipeline.

## Acceptance Criteria

- [ ] Trace view reconstructs a seeded turn from existing generation/message/aux facts.
- [ ] Attempts preserve per-call versus cumulative usage semantics and do not double-count cost.
- [ ] Owning-user, other-user, and admin-without-content-permission access cases are tested.
- [ ] Raw prompt/message content never appears in aggregate analytics responses.
- [ ] Failure, cancellation, retry, and tool-result paths render without hiding the terminal outcome.
- [ ] Trace identifiers correlate across generation and aux telemetry.
