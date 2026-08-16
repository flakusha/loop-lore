<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Cross-Layer Reconciliation

**Status:** 📝 Draft
**Priority:** High
**Effort:** Large (permanently ongoing)
**Type:** Quality / Chore Epic
**Tags:** reconciliation, cross-check, fe-be-db, docs, specs, drift, warnings

## Summary

Systematic cross-check between all project layers — frontend specs, backend
implementation, database schema, validation schemas, plan documents, and route
definitions — to surface inconsistencies, stale references, and missing wiring.
Produces a living reconciliation report and warning rules that agents can run
on each PR.

## Problem Statement

The project has multiple "source of truth" layers that can drift independently:

| Layer | Source | Can drift from |
|-------|--------|---------------|
| FE specs | `docs/frontend/*.md` | `src/views/`, `src/frontend/`, `src/components/` |
| BE specs | `docs/spec/*.md` | `src/routes/`, `src/services/`, `src/middleware/` |
| DB schema | `src/db/migrations/` | `docs/spec/database*.md`, `src/validation/db-schemas.ts` |
| Validation | `src/validation/schemas.ts` | Route handlers, FE form contracts |
| API routes | `src/routes/` | `docs/reference/api.md`, FE fetch calls |
| Plans | `.plan/epics/`, `.plan/tickets/` | Actual implementation state in `src/` |
| i18n | `src/i18n/`, `public/locales/` | UI strings in `src/views/`, `src/frontend/` |

Known drift examples (verified 2026-08-12):
- Vitepress sidebar had dead links (`/spec/character-setup`, `/spec/tui`)
- `docs/reference/api.md` drifts from `src/routes/`
- Specs reference Zod schemas in `src/schemas/` — does not exist; real stack is Elysia `t` (TypeBox) in `src/validation/schemas.ts`

## Scope

### Phase 1: Inventory & Gap Report (one-time)

Run a comprehensive cross-layer audit and produce a structured report:

1. **FE ↔ BE wiring check**
   - Every `docs/frontend/*.md` spec → does corresponding code exist in `src/views/` or `src/frontend/`?
   - Every `src/views/*.html` partial → is it documented in `docs/frontend/`?
   - Every Alpine.js component / htmx endpoint → does it have a spec?

2. **BE ↔ DB schema check**
   - Every `docs/spec/*.md` that mentions tables → does the table exist in `src/db/migrations/`?
   - Every migration → is it documented in a spec?
   - Every Kysely query in `src/` → does it reference tables/columns that exist?

3. **Validation ↔ Routes ↔ FE contracts**
   - Every route in `src/routes/` → does it use validation from `src/validation/schemas.ts`?
   - Every validation schema → is it referenced by at least one route?
   - Every FE form submission → does it match the route's expected schema?

4. **Plan ↔ Implementation alignment**
   - Every `.plan/epics/` epic marked "In Progress" or "Done" → does corresponding code exist?
   - Every `.plan/tickets/` ticket → is it still relevant or stale?
   - Epics referencing files/features → do those files/features exist?

5. **i18n completeness**
   - Every UI string in `src/views/` → is it in locale files?
   - Every locale key → is it used in templates?

### Phase 2: Automated Warning Rules (ongoing)

Add checks to the `bun run check` gate or a dedicated script:

- [ ] `docs/frontend/` vs `src/views/` file count delta (warn if diverges >20%)
- [ ] `docs/spec/` table references vs actual migration tables
- [ ] `src/validation/schemas.ts` export count vs route import count
- [ ] `.plan/epics/` "In Progress" items → code exists check
- [ ] Dead links in vitepress sidebar
- [ ] Zod/TypeBox trap detection (catch references to `src/schemas/` which doesn't exist)

### Phase 3: Living Reconciliation Report

Maintain `.plan/reconciliation-report.md` (auto-generated, git-tracked):
- Last audit timestamp
- Per-layer drift count
- Top-N warnings by severity
- Trend (improving/regressing vs previous audit)

## Acceptance Criteria

- [ ] Gap report produced covering all 5 cross-check dimensions
- [ ] Every gap classified: stale-doc | missing-code | missing-doc | schema-drift | dead-link
- [ ] At least 3 automated warning rules added to check pipeline
- [ ] Reconciliation report template exists and can be regenerated
- [ ] Top 10 gaps fixed (highest severity first)
- [ ] AGENTS.md updated with "run reconciliation" workflow

## Distinction from Existing Epics

| Epic | Scope | This epic's scope |
|------|-------|-------------------|
| `epic-docs-reconciliation.md` | Docs ↔ code alignment (docs tree cleanup) | All layers × all layers (superset) |
| `epic-logic-reconciliation.md` | Logic drift in runtime behavior | Static cross-reference checks |
| `epic-multi-instance-reconciliation.md` | Multi-instance data sync | Single-instance layer alignment |
| `epic-db-content-versioning.md` | DB schema versioning | DB is one layer of many here |

This epic is the **cross-cutting** reconciliation that checks every layer against
every other layer. Existing reconciliation epics are scoped to specific
pairs; this one is the matrix.

## Dependencies

- `bun run check` pipeline (for adding warning rules)
- Vitepress docs build (`docs/`)
- DB migrations as source of truth (`src/db/migrations/`)

## Related

- `epic-docs-reconciliation.md` — subset (docs ↔ code)
- `epic-logic-reconciliation.md` — subset (runtime logic)
- `epic-db-content-versioning.md` — subset (DB versioning)
- `.agents/references/banned-patterns.md` — patterns to catch during audit
- `.agents/references/recommendations.md` — patterns to enforce
