<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Publication Reader Locale Selector

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-publication-i18n
**Related:** `TASK-publication-viewer-read-mode.md`, `TASK-publication-unit-translation-store.md`, `TASK-publication-translation-batch-cron.md`, `epic-i18n.md`

**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The reader half: the publication viewer gains a locale selector, renders each
unit in the selected locale when a translation exists, and falls back — per unit
— to the source body when it does not. The book is never blocked on the
slowest chapter.

## Context

`TASK-publication-viewer-read-mode.md` (Not Started, under
`epic-narrative-publishing-workflows.md`) builds the read-only surface: the shell
`src/views/publication.html` served from `src/routes/views/`, fragments under
`/dynamic/*` via `src/routes/views/plugin-dynamic.ts` with the `HX-Request`
redirect guard, and an Alpine store (`src/frontend/alpine/publication-reader.ts`)
registered in `src/frontend/alpine/index.ts`. That ticket is locale-blind by
design; this ticket adds the locale axis to the exact surface it defines and
changes nothing else about it.

The locale catalog is `LOCALE_REGISTRY` (`src/i18n/locale-registry.ts:12-23`)
— the same ten locales (`en, es, fr, de, ja, ko, zh, pt, ru, ar`, with `ar`
marked `direction: "rtl"`) the shipped UI i18n uses. Reuse it. Do not build a
second list of languages; a locale a publication cannot offer must still render
(see fallback below), so the selector lists what has translations and disables
what does not rather than hiding rows.

Fallback order per unit, resolved at read time from
`TASK-publication-unit-translation-store.md`:

1. `complete` translation for the selected locale — served;
2. `stale` translation for the selected locale — served, ideally with a
   translator-pending marker (`ponytail:` the marker is a one-line badge; skip it
   if it is not free);
3. no row — the source body, rendered as today.

`rejected` rows are never served — they are a debugging artifact for the owner,
not reader content. RTL is where the `direction` field earns its keep: the reader
shell already handles the UI direction switch from `epic-i18n.md`; prose
direction for the selected locale's body follows the same field.

The selector state is reader-local (Alpine store), persisted per reader if the
existing settings surface offers a slot — do not add a new user-preference
table for this. `epic-i18n.md` stays untouched: no UI string keys change; any
new selector label uses a key in the existing catalog if one exists and a new
key otherwise, added in that epic's format.

## Acceptance Criteria

- [ ] The publication viewer renders a locale selector built from
      `LOCALE_REGISTRY`, following the htmx/Alpine contract from
      `TASK-publication-viewer-read-mode.md` (fragments keep the `HX-Request`
      redirect guard)
- [ ] Selecting a locale re-renders every unit whose translation exists in that
      locale, without a full page reload
- [ ] A unit with no translation in the selected locale renders its source body;
      the reader never shows an error or an empty unit for an untranslated
      chapter
- [ ] `rejected` translations are never served to the reader (test asserts the
      source body renders instead)
- [ ] A `stale` translation still renders rather than falling back to source
- [ ] `ar` (rtl, per `LOCALE_REGISTRY`) renders with correct prose direction
- [ ] Only `PublicationStatus.Published` units render, unchanged from
      `TASK-publication-viewer-read-mode.md` — the locale selector must not
      weaken the status filter
- [ ] The viewer still exposes no mutation affordance; the selector is
      read-state only
