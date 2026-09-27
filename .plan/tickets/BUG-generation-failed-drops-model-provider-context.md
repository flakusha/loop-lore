<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: generation.failed drops model/provider context — failed calls unattributable

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-analytics-observability
**Summary:** `generation.failed` records only `{ error, chatId }`; model and provider are dropped, so per-model error-rate analysis is impossible.
**Context:** Found 2026-09-27 during LLM execution-stats analysis. Sibling `generation.completed` (post-store.ts:147, non-stream.ts:170, stream-to-client.ts:233) records full token + model + provider context; the failure path does not.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Related:** BUG-generation-completed-latencyms-hardcoded-to-0-on-two-emit-pa, FEAT-error-monitoring-alert-rules-crud-webhook-notifications-erro, src/generation/auto-gen/handle-generation-error.ts

## Summary

`handleGenerationError` (`src/generation/auto-gen/handle-generation-error.ts:36-42`) records `generation.failed` with `data: { error, chatId }` only. The caller (`src/generation/auto-gen/auto-generation.ts:271`) has `resolved.resolvedModel` / `resolved.resolvedProviderName` in scope (threaded identically into the completed path at :260-261) but does not pass them. Failed calls — retries, timeouts, provider outages — therefore carry no model/provider identity, so per-model error-rate analysis and E11 error grouping cannot attribute them.

## What

- `src/generation/auto-gen/handle-generation-error.ts:22-29` — signature takes `(error, database, d, chatId, userId, attemptId?)`; no model/provider/token params.
- `src/generation/auto-gen/handle-generation-error.ts:36-42` — `data: { error, chatId }` only.
- `src/generation/auto-gen/auto-generation.ts:177-178` — `resolved` in scope at call site; `:260-261` passes `resolvedModel`/`resolvedProviderName` to the completed path but `:271` passes neither to the failure path.
- Consumers: `GET /api/telemetry/analytics/errors` groups by `event_type` only (telemetry.ts:150-161); `GET /api/analytics/overview` counts `generation.failed` without model split (analytics.ts:142-147). Both could group by model once the field exists.

## Why

Error-rate-by-model is the core E11-adjacent admin question ("which model is failing?"). The completed path already answers "which model succeeded"; the failure path must answer symmetrically or every error dashboard misattributes.

## Scope

- Extend `handleGenerationError` opts with optional `model`/`provider` (keep required params positional-compatible or switch to options object — smallest diff that typechecks).
- Pass `resolved.resolvedModel` / `resolved.resolvedProviderName` at the auto-generation.ts:271 call site. Also cover generate-route failure paths (non-stream throw, stream catch) if they emit `generation.failed` — else note explicitly as follow-up.
- Keep raw `error` message redaction posture unchanged (telemetry.ts errors projection already narrows to counts; do not widen the wire shape).
- Regression test: failed generation records `model` + `provider` in `event_data`.
- Out of scope: alerting rules/webhooks (E11 ticket), latency fix (sibling BUG), per-model pricing.

## Acceptance Criteria

- [ ] `generation.failed` `event_data` carries `model` + `provider` on the auto-gen path
- [ ] Generate-route failure paths covered or explicitly listed as follow-up in the ticket
- [ ] Errors projection wire shape unchanged (no new PII/raw-text leak)
- [ ] `bun test src/generation/` green
