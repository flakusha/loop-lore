<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# OpenAPI-Driven API Reference Specification

> Promoted 2026-09-18 from STUB. Authoritative source is `src/` and AGENTS.md.

## Overview

OpenAPI reference is generated from the live Elysia app at `src/elysia-app.ts` via `@elysia/openapi` plugin. The generated artifact lives at `docs/reference/openapi.json` (76KB) and powers both the static `docs/reference/api.md` and any external OpenAPI tooling.

## Scope

- Routes from `src/routes/` are auto-discovered.
- Schemas from `src/validation/schemas/` are emitted as TypeBox JSON Schema.
- Regeneration: `bun run openapi` (NODE_ENV=development bun run scripts/generate-openapi.ts).
- Validation: `bun run schemas:check` validates generated artifacts are current.

## Technical Design

- **Plugin:** `@elysia/openapi` mounted on the root Elysia app with `documentation: { ... }` config.
- **Generation:** dev-only script dumps the live schema to `docs/reference/openapi.json`.
- **CI gate:** `schemas:check` fails when generated artifacts drift from src/.
- **Public exposure:** the `/openapi` endpoint at runtime serves the schema.

## Integration Points

- `src/elysia-app.ts` — OpenAPI plugin mount
- `src/validation/schemas/` — TypeBox schema sources
- `scripts/generate-openapi.ts` — regeneration script
- `docs/reference/openapi.json` — generated artifact

## Related Epics

- `.plan/epics/epic-openapi-reference.md`
- `.plan/epics/epic-api-openapi.md`
