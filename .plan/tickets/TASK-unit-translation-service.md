<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Unit Translation Service + Name-Preservation Guard

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-publication-i18n
**Related:** `TASK-publication-glossary-term-base.md`, `TASK-publication-unit-translation-store.md`, `TASK-publication-translation-batch-cron.md`

**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The translation call itself: a service that takes one unit plus a target locale,
builds the prompt with the publication's glossary injected, calls the LLM
through the existing `/translate` deps shape, and **fails the unit** — not warns —
when a pinned term was dropped or altered in the output.

## Context

The repo has exactly one translation call path and this ticket reuses it rather
than inventing a second: `runTranslate` / `TranslateDeps` /
`buildTranslateDeps` in `src/assistant/commands/translate.ts`, with the provider
resolved through `src/generation/providers/registry.ts`. `buildTranslateDeps`
(`src/chat/auto-translate.ts:150-164`) is the pattern for building those deps
from `(database, config, userId)` at a route or job boundary — copy that
signature, do not write a new one. `shouldSkipTranslation`
(`src/chat/auto-translate.ts:109-115`) is the existing "would this be a no-op"
guard; consult it, and extend it only if unit-shaped prose genuinely needs it.

The repo's LANGUAGES catalog (`src/assistant/commands/translate.ts:18-29`) and
`LOCALE_REGISTRY` (`src/i18n/locale-registry.ts:12-23`) agree on the ten
supported locales. Normalize the request against one of them — reject unknown
codes at the service boundary rather than letting the model guess.

The guard is the point of this ticket. Prompt-instructed name preservation is
not preservation; it is a suggestion to a model. So the service verifies the
output and refuses it:

1. For every glossary term with `strategy = pin`
   (`TASK-publication-glossary-term-base.md`): the exact surface form must
   appear in the translated body at least as many times as in the source body.
2. For every term with `strategy = override`: the approved rendering for the
   target locale must appear wherever the source term appeared.
3. Any failure → the translation is written as `status = rejected` with the
   offending term named, and the unit keeps its previous good translation. The
   caller gets the named reason; nothing silent is stored as `complete`.

The check is string containment, deliberately. No fuzzy matching, no
language-aware term extraction, no correction pass — a second model call to
check the first is out of scope for v1. `ponytail:` a containment check misses
case-folded and inflected renderings; if real translations start failing on
legitimate variation, upgrade path is a per-locale normalization table in the
glossary, not a smarter matcher.

A rejected translation is retryable: the batch pass
(`TASK-publication-translation-batch-cron.md`) re-attempts on the next sweep
because the row is `rejected`, not `complete`. Cap retries implicitly by
rewriting the prompt — no retry counter column in v1.

## Acceptance Criteria

- [ ] `buildTranslateDeps`-shaped dependency construction is reused; no second
      provider-resolution path is added (the service takes the same deps the
      `/translate` command takes)
- [ ] Unknown or unsupported target locales are rejected at the service boundary
      before any provider call
- [ ] The prompt carries the publication's pinned terms as explicit
      do-not-translate instructions and override terms as use-this-rendering
      instructions
- [ ] A translated body missing a pinned term is stored `rejected` with the term
      named in the failure, and the caller receives that named reason
- [ ] A translated body missing an approved rendering is stored `rejected` the
      same way
- [ ] A translation passing the guard is stored `complete` and served by the
      read path
- [ ] The guard is covered by a unit test with a stub provider: pinned term
      dropped, pinned term transliterated (must fail), override rendering used
      (must pass), and a clean pass
- [ ] Owner authorization on every translate request for the unit's publication
      (non-owner gets 404)
