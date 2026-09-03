<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Single source of truth for config schema mirrors

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

D3, decision 2026-09-03: mirrored structures MUST be derived from one source of truth. config/schema-class/json-schema/generation.ts vs config/sections/generation/{sd,llama}.ts (409t/54l, 342t/37l; ~5.5k tokens, ~6 files). Reuse the DB-schema codegen pattern (migrations -> generated artifacts). Epic/task promotion candidate per user. Before starting, verify no other session still owns config/schema-class/json-schema/* (a finalize stash previously touched these files; stash state changed since triage).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
