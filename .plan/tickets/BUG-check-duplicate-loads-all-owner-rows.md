<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: `/create` duplicate check loads every owner-scoped entity row and filters in JS — O(N) on /create per chat

**Status:** Not Started
**Severity:** medium
**Priority:** medium
**Effort:** small
**Type:** BUG
**Epic:** epic-assistant-gm-flows, epic-creative-studio
**Files:** src/assistant/quality/entity-creation.ts:96-150

## Issue

`checkDuplicate` (entity-creation.ts:96-150) does a SELECT for **every owner-scoped row** of the entity kind, then runs `.find(r => r.name.toLowerCase() === needle)` in JavaScript:

```typescript
case "character": {
  rows = await db
    .selectFrom("actors",)
    .select(["id", "display_name as name",],)
    .where("owner_id", "=", scope.ownerId,)
    .execute();  // <- no name filter; returns every character
  break;
}
// ... same shape for world / location / item
```

For a user with 10k characters, every `/create char` call loads 10k rows into Node and walks them in JS. With 100 users each creating 5 entities per minute, this is hundreds of MB of unnecessary DB round-trips.

The duplicate check is intended to flag an existing **same-name** entity; it should be a single SQL `WHERE name ILIKE ?` lookup.

## Why it matters

Performance. /create is a primary UX path; users generating characters/locations/items in bulk hit this N+1 every time. SQLite holds the entire DB in-memory anyway, but the JS row-mapping and serialization is wasted CPU and DB-to-Node transfer.

## Evidence

- `src/assistant/quality/entity-creation.ts:107-138` — all four cases lack the `name` filter in SQL.
- `src/assistant/quality/entity-creation.ts:141` — `rows.find((r,) => r.name.toLowerCase() === needle)` does the actual matching in JS.

## Concrete fix

Push the name filter into SQL:

```typescript
case "character": {
  return await db
    .selectFrom("actors",)
    .select(["id",],)
    .where("owner_id", "=", scope.ownerId,)
    .where("display_name", "=", entity.name,)
    .executeTakeFirst();
}
case "world": {
  return await db
    .selectFrom("worlds",)
    .select(["id",],)
    .where("owner_id", "=", scope.ownerId,)
    .where("name", "=", entity.name,)
    .executeTakeFirst();
}
// ... same for location / item, scoped by world_id AND name
```

Return `executeTakeFirst()` — `null` means no duplicate. Use case-insensitive collation if SQLite's default binary compare is too strict (consider `COLLATE NOCASE`).

Add an index: `CREATE INDEX idx_actors_display_name ON actors(owner_id, display_name)` (and equivalent for worlds/locations/items).

## Tests

- `bun test src/assistant/quality/entity-creation.test.ts` — add a case with 1000 owner-scoped characters, one matching the new entity name; verify `checkDuplicate` returns 1 row (not 1000) and reports `found: true`.
- Add a case where no match exists and verify exactly 0 rows are returned (not N owner-scoped rows).

## Related

- `epic-assistant-gm-flows.md`, `epic-creative-studio.md`.
- `PERF-chat-dispatch-command-three-sequential-queries.md` (similar pattern elsewhere).
