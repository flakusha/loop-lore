<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Document Profanity Filter spec

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** 🟡 In Progress
**Priority:** P3
**Epic:** epic-docs-reconciliation
**Labels:** docs, spec, profanity
**Related:** src/profanity/service.ts, README.md (Profanity filter row)

## Summary

README lists **Profanity filter** as WIP with `_spec pending — see src/profanity/`_,
but `src/profanity/service.ts` implements `filter` / `containsProfanity` on top of
the `obscenity` library (leetspeak / confusable / case resolution via the English
recommended transformers). No `docs/spec/profanity-filter.md` exists.

Author `docs/spec/profanity-filter.md` in the `docs-current-features` worktree:
the API, behavior (asterisk masking, shared matcher), and current limitations
(English dataset only, no custom wordlists/allowlists). Wire it into the
VitePress sidebar (Core Systems group) and link it from the README features table.

## Acceptance Criteria

- [ ] `docs/spec/profanity-filter.md` exists and matches `src/profanity/service.ts`
- [ ] Sidebar entry added under Core Systems
- [ ] README Profanity filter row links the new spec
- [ ] `bun run md:lint` + `bun run format` pass on the new file

## Clarification 2026-09-26

Current behavior: `docs/spec/profanity-filter.md` EXISTS (53 lines; Overview + API backed by `obscenity`). Sidebar entry exists at `docs/.vitepress/config.mts:81` under Core Systems. Implementation is `src/profanity/service.ts:22-46`: one module-level `RegExpMatcher` (`englishDataset` + `englishRecommendedTransformers`) paired with `TextCensor` + `asteriskCensorStrategy`; `filter` returns input unchanged on no match, `containsProfanity` is a `hasMatch` probe.

Scope disambiguation: README has no features table — `README.md:39-41` points at `.plan/epics-index.md` instead — so criterion "README Profanity filter row links the new spec" is un-actionable as written. Reinterpret as: link from the docs index page if one lists specs, else drop the row criterion.

Scoped next step: diff the spec against `service.ts`, run `bun run md:lint` + `bun run format` on the spec file, then close. No open git issue is directly topical (nearest is ticket `TEST-profanity-containsprofanity-edge-cases-untested`).

Acceptance:

- [ ] Spec API section matches `filter`/`containsProfanity` signatures in `service.ts:34-46`
- [ ] `bun run md:lint` + `bun run format` pass on `docs/spec/profanity-filter.md`
- [ ] README-row criterion reinterpreted or removed (no features table in README)
