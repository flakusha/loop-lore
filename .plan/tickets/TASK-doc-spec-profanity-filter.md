<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Document Profanity Filter spec

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
