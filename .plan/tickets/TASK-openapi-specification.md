<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: OpenAPI Specification

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-api-governance.md

## Summary

Implement OpenAPI generator from Elysia routes, spec validation, and documentation UI.

## Tasks

### OpenAPI Generator

- [ ] Implement OpenAPI generator (`src/api-governance/openapi/generator.ts`)
- [ ] Extract routes from Elysia app
- [ ] Generate schemas from TypeBox
- [ ] Add operation descriptions
- [ ] Implement spec versioning

### Spec Validation

- [ ] Implement spec validator (`src/api-governance/openapi/validator.ts`)
- [ ] Add OpenAPI linting
- [ ] Implement breaking change detection
- [ ] Add spec diff tool
- [ ] Create spec changelog

### Documentation UI

- [ ] Implement Swagger UI integration
- [ ] Add Redoc integration
- [ ] Create API explorer
- [ ] Add API playground
- [ ] Implement API changelog UI

### Spec Management

- [ ] Add spec versioning
- [ ] Implement spec publishing
- [ ] Add spec caching
- [ ] Create spec backup

## Files

- `src/api-governance/openapi/generator.ts`
- `src/api-governance/openapi/validator.ts`
- `src/api-governance/openapi/diff.ts`
- `src/api-governance/openapi/docs.ts`

## Verification

```bash
# Generate OpenAPI spec
curl http://localhost:3000/api/openapi.json

# Validate spec
curl -X POST http://localhost:3000/api/openapi/validate \
  -H "Content-Type: application/json" \
  -d @openapi.json

# Get spec diff
curl -X POST http://localhost:3000/api/openapi/diff \
  -H "Content-Type: application/json" \
  -d '{"oldSpec": "...", "newSpec": "..."}'

# View documentation
open http://localhost:3000/api/docs
```
