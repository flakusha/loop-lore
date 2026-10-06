<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Document Regex Extraction pipeline spec

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Priority:** P3
**Epic:** epic-docs-reconciliation
**Tags:** docs, spec, regex
**Related:** src/regex/*, README.md (Regex extraction row)

## Summary

README lists **Regex extraction** as WIP with `_spec pending — see src/regex/`_,
but `src/regex/` is a substantial, well-tested module (33 files across image-edit
command tags, assistant intent, memory classification, transitions,
hallucination guards, music URLs, HTML sanitization, story-event extraction,
template/narrative signals, cookies, slugification, commit/semver, dice,
code-fence JSON, and placeholder/i18n directives). No `docs/spec/regex-extraction.md`
exists.

Author `docs/spec/regex-extraction.md` in the `docs-current-features` worktree:
a module map of the compiled-pattern exports, the story-event detail grouping,
and usage notes. Wire it into the VitePress sidebar (Core Systems group) and link
it from the README features table.

## Acceptance Criteria

- [ ] `docs/spec/regex-extraction.md` exists and maps the implemented submodule exports (verified against `src/regex/index.ts`)
- [ ] Sidebar entry added under Core Systems
- [ ] README Regex extraction row links the new spec
- [ ] `bun run md:lint` + `bun run format` pass on the new file

## Clarification 2026-09-26

Current behavior: `docs/spec/regex-extraction.md` EXISTS (4.0KB). Sidebar entry exists at `docs/.vitepress/config.mts:80` under Core Systems. `src/regex/` holds ~20 modules; `src/regex/index.ts:12-187` re-exports: image-edit, intent, action-parser, memory-classification, transitions, hallucination, music-urls, html-sanitize (+streaming), story-events, template, narrative, cookies, slugs, commit/semver, dice, code-fence, placeholders/i18n, plus `safe-exec` hardening (`assertInputSize`, `safeRegexExec`, `safeRegexMatch`).

Scope disambiguation: ticket scope predates `safe-exec.ts` and `html-sanitize-streaming.ts` — the spec's module map must include the hardening helpers and the streaming sanitizer, not just the story-event grouping. README-row criterion is un-actionable (`README.md:39-41`, no features table).

Scoped next step: verify the spec's export map against `index.ts`, run `bun run md:lint` + `bun run format`, then close. Topical open git issues: `9bb9cbf` (assistant intent regexes hijack normal chat — precision hazard in `intent.ts`), `8a3b90e` (slash-autocomplete regex not caret-anchored) — both are consumer bugs, out of scope for the spec ticket but must-read before touching patterns.

Acceptance:

- [ ] Spec module map matches every export block in `src/regex/index.ts` incl. `safe-exec`
- [ ] `bun run md:lint` + `bun run format` pass on `docs/spec/regex-extraction.md`
- [ ] README-row criterion reinterpreted or removed
