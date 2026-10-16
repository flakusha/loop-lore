<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Per-Unit Publication Translation Store

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-publication-i18n
**Related:** `TASK-publication-glossary-term-base.md`, `TASK-unit-translation-service.md`, `TASK-publication-artifact-schema.md`, `TASK-publication-artifact-versioning.md`

**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The store: one row per `(unit, locale)` holding the translated body of a
publication unit, modeled directly on `message_translations`, so a translated
chapter is a first-class row rather than an overwrite of the source text.

## Context

`message_translations` (`src/db/schema-core.ts:738-747`) is the in-repo template
for "one entity, many locales, one body each":

```
id, message_id, locale, content, provider, created_at, updated_at
```

Copy that shape rather than designing a new one. The publication analogue keys
on the unit instead of the message:

```
publication_translations
  id, unit_id, locale, body,
  source_body_hash,     -- the source body this translation was made from
  provider, status,     -- status: complete | stale | rejected
  created_at, updated_at
  UNIQUE (unit_id, locale)
```

Four decisions carried by those columns:

- **The source body is never mutated.** `publication_units.body` stays the
  authored text; a translation is a separate row. A unit with no row for a
  locale renders the source body, so the reader never 404s on an untranslated
  chapter.
- **`status = stale`** is how a regenerated or hand-edited unit invalidates a
  translation without deleting it: compare `source_body_hash` against the
  current unit body at read time. A stale row keeps the last good translation
  visible (the reader fallback order is fresh → stale → source) while the batch
  pass refreshes it. Cheaper and more honest than a fan-out of "translation
  outdated" flags.
- **`status = rejected`** is the storage-side record of a failed
  name-preservation check (`TASK-unit-translation-service.md`): the row exists
  so a human can see what the model produced and why it was refused, and it is
  never served to a reader.
- **`provider`**, copied from `message_translations`, records which backend
  produced the row — there is no provider abstraction in this epic, the string
  is a label only.

Regeneration discipline is the versioning ticket's, not this one's:
`TASK-publication-artifact-versioning.md` owns keep-or-discard of unit bodies.
This ticket never deletes a unit body; the worst it does to a translation row is
overwrite it with a fresh `(unit, locale)` row when the source hash moved and the
new translation passed verification.

Migration number: this epic claims `060_publication_translations.ts`, directly
after the glossary table's `059` from `TASK-publication-glossary-term-base.md`
and after the publishing epic's `057`/`058` claims. Follow the same
first-come-first-served numbering rule stated there; `src/db/migrations/README.md`
is the policy of record (append-only, one `ADD COLUMN` per `alterTable`).

## Acceptance Criteria

- [ ] The migration `src/db/migrations/060_publication_translations.ts` exists
      with `up`/`down`, unique on `(unit_id, locale)`, following
      `src/db/migrations/README.md`; regeneration chain (`db:sync-types`,
      `db:sync-manifest`, `schemas:check`) run
- [ ] Writing a translation never touches `publication_units.body` (route test
      asserts the source body is byte-identical before and after)
- [ ] A second write for the same `(unit_id, locale)` replaces the row rather
      than creating a sibling; a unique-constraint violation is impossible from
      the API surface
- [ ] Editing a unit's body marks its existing translations `stale` — the unit
      body is the trigger, no separate invalidation endpoint
- [ ] `rejected` rows are stored but never returned by any read path
- [ ] Reads return only translations belonging to the caller's own publication
      (non-owner gets 404)
- [ ] A unit test covers: write, overwrite, stale-on-edit, and
      rejected-never-served
