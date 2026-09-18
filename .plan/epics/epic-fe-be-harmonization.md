<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
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
- Gate lands advisory (`|| true`, `(advisory)` suffix, following the innerHTML-XSS precedent); promote to blocking once triage clears factory-built (`createEntityRoutes`), guarded/group-mounted, and upload-multipart classes.
- Findings name severity (blocking vs advisory) and the concrete fix direction.
- Gate entry runs inside `bun run check` without new dependencies.
- Script stays under the size gate; no `any`, no `console.*` (logger or stdout report only for findings).
