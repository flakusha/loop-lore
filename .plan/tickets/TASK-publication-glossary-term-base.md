<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Publication Glossary / Term Base

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-publication-i18n
**Related:** `TASK-publication-unit-translation-store.md`, `TASK-unit-translation-service.md`, `TASK-publication-artifact-schema.md`, `epic-narrative-publishing-workflows.md`, `epic-i18n.md`

**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The per-publication term base: the table and CRUD that let a publication owner
pin proper nouns, character names, places, and coined terms — with an optional
approved rendering per locale — so every translated unit of that publication
uses the same words for the same things.

## Context

Nothing in the repo holds a translation vocabulary today. Verified:
`grep -rniE '\b(glossary|term[ ._-]?base|translation memory|tmx)\b' src/` returns zero
matches — the word-boundary anchors matter, a bare `tmx` alternative would match every
`htmx` call site — and so does `grep -rniE 'do[ ._-]?not[ ._-]?translate' src/`. The
closest vocabulary-shaped thing that ships is `message_translations`
(`src/db/schema-core.ts:738`), which stores translated prose and has no concept
of a term at all.

Shape, following the append-only migration policy in
`src/db/migrations/README.md` — one `ADD COLUMN` per `alterTable` (SQLite), no
renames, no renumbering:

```
publication_glossary_terms
  id, publication_id,
  term,                  -- source-language surface form, e.g. "Seraphine Vale"
  kind,                  -- character | place | faction | item | coined | other
  strategy,              -- pin (never translate) | override (use the rendering)
  note?,
  created_at, updated_at

publication_glossary_renderings
  id, term_id, locale, rendering,
  created_at, updated_at
  UNIQUE (term_id, locale)
```

A term with `strategy = pin` has no rendering rows and must never be
transliterated or translated; a term with `strategy = override` contributes its
per-locale `rendering` to the translation prompt and the verification step. The
split mirrors `message_translations`' one-row-per-locale shape
(`src/db/schema-core.ts:738-747`) rather than inventing a JSON blob column.

Scope is the publication, not the instance: a term shared by two publications is
two rows. There is no global glossary in v1 — cross-publication term sharing is
YAGNI until someone asks.

Migration number: this epic claims `059_publication_glossary_terms.ts`.
`TASK-publication-artifact-versioning.md` has already claimed `058` and
`TASK-publication-artifact-schema.md` claims `057` — do not reuse those names.
If another epic's ticket has taken `059` first, take the next free number; the
filename carries the identity stored in `kysely_migration`, so a collision is a
real conflict, not a style nit.

## Acceptance Criteria

- [ ] The migration `src/db/migrations/059_publication_glossary_terms.ts` exists
      with matching `up`/`down`, follows `src/db/migrations/README.md` (one
      `ADD COLUMN` per `alterTable`), and is followed by the regeneration chain
      `bun run db:sync-types && bun run db:sync-manifest` + `bun run schemas:check`
- [ ] A glossary term CRUD surface exists (service + routes) for the publication
      owner; one term per publication, unique on `(publication_id, term)`
- [ ] `strategy = pin` terms expose no rendering rows and cannot be given one —
      the API rejects it with a named reason
- [ ] `strategy = override` terms accept at most one rendering per locale, and a
      second insert for the same `(term_id, locale)` is rejected
- [ ] Only locales present in `LOCALE_REGISTRY` (`src/i18n/locale-registry.ts`)
      are accepted; a rendering for an unknown locale is rejected, not stored
- [ ] Every read and write enforces owner authorization on the publication
      (route test: non-owner gets 404, not an empty list)
- [ ] A unit test covers pin-without-rendering, override-with-rendering, the
      duplicate-rendering rejection, and the unknown-locale rejection
