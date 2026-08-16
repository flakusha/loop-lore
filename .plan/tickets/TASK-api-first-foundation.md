<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: API-First Foundation

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-api-library-distribution.md

## Summary

Add OpenAPI spec generation, headless mode, and API versioning to enable external consumption.

## Tasks

- [ ] Generate OpenAPI spec from Elysia routes
  - File: `src/routes/openapi.ts`
  - Endpoint: `GET /api/openapi.json`
  - Use `@elysiajs/swagger` or custom spec builder

- [ ] Add headless mode configuration
  - File: `src/config/schema.ts`
  - Add `headless: boolean` to config
  - Skip frontend middleware when `headless: true`

- [ ] Implement API versioning
  - File: `src/elysia-app.ts`
  - Mount routes under `/api/v1/`
  - Add version header middleware

- [ ] Add CORS middleware
  - File: `src/middleware/cors.ts`
  - Configure allowed origins via config
  - Support preflight requests

- [ ] Add API key authentication
  - File: `src/middleware/api-key.ts`
  - Validate `X-API-Key` header
  - Optional auth for public endpoints

## Verification

```bash
# OpenAPI spec available
curl http://localhost:3000/api/openapi.json

# Headless mode (no frontend)
HEADLESS=true bun run src/server.ts

# API versioning
curl http://localhost:3000/api/v1/chats

# CORS
curl -H "Origin: https://example.com" http://localhost:3000/api/v1/chats
```

## Files

- `src/routes/openapi.ts` — OpenAPI spec generation
- `src/config/schema.ts` — Config schema update
- `src/elysia-app.ts` — Route mounting
- `src/middleware/cors.ts` — CORS middleware
- `src/middleware/api-key.ts` — API key auth
