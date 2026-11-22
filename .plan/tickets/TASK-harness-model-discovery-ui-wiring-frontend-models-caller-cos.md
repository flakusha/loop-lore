<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: harness-model-discovery-ui-wiring-frontend-models-caller-cost-aware-selector

**Status:** Done
**Status Note:** Shipped on dev — the frontend caller consumes the discovered models (`src/frontend/alpine/admin-harness-models.ts:26-27,53`) and the cost tiebreak is live in the selector (`src/integrations/harness/profile-selector.ts:132-136` comparator, `:219-224` sort over discovered prices).
**Amended (2026-11-21):** the frontend caller already exists — `src/frontend/alpine/admin-harness-models.ts` (`MODELS_URL`, `loadHarnessModels`) is imported by `admin-harness.ts:30`. Only the cost tiebreak remains; the HELD sibling-lane blocker is stale.
**Priority:** medium
**Effort:** Small
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Wire discovered models into the cost-aware selector. `GET /api/v1/harness/models` is server-wired (`src/routes/harness/models.ts:43`) and the frontend caller is shipped (`admin-harness-models.ts`, imported at `admin-harness.ts:30`); `harnessModelsEmpty()` (`admin-harness.ts:223`) now reads populated rows. The only open half is the cost tiebreak: `toRoutableCandidates:314` → `runtime.ts:128`, so discovered cost breaks selector ties instead of failover-only ordering.

**Context:**

## Why

Parity matrix gap #2 (SHIPPED server-only): discovery + capability enrichment work from the backend, but the admin panel and the selector never consume them. The models tab renders empty, and cost-aware routing never engages.

## Scope

- Wire discovered models into the selector: `toRoutableCandidates:314` + cost tiebreak at `runtime.ts:128` so costs actually break ties.
- Keep the static fallback semantics (live-only `discoverHarnessModels:197`, `reason` explains static entries).
- Do not rebuild the frontend caller (`admin-harness-models.ts`) — it is shipped.

## Do NOT touch

- Do NOT change the route contract or schemas (server side Done).
- Do NOT regress the static-fallback path when no live connection exists.

**Acceptance Criteria:**

- [x] Selector consumes discovered models; cost tiebreak engages (unit test) — `compareCandidateCost` (`src/integrations/harness/profile-selector.ts:132-136`) sorts admitted candidates by discovered price (`:219-224`).
- [x] Static-fallback semantics preserved (live-only discovery, `reason` explains static entries) — discovery stays live-only; `reason` still explains static entries.
