<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Document Regex Extraction pipeline spec

**Status:** 🟡 In Progress
**Priority:** P3
**Epic:** epic-docs-reconciliation
**Labels:** docs, spec, regex
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
