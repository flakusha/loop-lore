<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Size allow waivers: characters/update.ts and chat/bootstrap.ts

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** Size-allow waivers documenting pre-existing file-size ceiling breaches on dev.
**Context:** check-file-size --strict blocks every finalize; this waives two pre-existing files.
**Acceptance Criteria:** Waivers applied; owners document split-and-remove path.

## Summary

check-file-size --strict blocks every finalize: src/routes/characters/update.ts (255L) and src/frontend/alpine/chat/bootstrap.ts (274L) exceed the 250L soft ceiling. Both are pre-existing on dev, owned by the characters-epic and chat-frontend surfaces. Applied the gate's documented // size-allow header (260L / 280L) to unblock the finalize pipeline; owning surfaces should split both files per docs/meta/code-practices-improvements/04 and then remove the directives.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

git issue: af6cafb
