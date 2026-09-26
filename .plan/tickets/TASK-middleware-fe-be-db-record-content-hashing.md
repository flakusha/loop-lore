<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend / Backend / DB record content hashing

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** 🟡 Partial (commit 2053bfe3 — helper + schema migration; service-layer hook + X-Record-Hash emission deferred to follow-up)
**Priority:** high
**Effort:** medium
**Epic:** epic-content-hashing-distributed-integrity
**Issue:** TBD (assign on creation)
**Related:**
- `src/middleware/request-id.ts` (worktree: `feat-middleware-request-lifecycle`)
- `src/middleware/idempotency.ts` (worktree)
- `src/db/migrations/016_asset_encryption.ts` (`assets.content_hash` added in `up()` but dropped in `down()` — broken half-implementation)
- `src/db/migrations/026_rpg_mechanics.ts` (`character_stats.data_version` — working precedent)
- `src/assets/service/create.ts:21-60` (TOCTOU dedup bug — see `TASK-asset-dedup-toctou-creates-duplicate-rows-and-orphan-files`)
- `src/routes/messages/create.ts:91-109` (`idempotencyKey` advisory only — see `BUG-chat-idempotency-not-enforced`)
- `epic-db-content-versioning.md` (registry + batch runner for `data_version` columns)
- `epic-cross-layer-reconciliation.md` (FE ↔ BE ↔ DB ↔ plan ↔ validation)

## Summary

Introduce a single canonical **record hash** that ties frontend-issued request
ids, backend-captured responses, and DB-stored rows together. Today three
identifiers exist in three layers and do not reconcile: `X-Request-Id`,
`request_results.id`, and the per-row keys (`messages.idempotency_key` is
advisory; `assets.content_hash` is partially defined but unenforced). The
worktree already exposes `src/middleware/request-id.ts` + `idempotency.ts` +
`src/async/store.ts` (queue + drain) — the record hash must compose on top of
them, not replace them.

The canonical hash is a **SHA-256 hex digest** of a deterministic record
envelope (see Schema below). It is computed once, on the server, at write
time, and stored as a `TEXT` column on every table that participates in the
lifecycle. The frontend does not compute it; the frontend only supplies the
opaque request id (already supported by `isValidRequestId` +
`resolveRequestId`).

## Schema

```
record_hash = SHA-256(
  table_name              // canonical Kysely table name, lowercase
  + "|" + pk_value        // primary key (UUID/text)
  + "|" + hash_inputs     // JSON canonical (sorted keys, no whitespace)
)
```

`hash_inputs` is the **minimal, versioned** projection of the row's
content-defining columns. For `messages`:

```
{ "v": 1, "chat_id": "...", "author_id": "...", "body": "...",
  "idempotency_key": "...", "created_at": "..." }
```

For `assets`:

```
{ "v": 1, "owner_id": "...", "filename": "...", "mime": "...",
  "content_hash": "..." }
```

`v` is bumped whenever the envelope shape changes. `record_hash` is
re-computed when any tracked column mutates (a service-layer hook — NOT a
DB-side trigger, to keep migrations portable to Postgres).

## Acceptance Criteria

### Backend

- [ ] New `src/hash/record-hash.ts` exports `computeRecordHash(table, pk, inputs)`
  and a `RECORD_HASH_VERSION = 1` constant. The function is pure, takes a
  `table: TableName` branded type, returns a 64-char lowercase hex string.
- [ ] Service-layer integration:
  - `src/assets/service/create.ts` computes `record_hash` BEFORE the
    INSERT; the INSERT includes `record_hash` as a column. The existing
    `content_hash` column stays (raw SHA-256 of the bytes — different
    concern, dedup); `record_hash` is a row-integrity hash.
  - `src/routes/messages/create.ts` computes `record_hash` on the new
    message row and stores it.
- [ ] `src/middleware/idempotency.ts` extends the `(method, route, id)`
  key with `record_hash` so two retries with the same payload produce the
  same replay and two retries with different payloads are treated as
  separate keys (not collapsed by accident).
- [ ] **Server emits `X-Record-Hash` on every response from a tracked
  route** (the row's `record_hash` value). On idempotency replay, the
  original row's hash is echoed. Ticket 2 depends on this contract
  (see **Decisions log → Q1**).
- [ ] Unit tests in `src/hash/record-hash.test.ts`:
  - deterministic for the same input (two calls, identical output),
  - `v` bump changes the output,
  - column ordering inside `hash_inputs` does not matter,
  - whitespace inside `hash_inputs` does not matter,
  - 64-char hex, lowercase only.

### DB

> **Schema ownership is consolidated in `TASK-middleware-migration-compaction-data-version-hash.md`**
> to avoid two migrations racing on the same column. This ticket owns the
> `computeRecordHash` helper and the service-layer hook; ticket 3 owns the
> `0xx_data_version_record_hash.ts` migration that adds `data_version` +
> `record_hash` to `assets`, `messages`, `characters`, `request_results`,
> `chats`, `worlds`, plus the per-table index.

- [ ] Confirm `TASK-middleware-migration-compaction-data-version-hash.md`
  adds `record_hash TEXT NOT NULL DEFAULT ''` to the 6 tables listed
  above (ticket 3 owns the schema; ticket 1 consumes it).
- [ ] Regenerated artifacts (`src/db/schema-*.ts`, `schema-manifest.ts`,
  `insert-helpers.ts`, `validation/db-schemas.ts`) compile and
  `bun run schemas:check` is green.
- [ ] Fix the half-broken `content_hash` migration 016: the `down()`
  must NOT drop `content_hash` if a subsequent migration relies on it.
  Add a forward-only fix-up migration if the current `down()` would
  corrupt a down→up cycle.

### Frontend

- [ ] `src/frontend/fe-fetch.ts` may send `X-Record-Hash` when the
  caller passes an explicit body hash (opt-in, non-mandatory). Default
  callers do nothing.
- [ ] Browser does NOT compute SHA-256 itself — `SubtleCrypto` is
  async-only and the request hot path is sync; backend is authoritative.

## Tests

- `bun test src/hash/record-hash.test.ts` — 5 unit cases above.
- `bun test src/assets/` — concurrent uploads now collapse on `record_hash`
  (closes the TOCTOU window because the hash is computed before the row
  exists and the row insert carries it; the unique-by-hash lookup can be
  added in a follow-up once backfill lands).
- `bun test src/routes/messages/` — idempotent retry returns the same
  `record_hash` and the same response.
- `bun run schemas:check` green.

## Out of Scope

- Backfill of `record_hash` for existing rows (separate ticket).
- Encryption of `record_hash` columns (hash is non-secret by construction).
- Browser-side storage of the hash (separate ticket).
- Postgres-side checksum triggers (covered by a follow-up; SQLite
  portable code is the priority).

## Notes

- SHA-256 over a canonical JSON envelope: deterministic, fast, portable,
  no platform-specific deps. Web Crypto's `subtle.digest` is intentionally
  NOT used on the hot path.
- `record_hash` is a row-integrity hash, NOT a duplicate-detection hash.
  `assets.content_hash` (SHA-256 of bytes) keeps its dedicated job.
- The `|v|` prefix in the envelope is the migration escape hatch: when
  the envelope shape changes (e.g. new tracked column), bump `v`, the
  hash recomputes, and the backfill ticket can run safely in waves.

## Decisions log

**Q1 — `X-Record-Hash` emission scope: option 0 (always on tracked routes).**
The current AC ("server emits `X-Record-Hash` on every response from a
tracked route") is the resolved decision. No further change needed;
the option list under "Architectural questions" is removed.


## Verification 2026-09-26

Verdict: **still-open-expanded** (pure helper + schema + registry landed; service hooks + header emission missing).

Src checked:
- `src/hash/record-hash.ts` — `computeRecordHash(table, pk, inputs)` pure SHA-256 hex, `RECORD_HASH_VERSION = 1`, `asTableName` branding, `canonicalJSON` sorted-keys; tested in `record-hash.test.ts` (determinism, version bump, key-order/whitespace invariance, 64-char hex, known-vector vs `Bun.CryptoHasher`).
- `src/db/content-version.ts` — `(table, data_version)` → projection registry + batch `refreshRecordHashes` runner (with the `record_hash` select fix); `data_version` + `record_hash` columns + `idx_*_record_hash` indexes across `request_results/assets/worlds/characters/chats/messages/chat_sections` and more (`schema-core.ts`, `schema-manifest.ts`, `001_init.ts`); `insert-helpers.ts` + `validation/db-schemas.ts` carry the columns.
- MISSING: no `record_hash`/`computeRecordHash` reference in `src/assets/service/create.ts` or `src/routes/messages/create.ts` (grep: zero hits); no `X-Record-Hash` emission anywhere in `src/` (grep: zero hits); `src/middleware/idempotency-utils.ts` `makeKey` still `(method, route, requestId)` without `record_hash`.

Refreshed deltas:
- The "commit 2053bfe3 helper + schema migration" half is confirmed shipped and extended (registry + runner + wide column rollout). Schema ownership by the compaction ticket held — no migration race observed.
- Concrete acceptance delta remaining: (a) compute-before-INSERT hooks in asset create + message create; (b) `X-Record-Hash` echo on tracked-route responses + replay path; (c) extend idempotency `makeKey` with `record_hash` so same-id/different-payload retries key separately; (d) 016 `down()` fix-up verification. Recommend needs-split if (d) is independently shippable: hash-hooks vs header-propagation.
