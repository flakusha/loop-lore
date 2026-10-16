<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Publication Content Translation (Books & Comics)

**Overview:** (see ## Overview below)

**Status:** Not Started
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** i18n, content-translation, publications, glossary, cron, reader, llm

## Summary

Translating a whole publication — one chapter or comic page at a time — with a
glossary that pins proper nouns and character names, a batch pass over units, and
a reader that selects a locale.

## Overview

The repo already has an i18n system, and it is the wrong tool for this job — on
purpose. `epic-i18n.md` is **Status: Done** and deliberately UI-scoped: a
UI-string bundle loader of ~818 string keys across 10 locales
(`src/i18n/translator.ts`, `src/i18n/plurals.ts`, `src/i18n/locale-loader.ts`,
`src/i18n/locale-registry.ts`, `src/routes/i18n.ts`). It loads a static catalog;
it does not translate a word of user content. That is why this is a new epic
rather than a fold-in: nothing in the shipped system can be extended into a
publication translator without rewriting it.

Content translation today exists only at **message granularity**:
`src/assistant/commands/translate.ts` (`runTranslate`, `buildTranslateDeps`,
`shouldSkipTranslation`), `src/chat/auto-translate.ts`, and the
`message_translations` table (`src/db/schema-core.ts:738`). One chat message at a
time, one target language per chat, no cross-unit consistency, no vocabulary
control.

### Verified ground state (2026-10-16)

| Component | Status | Location |
| --------- | ------ | -------- |
| UI string loader / locale catalog | ✅ Shipped, UI-scoped | `src/i18n/`, `src/routes/i18n.ts` — 818 keys × 10 locales; **not** a content translator |
| Message-level translation | ✅ Shipped | `src/assistant/commands/translate.ts`, `src/chat/auto-translate.ts`, `message_translations` (`src/db/schema-core.ts:738`) |
| Glossary / term base | ❌ Absent | `grep -E '(?i)(glossary\|term.?base\|translation memory\|tmx)' src/` → 0 matches |
| Name preservation ("do not translate") | ❌ Absent | `grep -E '(?i)(do.not.translate\|keep.*names\|preserve.*name)' src/` → 0 matches |
| Per-unit translation store | ❌ Absent | No `publication_translations` table; no per-unit `locale` column in `src/db/schema-*.ts` |
| Batch translation pass | ❌ Absent | No job in `src/cron/jobs.ts` translates anything |
| Reader locale selection | ❌ Absent | `TASK-publication-viewer-read-mode.md` is Not Started and locale-blind |

### What this epic adds

| Piece | Reuses | Ticket |
| ----- | ------ | ------ |
| Per-publication glossary table (pinned proper nouns, character names, coined terms) | `PinnedState` (`src/db/enums-core/flags.ts:8`) vocabulary; publication tables from `TASK-publication-artifact-schema.md` | `TASK-publication-glossary-term-base.md` |
| Per-unit, per-locale translation rows | `message_translations` (`src/db/schema-core.ts:738`) as the shape to copy | `TASK-publication-unit-translation-store.md` |
| Translation service with name preservation | `buildTranslateDeps` / `runTranslate` deps pattern (`src/assistant/commands/translate.ts`), `src/generation/providers/registry.ts` | `TASK-unit-translation-service.md` |
| Batch pass over units | `defineJob` + `CronJobDef` (`src/cron/types.ts:18-29`, `src/cron/registry.ts`); catalog in `src/cron/jobs.ts` | `TASK-publication-translation-batch-cron.md` |
| Reader that selects a locale | `LOCALE_REGISTRY` (`src/i18n/locale-registry.ts`); viewer shell from `TASK-publication-viewer-read-mode.md` | `TASK-publication-reader-locale-selector.md` |

### Why name preservation is a real requirement

A translated book where the protagonist's name changes per chapter — or where a
coined term is transliterated differently each time it appears — is not a
translated book, it is noise. The glossary is therefore not a nice-to-have: the
service ticket must **fail a unit**, not warn, when a pinned term is missing
from or altered inside the translated output. A permissive translation that
drifts names is a rejected translation.

## Scope

- **Per unit, not per artifact.** A chapter (book) or page (comic) is the
  translation unit, matching the publication model in
  `epic-narrative-publishing-workflows.md`. Translating a 40-chapter book is 40
  independent rows, independently regenerable, independently publishable.
- **Glossary-scoped vocabulary.** Each publication owns its term base: proper
  nouns, character names, places, coined words, each with an optional approved
  rendering per locale. Terms are pinned by default; an explicit override is
  required to translate one.
- **Batch pass, resumable.** A scheduled job walks units without a translation
  in the requested locale, in `position` order, skipping units already
  translated and units the author pinned out of the sweep.
- **Reader-side selection.** The reader picks a locale from the supported
  catalog; missing units fall back to the source body, never to an error page.

## Non-goals

- **Not UI i18n.** `epic-i18n.md` is Done and untouched by this epic; no new
  string keys are added to the 818-key UI catalogs.
- **Not per-message chat translation.** `src/chat/auto-translate.ts` and the
  `/translate` command already ship that; this epic does not change their
  behavior or their tables.
- **Not a translation-engine project.** No MT provider abstraction, no quality
  scoring model, no translation-memory/TMX interchange format. The LLM call goes
  through the existing `buildTranslateDeps` deps shape.
- **Not export.** Translated markdown deriving to EPUB/PDF is owned by
  `TASK-markdown-derive-other-formats.md` and
  `TASK-publication-export-formats.md`; this epic stores and serves translated
  bodies only.
- **Not a contribution flow.** Community-submitted translations, voting, and
  translator reputation are out of scope; the glossary has exactly one editor —
  the publication owner.
- **No new intent taxonomy.** Triggering translation stays inside the existing
  assistant command surface and the workflow runner; nothing is added to
  `AssistantIntent` (`src/regex/intent.ts`).

## Tasks

- [ ] `TASK-publication-glossary-term-base.md` — glossary table, per-publication pinned terms, per-locale approved renderings
- [ ] `TASK-publication-unit-translation-store.md` — per-unit per-locale translation rows modeled on `message_translations`
- [ ] `TASK-unit-translation-service.md` — translation call + glossary injection + hard name-preservation guard
- [ ] `TASK-publication-translation-batch-cron.md` — scheduled, resumable batch pass over units
- [ ] `TASK-publication-reader-locale-selector.md` — reader locale selection over published units

## Dependencies

- `epic-narrative-publishing-workflows.md` — the `publications` /
  `publication_units` tables and the unit-body markdown contract this epic
  translates. That epic's schema ticket lands `057_publication_artifacts.ts` and
  its versioning ticket owns `058_publication_unit_revisions.ts`; this epic's
  migrations number after those.
- `TASK-publication-viewer-read-mode.md` — the read surface the locale selector
  hangs off. Until it lands, the selector is built against the same htmx
  fragment contract it defines.
- `epic-i18n.md` — Done; supplies `LOCALE_REGISTRY` and nothing else.

## Acceptance Criteria

- [ ] A publication owner can pin a character name and see it survive every
      translation of every unit in the publication, verbatim
- [ ] A unit translated to a locale stores one row per `(unit, locale)` and never
      mutates the source body
- [ ] The batch pass translates only units lacking a translation in the requested
      locale, skips pinned units, and is safe to re-run after an interruption
- [ ] The reader renders a unit in the selected locale when a translation exists
      and falls back to the source body when it does not
- [ ] A translation whose output drops or alters a pinned term is rejected with a
      named reason, not stored
- [ ] No UI string key, table, or route owned by `epic-i18n.md` is modified by
      any ticket in this epic
