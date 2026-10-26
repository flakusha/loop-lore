<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Community lorebook share has no export epilogue

**Status:** In Progress
**Status Note:** [2026-10-26 final pass] FIXED. New export epilogue `exportActorLorebook` / `exportActorLorebooks` rebuilds `LorebookData` from `actor_lore_entries` (keys/`secondary_keys` → `key_groups`, enabled/selective/constant as booleans, position enum, `id: sort_order`, `key_type`→`use_regex`): src/characters/exporters/lorebook.ts:60-119. Wired into both export paths — single-actor route attaches the lorebook to the canonical card before the format switch (src/routes/characters/export.ts:63-92), and the bulk ZIP loop batch-fetches every character's entries in one query and attaches per card (src/routes/export-shared/characters.ts:56-82). Format coverage, each verified rather than assumed: CCv2/CCv3 emit `character_book` from `canonical.lorebook` (src/characters/exporters/ccv2.ts:21-24, ccv3.ts:32-34). The **charx branch was still lossy after the first wiring** — it hand-copied the card `data` object and never included `character_book`; it now derives its payload from `exportToCcV3(canonical)` and merges the license extension into `data.extensions` (src/routes/characters/export.ts:171-189), so it inherits the lorebook and the card timestamps instead of drifting. The embedded-PNG branch had the same gap and now carries `character_book` when a lorebook exists (src/routes/characters/export.ts:155-162). Evidence: src/characters/exporters/lorebook.test.ts round-trips a 2-entry `character_book` through the real `importLorebook` epilogue into `exportToCcV3Json` (entries, flags, position, comment) plus the bulk-map path, and src/routes/characters/export.coverage.test.ts:248-278 unzips a live `?format=charx` response and asserts `card.json` carries the seeded lore entry. `bun test src/routes/characters/export.coverage.test.ts src/characters/importers src/characters/exporters` green; `bunx tsc --noEmit` clean. Standing alone `/lorebooks/export` route remains out of scope (the ticket's acceptance is card/bulk fidelity). `tsc --noEmit` clean.

**Status Note:** [2026-10-26 sweep-A verify] NOT-FIXED (issue 1485a72): Verified: both export paths build CanonicalCharacter with no lorebook (src/routes/characters/export.ts:63-81; src/routes/export-shared/characters.ts:20-72, no lore join), so exporters/ccv3.ts:29-30 never emits character_book; import side exists (src/routes/import/actor.ts:93-95). Round-trip still loses all lorebook data.
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-import-export-io

**Summary:**

Verified 2026-10-08 against worktree `tree/authoring-creation`. Lorebook import onto
`actor_lore_entries` works via the character card import epilogue
(`src/routes/import/lorebook.ts:19-62`), but nothing reconstructs the LorebookData
from `actor_lore_entries` on export, so a community character share round-trip
(import → export → import) loses all lorebook data.

Evidence (paths under worktree `src/`):

- Import side: `src/routes/import/actor.ts:93-95` imports lore entries when the
  parsed card carries a lorebook.
- Card exporters ccv2/ccv3 only map a lorebook if the canonical object already
  has one (`src/characters/exporters/ccv2.ts:22-23`,
  `src/characters/exporters/ccv3.ts:29-30`) — but no export path ever reads lore
  entries back from the DB:
  - `src/routes/characters/export.ts:63-81` — CanonicalCharacter built purely
    from the `actors` row; no fetch of `actor_lore_entries`.
  - `src/routes/export-shared/characters.ts:56-72` — bulk ZIP character loop,
    same shape, no lore fetch.
  - `rg 'selectFrom("actor_lore_entries"' src/characters src/routes/characters
    src/routes/export-shared` → no matches; the only queries live in the CRUD
    route `src/routes/actor-lore-entries.ts`, not in any export path.
- Standalone lorebook share surface: none. `src/routes/export.ts:58` and
  `src/routes/export-sse/jobs.ts:55-56` enumerate include values
  `characters|chats|worlds|locations|story|assets` — a standalone lorebook
  export is not among them, and there is no `/lorebooks/export` route anywhere.
- For contrast, WORLD lore entries ARE covered:
  `src/routes/export-shared/story.ts:29,39` collects `world_lore_entries` into
  the WorldBundle and `src/routes/world-import/bundle.ts:167-193` inserts them.

Fix (content matches the still-open `TASK-lorebook-export.md`, which lives in
BOTH dev root and this worktree with identical content, Status "Not Started"):
in both the per-actor export route and `exportCharactersToZip`, fetch
`actor_lore_entries` for the actor and map rows to `LorebookData` on
`canonical.lorebook` before calling the exporters (keys JSON.parse,
enabled/selective/constant as booleans, position enum, `id: sort_order`).
Runtime evidence: repro via real `createTestDb` + `001_init` migrations +
`importLorebook` + `exportToCcV3Json` — imported=1, rows in
actor_lore_entries=1, but `character_book=false` in emitted ccv3.

Acceptance: a character imported with 3 lore entries exports back carrying
those 3 entries in `character_book.entries` (ccv2/ccv3/charx), and the bulk ZIP
character export includes them.

**Context:**

The FEAT-community-template-world-share-export-import ticket (Status: Done)
was reconciled by reference to epic-import-export-io, which itself marked
"Lorebook export round-trip fidelity" Done (epic-import-export-io.md:95) while
pointing at a ticket whose Status is "Not Started" (TASK-lorebook-export.md:11,
open in the dev index at index.json:35394-35406). The epic-level Done claim is
stale; the gap is real.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Round-trip test: import CCv2 with lorebook → export → verify lorebook present
- [ ] Bulk ZIP export includes the character's lorebook entries

## Resolution

(Fill in when the epilogue lands.)


git issue: 1485a72

**Resolved:** 2026-10-26 registry-driven close: git issue 1485a72 (registry tip: 7d68bcd87 Konstantin Fedotov Close issue)
