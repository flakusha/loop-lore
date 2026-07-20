# TASK: E2E & Unit Test Coverage Improvements

## Status: 🟡 In Progress

## Summary

Analysis and fixes for e2e and unit test failures on `chore/e2e-coverage-improvements` branch.

## Starting Point (before fixes)

| Layer | Pass | Fail | Total | Pass Rate |
|-------|------|------|-------|-----------|
| Unit | 1361 | 13 | 1374 | 99.1% |
| E2E | 9 | 124 | 133 | 6.8% |
| Coverage | — | — | — | 70.65% stmts / 70.96% funcs |

## After Fixes

| Layer | Pass | Fail | Total | Pass Rate |
|-------|------|------|-------|-----------|
| Unit | 1374 | 0 | 1374 | **100%** |
| E2E | 146 | 12 | 158 | **92.4%** |

## Fixes Applied

### 1. E2E: Missing JWT secret in test config
**File**: `tests/e2e/helpers/server.ts`
**Problem**: Commit `19ad88c` (feat(auth): JWT HS256) made all login handlers require `jwtSecret`. Test server never set it → demo-login returns 500 → no cookie → all requests 401.
**Fix**: Added `config.auth.jwtSecret ||= "e2e-test-jwt-secret"` in `loadTestConfig()`.

### 2. E2E: lean-ctx HTTP proxy intercepting localhost
**File**: `tests/e2e/helpers/server.ts`
**Problem**: `HTTP_PROXY=http://localhost:4444` env var causes all fetch calls from bun processes to route through the lean-ctx proxy, which returns 401 "requires lean-ctx Bearer token".
**Fix**: Changed URL from `http://localhost` to `http://127.0.0.1` and set `process.env.NO_PROXY = "127.0.0.1,localhost"`.

### 3. Migration 021: down() column mismatch
**File**: `src/db/migrations/021_schema_constraints.ts`
**Problem**: Migration 024 added `encryption_level` column to chats. Migration 021's `down()` creates `chats_nock` without it → `INSERT INTO chats_nock SELECT * FROM chats` fails with "17 columns but 18 values".
**Fix**: Added `encryption_level` column to `chats_nock` in the `down()` function.

### 4. Schema sync: missing tables/columns in manifest
**Files**: `src/db/schema-manifest.ts`, `src/db/schema-sync.test.ts`
**Problem**: `notifications` table (migration 023) and `encryption_level` column on chats (migration 024) missing from schema manifest.
**Fix**: Added both to `schema-manifest.ts`. Updated table count assertion from 40 → 41.

### 5. Shared-state pollution: added --isolate
**File**: `package.json`
**Problem**: 10 unit tests pass individually but fail in full suite due to shared singleton state (provider registry, stream buffer store, plugin registry).
**Fix**: Changed `"test": "bun test"` to `"test": "bun test --isolate"` — each file runs in its own worker.

### 6. Lint errors
**Files**: `src/memory/budget.ts`, `src/memory/extraction.ts`
**Problem**: Pre-existing lint errors: `Array<T>` instead of `T[]`, `String.match()` instead of `RegExp.exec()`.
**Fix**: Applied fixes. All checks now pass.

## Remaining 12 E2E Failures

Pre-existing issues, not introduced by this work:

| Area | Failures | Likely Root Cause |
|------|----------|-------------------|
| Assets (POST /api/assets) | 4 | Multipart upload endpoint or asset service issue |
| Import (POST /api/actors/import) | 6 | Import succeeds but GET /api/actors/:id returns non-ok |
| Chat Full (asset upload) | 1 | Same root cause as Assets |
| Story (GET /api/worlds/:id/items) | 1 | Items endpoint returns falsy |

## Coverage Gaps (for future work)

### Critical low-coverage routes (<10% stmts)
- `routes/worlds.ts` (4%)
- `routes/story-items.ts` (5.3%)
- `routes/messages.ts` (5.6%)
- `routes/quests.ts` (6.7%)
- `routes/story-states.ts` (8.3%)

### Zero-coverage modules
- `story/events/application.ts`
- `story/events/validation.ts`
- `story/items.ts`
- `story/quest-engine.ts`
- `story/quality/shared.ts`
- `crypto/chat-keys.ts`
- `utils/url-validation.ts`

### Recommended next steps
1. Investigate and fix remaining 12 e2e failures (assets, import, story)
2. Add unit tests for low-coverage routes
3. Add unit tests for zero-coverage modules
4. Target: 80%+ coverage

## Commits

- `fix(test): add jwtSecret + 127.0.0.1 + NO_PROXY to e2e test server`
- `fix(migrations): add encryption_level column to 021 down() chats_nock`
- `fix(schema): add notifications table + encryption_level to schema-manifest`
- `chore(test): add --isolate to bun test to prevent cross-file pollution`
- `fix(lint): Array<T> → T[], match() → exec() in memory modules`
