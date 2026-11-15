<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: harness-wizard-landing-tracker-provider-backend-frontend-delete-state-route

**Status:** Done
**Blocker:** HELD — tracks the landing of two unmerged wizard halves (backend `e288f7e9b`/`8bcfe4fa` + frontend `a400e18d9`/`7bc9e9a11`/`bd9d521ac`/`88643611a` per ticket body); both are SHIPPED on branch but NOT on dev. Backend store+routes partially present on dev (`3793bff82`); frontend client absent. Do NOT finalize from this ticket. Next: re-check the four landing boxes against dev after the lanes land, then close in favor of the wizard core ticket.
**Priority:** high
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Landing tracker for the unmerged provider-wizard halves: backend (`provider-wizard-backend`: `setup-providers.ts:80,100,145` GET/POST/DELETE `/admin/setup/providers`, `server-provider-store.ts:150` sealed-key transaction, materialize `:347`, SSRF denylist, audit; commits `e288f7e9b`, `8bcfe4fa`) and frontend (`provider-wizard-frontend`: `admin-provider-wizard/api.ts:98,114` list/save, `presets.ts:43-57`, reactivity, modal; commits `a400e18d9`, `7bc9e9a11`, `bd9d521ac`, `88643611a`) are both SHIPPED on branch but NOT finalized — none of it is on dev. The wizard core ticket (`TASK-provider-connection-wizard-core-first-run-provider-connectio`, in_progress, epic-provider-connection-wizard) owns the feature; this ticket tracks the landing checklist that blocks it.

**Context:**

## Why

Parity matrix gap #1 (PARTIAL, both halves): the biggest shipped-but-unlanded gap in the matrix. Until both lanes finalize, the wizard core ACs stay unticked and the setup-state consumer (`TASK-setup-state-endpoint`, Not Started, epic-first-run-auto-setup) has no wizard to serve.

## Landing checklist

- [x] Backend lane finalized: GET/POST/DELETE `/api/v1/admin/setup/providers` + store + materialize + SSRF denylist + audit on dev.
- [x] Frontend lane finalized: wizard client (list/save/presets/reactivity/modal) on dev.
- [x] DELETE actually wired: frontend calls it (matrix F2 — never called on the branch).
- [x] `GET /api/v1/setup/state` backend route exists OR the tolerated-absent decision is recorded (matrix F3 — no backend route; wizard preview degrades).
- [ ] Wizard core ticket ACs re-checked after both halves land.


## Close-out (2026-11-15, all four landing boxes verified TRUE against dev @ fdc71a1)

- Box 1: `src/routes/admin/setup-providers.ts:80` GET, `:100` POST, `:145` DELETE; store `src/generation/providers/server-provider-store.ts` (`materializeServerProviders` `:347`, audit saved `:217` / deleted `:313`), SSRF allowlist (`server-provider-descriptor.ts:64`, `allowedHosts` at route `:111`), boot materialization `src/server/start.ts:291-292`.
- Box 2: wizard client in tree — `src/frontend/alpine/admin-provider-wizard/` (`index.ts`, `api.ts`, `presets.ts`, `reactivity.test.ts` + tests).
- Box 3 (F2 resolved): `index.ts:231` `await deleteSetupProvider(name)` → `api.ts:161-162` DELETE `/api/v1/admin/setup/providers/:name`.
- Box 4 (F3 resolved): route exists at `src/routes/setup/routes.ts:36` — no tolerated-absent decision needed.
- Box 5 left open: core-ticket AC re-check is the wizard core ticket's own work, not this tracker's.

Closed in favor of the wizard core ticket. Per REVIEW-setup-provision.md §5.

## Do NOT touch

- Do NOT reimplement the wizard here — the code exists on the two branches; this ticket tracks landing, then closes in favor of the wizard core ticket.
- Do NOT finalize the lanes from this ticket (finalize wave owns landing order).

**Acceptance Criteria:**

- [ ] Both lanes on dev; DELETE + setup/state disposition resolved with evidence.
- [ ] Wizard core ticket ACs updated to reflect landed state; this tracker closed.

**Resolved:** 2026-11-15 registry-driven close: git issue e854961 (registry tip: d11a95a10 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-HARNESS-WIZARD-LANDING-TRAC)
