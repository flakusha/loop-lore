<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# OpenAPI-Driven API Reference Specification

> Promoted 2026-09-18 from STUB. Authoritative source is `src/` and AGENTS.md.

## Overview

OpenAPI reference is generated from the live Elysia app at `src/elysia-app.ts` via `@elysia/openapi` plugin. The generated spec lives at `docs/reference/openapi.json` (gitignored) and drives the rendered `docs/reference/api.md` plus any external OpenAPI tooling. `api.md` carries a DO-NOT-EDIT banner and a delimited `api-reference:handwritten` region for maintainer prose; everything else is regenerated.

## Scope

- Routes from `src/routes/` are auto-discovered.
- Schemas from `src/validation/schemas/` are emitted as TypeBox JSON Schema.
- Regeneration: `bun run openapi && bun run openapi:md` (the latter runs `scripts/generate-api-md.ts`). `docs:build` runs both so a fresh clone has a current spec on disk for the generated page and for tooling.
- Validation: the `api - doc drift` gate regenerates both artifacts and fails on a stale `api.md`, an invalid spec, or a phantom operation. `bun run schemas:check` validates the other generated schema artifacts.

## Technical Design

- **Plugin:** `@elysia/openapi` mounted on the root Elysia app with `documentation: { ... }` config.
- **Generation:** dev-only script dumps the live schema to `docs/reference/openapi.json`.
- **CI gate:** `schemas:check` fails when generated artifacts drift from src/.
- **Public exposure:** the `/openapi` endpoint at runtime serves the schema.

## Integration Points

- `src/elysia-app.ts` — OpenAPI plugin mount
- `src/validation/schemas/` — TypeBox schema sources
- `scripts/generate-openapi.ts` — spec regeneration script
- `scripts/generate-api-md.ts` — markdown renderer (preserves the handwritten region)
- `docs/reference/openapi.json` — generated artifact (gitignored)
- `docs/reference/api.md` — generated reference page

## Related Epics

- `.plan/epics/epic-openapi-reference.md` — ✅ Complete; owns the implemented generation
  pipeline described above.
- `.plan/epics/epic-api-openapi.md` — ⬜ Not Started API-governance slice (spec linting,
  breaking-change diff, versioning, changelog); broader than this spec, not its home.
