<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Extend FE-BE harmonization gate to cover external/non-htmx API clients

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-headless-alternative-frontends.md

**Summary:**

scripts/check-fe-be-harmonization.ts scans only in-repo src/frontend/** plus src/components/src/views HTML. External clients (Fresh, framework SDKs, embeddable engine) consume /api/* with no contract gate, so the drift class the gate exists to catch is unguarded the moment a second frontend ships. OpenAPI generation already ships (src/routes/v1/openapi.ts, FEAT-039). Define the published API contract (OpenAPI/versioned types) as the gate for non-htmx clients. See the HDL<->FBH gap (FB1) in matrix-frontend-backend-integration.md.

**Context:**

`scripts/check-fe-be-harmonization.ts` proves FE call sites map to real Elysia routes, but its scan set is in-repo only (`src/frontend/**` + `src/components`/`src/views` HTML). External clients — Fresh, framework SDKs, the embeddable engine — consume `/api/*` with no contract gate, so the drift class the gate exists to catch is unguarded the moment a second frontend ships. OpenAPI generation already ships (`src/routes/v1/openapi.ts`, FEAT-039), so the published contract exists; what is missing is wiring it as the gate for non-htmx clients. No ticket tracks this.

**Acceptance Criteria:**

- [ ] The harmonization gate (or a sibling gate) covers external/non-htmx API consumers against the published OpenAPI/versioned contract.
- [ ] `scripts/check-fe-be-harmonization.ts` (or a new gate script) reports drift for external client call sites, not just in-repo `src/frontend/**`.
- [ ] The gate is wired into `bun run check` (advisory or blocking, matching the existing promote-to-blocking decision).
- [ ] `bun run plan:validate` passes; `epic-headless-alternative-frontends.md` and `epic-fe-be-harmonization.md` cross-reference the external-client contract.

**Git Issue:** 229d7a3
