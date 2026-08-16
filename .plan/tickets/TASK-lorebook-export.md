<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Lorebook Export — Round-Trip Fidelity

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Low
**Epic:** epic-import-export-io

## Summary

Export endpoint (`/api/actors/:id/export`) doesn't include lorebook data. When exporting a character, the `actor_lore_entries` should be fetched and mapped to `LorebookData` so the exported card includes the character_book section.

## Problem

Import now writes lorebook entries to `actor_lore_entries`, but export constructs `CanonicalCharacter` without fetching them. Round-trip (import → export → import) loses lorebook data.

## Acceptance Criteria

- [ ] Export endpoint fetches `actor_lore_entries` for the actor
- [ ] Entries mapped to `LorebookData` format (keys as string[], booleans, position enum)
- [ ] `character_book` included in CCv2/CCv3/PNG/CHARX exports
- [ ] YAML/TOML exports include lorebook if format supports it
- [ ] Round-trip test: import CCv2 with lorebook → export → verify lorebook present

## Implementation

In `src/routes/characters.ts` export endpoint, after fetching actor:

```typescript
// Fetch lore entries
const loreRows = await database
  .selectFrom("actor_lore_entries",)
  .where("actor_id", "=", actorId,)
  .orderBy("insertion_order", "asc",)
  .selectAll()
  .execute();

if (loreRows.length > 0) {
  canonical.lorebook = {
    entries: loreRows.map(e => ({
      keys: JSON.parse(e.keys,),
      content: e.content,
      enabled: e.enabled === "enabled",
      insertion_order: e.insertion_order,
      case_sensitive: e.case_sensitive === 1,
      name: e.name ?? "",
      priority: e.priority,
      id: e.sort_order,
      comment: e.comment ?? undefined,
      selective: e.selective === 1,
      constant: e.constant === 1,
      position: e.position,
    })),
  };
}
```

## Files

- `src/routes/characters.ts` — export endpoint (modify)
- `src/routes/import.test.ts` — add round-trip test

## Linked Epics

- `epic-import-export-io.md`
