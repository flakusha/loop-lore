<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FE-BE Harmonization — Epic

**Overview:** (see sections below)


**Status:** In Progress
**Priority:** High
**Effort:** Small (one check script + gate)
**Type:** Tooling Epic
**Tags:** frontend, api-contracts, validation, check-gate

## Overview

One automated gate that cross-checks every frontend API call against the backend route + TypeBox schema surface and fails on drift: unknown routes, method mismatches, bad body/query shape, unknown flags, and dead endpoints.

## Motivation

Drift evidence already on file: valid UI input rejected with 422 (`BUG-actortype-persona-422`), audit `selectAll` schema mismatch, asset share/gallery params lacking validation, missing rate-limit headers (`BUG-429`). Each was found by hand after the fact. A static join over `feFetch` calls and Elysia registrations catches the class, not the instance.

## Architecture

Single script, single gate (boring over clever):

```
scripts/check-fe-be-harmonization.ts   # extract FE + index BE + diff, exits nonzero on drift
scripts/check-parallel.mjs            # one gate entry: "fe-be - harmony"
.tmp/fe-be-harmony.json               # machine-readable report (git-ignored scratchpad)
```

- FE source: `feFetch` / `apiFetch` / `safeFetch` / raw `fetch` in `src/frontend/**/*.ts`, plus `hx-get|hx-post|hx-put|hx-patch|hx-delete` in components/views HTML.
- BE source: Elysia `.get|.post|.put|.patch|.delete("<path>"` in `src/routes/**/*.ts` (with same-file `prefix` resolution), schemas `t.Object` in `src/validation/schemas/*.ts`.
- Join key: normalized `METHOD + path` (`/api` stripped, `${...}`/`:id` unified to `:param`).

## Slices (all in this branch)

1. **TOOL-01 FE-call extractor** — regex over call sites; emit method + normalized path + raw ref + file:line.
2. **TOOL-02 BE-contract index** — route literals + `t.Object` key sets split into required vs `t.Optional`.
3. **TOOL-03 diff reporter** — classes: FE-no-BE (missing route), BE-no-FE (dead, advisory only), method mismatch, unknown body/query key, missing required key.
4. **TOOL-04 gate wiring** — blocking entry in `check-parallel.mjs`; report to `.tmp/`.

## Non-goals

No runtime validation, no OpenAPI codegen, no generated FE types. Add when the diff report proves stable.

## Acceptance

- `bun run scripts/check-fe-be-harmonization.ts` exits 0 on clean tree, nonzero with file:line findings on drift.
- Gate is BLOCKING in the runner (`"fe-be - harmony"` in `scripts/check/parallel/gate-table.mjs`). The original "land advisory, promote once triage clears" plan is superseded: the blocking classes report zero findings on dev (reproduce with `bun run scripts/check-fe-be-harmonization.ts`), so factory-built (`createEntityRoutes`) and guarded/group-mounted paths are not producing FE-no-BE noise. BE-no-FE stays advisory — a route may serve the TUI, curl, or a partner. Revisit if a refactor reintroduces that noise.
- Findings name severity (blocking vs advisory) and the concrete fix direction.
- Gate entry runs inside `bun run check` without new dependencies.
- Script stays under the size gate; no `any`; stdout carries findings only (one summary line adjacent to them), and a clean run is silent.

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Frontend ↔ Backend Integration | `feFetch`/`apiFetch`/`hx-*` call sites in `src/frontend/**` | Frontend side of the static join |
| Routing | View-level `hx-*` route targets | Included in the gate's call-site extraction |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Every UI epic adding routes/calls | Drift findings (`.tmp/fe-be-harmony.json`) | Blocks unknown route / method / body-shape drift |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| Normalized `METHOD + path` join key | Frontend ↔ Backend Integration | Match FE calls to Elysia registrations |
| Elysia `t.Object` required/optional key sets (`src/validation/schemas/`) | All route-adding epics | Body/query shape validation |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| Gate report | emits | `.tmp/fe-be-harmony.json` findings consumed by `bun run check` |

**Reconciliation note (verified against dev):** the four analysis slices are implemented as separate modules under `scripts/fe-be-harmonization/` (`be-routes.ts`, `fe-calls.ts`, `schemas.ts`, `shared.ts`) behind `scripts/check-fe-be-harmonization.ts` (commit `6b28e7623`), findings carry severity plus fix direction, and the script runs inside `bun run check`. Both acceptance criteria that the earlier reconciliation flagged as unmet are now reconciled: (1) the gate is registered at `scripts/check/parallel/gate-table.mjs` and the epic says **blocking** — the runner shape was already blocking and the triage evidence (the gate itself reports zero blocking findings on dev) supports it, so the epic text was the stale side; (2) the script's stdout is findings-only — banner, counts, success line and the second truncation label collapsed into one summary line adjacent to the findings, and a clean run prints nothing. See `BUG-fe-be-harmonization-gate-is-blocking-contradicting-its-own-a` and `BUG-fe-be-harmonization-script-violates-its-own-no-console-accep` (both Done). The epic stays open for the external/non-htmx call-site coverage ticket.
