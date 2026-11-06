<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: harness-model-discovery-ui-wiring-frontend-models-caller-cost-aware-selector

**Status:** Not Started
**Blocker:** HELD — sibling lane `harness-approval-fixes` (`528c160f3`) carries follow-up fixes on top of the landed approval-operability slice (`f5b0d91c3`/`304821a14`); this models-UI ticket is report-only from the sibling lane and stays Not Started until its own implementation lane exists. Do NOT touch.
**Priority:** medium
**Effort:** Small
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Wire the admin UI to the harness models endpoint: `GET /api/v1/harness/models` (`src/routes/harness/models.ts:43`) is server-wired with schemas (`admin-harness-schema.ts:262-283`) and tests, but no frontend caller fetches it — `harnessModelsEmpty()` (`admin-harness.ts:219`) reads an empty-by-default row list, and the cost-aware selector path (`toRoutableCandidates:314`, cost tiebreak at `runtime.ts:128`) is unwired. Server side stays in `TASK-model-discovery-capability-enrichment` (Done); this ticket is the UI half.

**Context:**

## Why

Parity matrix gap #2 (SHIPPED server-only): discovery + capability enrichment work from the backend, but the admin panel and the selector never consume them. The models tab renders empty, and cost-aware routing never engages.

## Scope

- Alpine caller in `admin-harness.ts` (or the models slice) fetching `GET /api/v1/harness/models`, populating `harnessModelRows`, reusing the existing `HarnessModelsResponse` schema and the runs/stats error/empty-state pattern.
- Wire discovered models into the selector: `toRoutableCandidates:314` + cost tiebreak at `runtime.ts:128` so costs actually break ties.
- Keep the static fallback semantics (live-only `discoverHarnessModels:197`, `reason` explains static entries).

## Do NOT touch

- Do NOT change the route contract or schemas (server side Done).
- Do NOT regress the static-fallback path when no live connection exists.

**Acceptance Criteria:**

- [ ] Admin models surface lists discovered models (live + static-fallback with `reason`) instead of rendering empty.
- [ ] Selector consumes discovered models; cost tiebreak engages (unit test).
- [ ] Empty/error states match the existing runs/stats pattern (no error masquerading as empty).
