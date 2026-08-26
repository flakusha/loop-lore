<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: API OpenAPI Specification

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Infrastructure Epic
**Tags:** openapi, specification, swagger, versioning, changelog
**Parent Epic:** API Governance (epic-api-governance.md)

## Summary

Auto-generate the OpenAPI specification from Elysia routes, validate/lint it,
detect breaking changes across revisions, serve interactive documentation, and
manage spec versioning plus an API changelog. This slice feeds every other
API-governance sub-epic: generated specs drive validation schemas, and the
documented surface is what rate limiting, telemetry, and offloading expose.

## Sub-Epic of

Part of the **API Governance** mega-epic. See parent epic for full scope and slicing rationale.

## Scope

- OpenAPI generator driven by Elysia route definitions
- Spec linting / validation
- Spec diff with breaking-change detection
- Swagger UI documentation endpoint
- Spec versioning and API changelog

## Design

### Auto-Generation

```typescript
import { app, } from "./elysia-app";
import { generateOpenAPI, } from "./openapi/generator";

// Generate OpenAPI spec from Elysia routes
const spec = generateOpenAPI(app, {
  title: "Loop-Lore API",
  version: "1.0.0",
  description: "SillyTavern-like AI assistant API",
  servers: [
    { url: "http://localhost:3000", description: "Development", },
    { url: "https://api.loop-lore.com", description: "Production", },
  ],
},);

// Serve spec
app.get("/api/openapi.json", () => spec,);
app.get("/api/docs", () => swaggerUI(spec,),);
```

### Spec Diff

```typescript
import { diffSpec, } from "./openapi/diff";

const changes = diffSpec(oldSpec, newSpec,);
// { breaking: [...], added: [...], removed: [...] }

if (changes.breaking.length > 0) {
  console.error("Breaking changes detected:", changes.breaking,);
}
```

## Tasks

- [ ] Implement OpenAPI generator from Elysia routes
- [ ] Add spec validation (lint)
- [ ] Create spec diff (breaking changes detection)
- [ ] Build documentation UI (Swagger UI)
- [ ] Add spec versioning
- [ ] Create API changelog

## Dependencies

- Parent hub: **API Governance** (`epic-api-governance.md`) — owns the shared `src/api-governance/` layout and governance REST endpoints.
- Siblings: this is the first slice — its generated spec is consumed by `epic-api-validation-guardrails.md` (schema/source-of-truth alignment) and referenced by rate-limiting, telemetry, and task-offloading documentation.

## Files

- `src/api-governance/openapi/generator.ts` — OpenAPI generator
- `src/api-governance/openapi/validator.ts` — Spec validator
- `src/api-governance/openapi/diff.ts` — Spec diff
- `src/api-governance/openapi/docs.ts` — Documentation UI

## Notes

- OpenAPI spec auto-generated from Elysia routes — single source of truth, never hand-maintained
- Breaking-change detection gates releases; changelog generated alongside spec versions
