<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: fix-character-growth-pre-existing-gate-failures

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Resolve 3 pre-existing character-growth gate failures blocking green check on dev. Identified by random-events session 2026-09-05 (post ff-d to dev @ bfe2b1cb). Byte-identical to dev before that session - not introduced by random-events work. Failures (3): 1. lint - eslint: src/assistant/prompt/sections/actor-growth.ts:40:39 - Promise.all() no-restricted-syntax. 2. md - lint: .plan/epics/epic-character-growth.md:203 - MD004 ul-style mismatch. 3. size - strict: growth-service/crud.ts 400L + character-growth/index.ts 257L exceed 250L soft gate. Owner: character-growth workstream.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
