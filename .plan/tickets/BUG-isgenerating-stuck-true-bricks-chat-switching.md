<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: isGenerating stuck true bricks chat switching

**Priority:** medium
**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** done

## Evidence

- bun test src/generation/: 494 pass / 0 fail
- bun test src/assistant/: 177 pass / 0 fail
- bunx tsc --noEmit -p tsconfig.backend.json: exit 0

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
