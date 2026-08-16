<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# 05 — Testing, E2E & Multiple DB Support

## Current state (good parts)

- **E2E safeguard** (`tests/e2e/helpers/server.ts` `enforceE2eSafeguard`):
  refuses to run unless `db.sqliteFilename === ":memory:"`, upload dir
  under `/tmp/`, and `auth.required === false`. `E2E_SAFEGUARD=0` bypasses.
- **In-memory test DB**: `createTestDb()` builds `bun:sqlite :memory:`,
  runs `migrate`, and calls `setTestDatabase(db)` so all `getDatabase()`
  calls resolve to the test instance.
- **Mock LLM provider** (`src/test-utils/mock-provider.ts`) injected via
  `registerProvider` — generation paths testable without network.
- **`loadTestConfig`** applies safe defaults (port 0, `:memory:`,
  `/tmp/...` uploads, auth off) _before_ the safeguard check.
- **Multi-layer gates in `check`**: `typecheck` + `typecheck:frontend` +
  `typecheck:coverage` (85%) + `lint` + `lint:css` + `lint:html` +
  `format` + `md:lint`.
- **`jscpd`** duplication check in scripts.
- **Playwright browser e2e** (`tests/e2e/flows/browser/*.browser.ts`).

## Gaps

### 1. Only SQLite is ever tested

`createTestDb()` hardcodes `bun:sqlite`. The Kysely dialect-swap design
(`createSqliteDialect` in `src/db/index.ts`, documented "swappable to
Postgres/MySQL") is **never exercised by tests**. A PG-specific migration
quirk or query would ship untested.

### 2. No DB-dialect abstraction for tests

There is no `DialectFactory` registry. To test PG you'd have to fork
`createTestDb`. Extract `createTestDb(dialectFactory?)`.

### 3. No API contract tests

The REST API is the integration boundary (see `06`, `07`) but nothing
asserts response shapes stay stable. No contract suite driven by an OpenAPI
spec (which doesn't exist yet — `06`).

### 4. No runtime coverage threshold

`check` enforces **type** coverage (85%) but not **line/branch** coverage.
`bun test --coverage` exists but isn't gated, so untested branches
accumulate silently.

### 5. No test-data factories

Seeding/setup repeats inline object literals; a `factory` module
(`makeChat()`, `makeMessage()`) would cut e2e boilerplate and drift.

### 6. No performance/load tests

Generation streaming and large-chat pagination have no throughput guard.

## Recommendations

1. **Parameterize the test DB.** Add `DialectFactory = () => Dialect` and
   `createTestDb(factory = sqliteInMemory)`. Register PG/MySQL factories
   behind an env flag (`TEST_DB=postgres`) using a testcontainer or a
   CI-provisioned DB.
2. **CI matrix.** Run unit + e2e against SQLite (default) and Postgres
   (scheduled / PR-label). This finally validates the dialect-swap promise.
3. **Contract tests** once OpenAPI exists (`06`): generate the spec, then a
   small `tests/contract/` suite that hits each route and asserts the response
   validates against the schema. Catches breaking changes at PR time.
4. **Gate runtime coverage.** Add `bun test --coverage` to `check` with a
   floor (start 60%, raise). Pair with the type-coverage gate.
5. **Add `src/test-utils/factories.ts`** with typed builders for the common
   entities; use across e2e + unit.
6. **Optional**: a smoke load test for `/api/messages` streaming on a seeded
   chat.

## Suggested steps

- Edit `tests/e2e/helpers/server.ts`:
  - `export type DialectFactory = () => Dialect;`
  - `export function createTestDb(factory: DialectFactory = sqliteInMemory): Kysely<DB>`
  - keep `setTestDatabase(db)` override.
- Add `tests/e2e/pg/` path gated by `TEST_DB=postgres` (use
  `kysely/experimental` PostgresDialect or `kysely` PostgresDialect + a
  provisioned DB URL).
- Add `package.json` scripts: `test:pg`, and fold `--coverage` into `check`
  with a threshold.
- Create `src/test-utils/factories.ts`; migrate existing e2e setup to use it.
- After `06` lands, add `tests/contract/` driven by `/openapi.json`.
