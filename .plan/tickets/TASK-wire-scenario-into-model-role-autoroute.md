<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Wire scenario into model role autoroute

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-model-rankings-history.md

**Summary:**

**Summary:**

Close the Required 1.0.0 “use-case scenarios → optimal autoroute” clause. Scenario ranking exists and resolves a model, but no production caller supplies a scenario, so the shipped grading data never selects a chat model.

**Evidence (verified 2026-11-18, dev):**

- `resolveModelRole(role, config, db, opts?: { scenario?: string })` and `scenarioDefault()` call `recommendScenarioModel` (`src/admin/model-roles.ts:50-75,92-97`).
- `recommendScenarioModel` reads `model_rankings` through a fixed metric map and config-derived candidate ids (`src/models/scenario-ranking.ts:55`).
- Every production caller omits `scenario`: e.g. `src/routes/setup/checks.ts:100`, `src/aux-pipeline/runner.ts:63-77`, `src/generation/caption-route.ts:84`, `src/routes/auth/...` none pass it. Only tests pass `{ scenario: ... }`.
- DB overrides and config role assignments intentionally bypass ranking (`src/admin/model-roles.ts:81-84`), so an operator can still pin a model.

**Scope:**

- Choose one production call site (main chat role is the conservative default) and thread a scenario value into `resolveModelRole`. The value must come from explicit config or an admin-controlled per-chat/per-role setting, never from untrusted message text.
- Keep the existing precedence: DB override > config role assignment > scenario ranking > default.
- Expose the scenario choice in the existing admin model-roles surface or narrow the Required wording if the operator decides the API alone is enough.
- Add a test that proves a ranked model is selected when no override exists and that both override tiers still bypass ranking.

**Context:**

Filed from the 2026-11-18 release audit: `resolveModelRole` can select by ranking when a scenario is supplied, and the rankings/UX epics are Done, but no production caller supplies one. Closing that last leg is inside the Required 1.0.0 autoroute scope.

**Caveats:** TOCTOU: rankings can change between resolution and generation; resolve per turn. Security: scenario is an internal selector, not user-controlled prompt text. Authorization: only admins may set the scenario/defaults. Parallelism: read-only ranking query; no shared write state. Lock/unlock lifecycle: n/a. Partial failure: ranking errors already degrade to default (`src/admin/model-roles.ts:68-74`); keep that. Rollback: config-driven opt-in, default unchanged. Stale state: ranking rows age; document refresh. Data races: none added. Idempotency: same inputs → same model. Observability: log the chosen `source` (`ranking` vs `db`/`config`/`default`).

**Acceptance Criteria:**

- [ ] At least one production model-role resolution passes a scenario and can return `source: "ranking"`.
- [ ] DB and config overrides still bypass ranking, covered by tests.
- [ ] The scenario input is admin-controlled and validated against the fixed scenario vocabulary.
- [ ] Docs/changelog state how autoroute is enabled and how ranking rows are refreshed.

