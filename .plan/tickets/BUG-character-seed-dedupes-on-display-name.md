<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: character seed dedupes on display_name

**Status:** Done
**Priority:** high
**Effort:** Small

**Summary:**

Character template seeding keys idempotency on `actors.display_name` — the one field the character edit route lets the user change freely. Renaming a seeded character makes the next boot consider the record absent.

Reproduced against a fresh `:memory:` DB (`.tmp/seed-rename-repro.ts`, run on this branch):

```
template id: tpl-elara-nightwhisper | name: Elara Nightwhisper
seed#1: {"created":1,"skipped":0,"errors":[]}
seed#2 (id'd template, renamed row): {"created":0,"skipped":0,"errors":["Elara Nightwhisper: UNIQUE constraint failed: actors.id"]}
seed#4 (id-less template, renamed row): {"created":1,"skipped":0,"errors":[]}
actor rows: [{"id":"8636873b-...","display_name":"Yuki Renamed"},{"id":"a5a3fb66-...","display_name":"Elara Nightwhisper"}]
```

Two failure modes:

1. **Template carrying an `id`** (all six built-ins do: `tpl-elara-nightwhisper`, `tpl-aria-7`, `tpl-detective-morgan`, `tpl-dr-thorne`, `tpl-yuki-tanaka`, `tpl-assistant` — `src/config/sections/characters/defaults.ts:13,82,113,175,208,241`): the dedupe query misses, the insert reuses `template.id`, and the PK collides. `src/server/init-background-services.ts:58-60` logs `character template seeding had errors` on **every** boot while that renamed row exists, and the template never re-seeds.
2. **Template without an `id`** (`id?: string` is optional in both template types): `seedTemplate` falls back to `uid()`, so the rename produces a **silent duplicate** — two actor rows from one template (see `seed#4` above).

Sites (same root cause):

- `src/characters/seed/templates.ts:76-90` — boot seeding; dedupes on `owner_id`/`owner_id IS NULL` + `display_name`.
- `src/seeding/characters.ts:44-55` — config `seedCharacters` (`configs/config.example.yaml`); same key, and it assigns `uid()` unconditionally (`:57`), so it is always exposed to mode 2.

Already correct in-repo, to mirror: `src/chat/service/templates.ts:172-181` dedupes on `slug` with a derived stable `id` (`template-${slug}`) and documents the contract — "missing templates are inserted, existing rows are never touched (admin edits and admin-created templates survive)".

**Context:**

Operator-supplied contract: first start allocates templates to DB rows; after that the DB row is the source of truth and a template edit never overwrites an existing record; an existing record is not reloaded, including after an in-app rename; only a deleted DB record gets the template reloaded. Constraint: no new column is needed — the row's own `id` is already the stable identity.

**Acceptance Criteria:**

- [ ] boot seeding keys on the stable template id, never `display_name`
- [ ] regression test: seed → rename row → re-seed → zero errors, zero new rows
- [ ] regression test: seed → delete row → re-seed → row recreated
- [ ] `src/seeding/characters.ts` config path gets the same identity rule
- [ ] no `character template seeding had errors` warning on a boot that follows an in-app rename
