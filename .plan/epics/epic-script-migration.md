<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Script Migration to Modular Architecture

**Status:** 🟡 In Progress (tasks 1-2 complete)
**Priority:** Medium
**Effort:** Medium
**Type:** Infrastructure

## Objective

Refactor scripts folder into modular architecture with improved maintainability and testability.

### Tasks

1. Create `scripts/lib` directory for shared utilities ✅
2. Migrate shared functions to TypeScript modules ✅ (check-utils.ts already moved)
3. Convert shell scripts to ES modules (decide: .mjs vs .ts) ✅
4. Implement lean-ctx validation for context management
5. Create test suite for new architecture

### Implementation Path

1. Create directory structure:
   `src/scripts/lib/` for shared utilities
2. Convert `scripts/*.sh` to `.mjs` with TypeScript types
3. Create `scripts-workflow.md` for migration roadmap
4. Implement lean-ctx context weight validation
5. Develop test suite for new architecture

### Key Decision: .mjs vs .ts

| Aspect                    | .mjs (ES Modules) | .ts (TypeScript)     |
| ------------------------- | ----------------- | -------------------- |
| Type Safety               | JSDoc only        | Full TypeScript      |
| Compilation               | None (native)     | Required (bun build) |
| IDE Support               | Good              | Excellent            |
| Runtime                   | Direct            | Via bun              |
| Migration Effort          | Lower             | Higher               |
| Long-term Maintainability | Medium            | High                 |

**Recommendation**: Use `.ts` for:

- Shared libraries (`scripts/lib/`)
- Complex commands with business logic
- Anything needing strict types

Use `.mjs` for:

- Simple CLI entry points
- Thin wrappers
- Performance-critical hot paths

### Current State (as of migration start)

- `scripts/lib/` exists with: `check-utils.ts`, `colors.sh`, `assertions.sh`
- `worktree.sh` (44K) - main migration target
- `check-parallel.sh` (5K) - validation integration target
- Other check-* scripts: may stay as-is or be modularized

### Dependencies

- lean-ctx tools
- bun build system
- TypeScript configuration

### Status

- [x] Directory structure created
- [x] Shared utilities identified
- [x] Migration roadmap defined
- [x] Validation implementation planned (check-no-shell-refs.ts gate)
- [x] .mjs vs .ts decision documented
- [x] Worktree command extraction completed (29 commands ported)
- [x] AGENTS.md + .agents/skills/* references updated (59 occurrences)
- [x] Shell scripts ported: backup-sqlite, validate-backup-restore, lib/assertions, lib/colors
- [x] check-no-shell-refs.ts gate wired into check-parallel.mjs

### Relevant Files

- `src/scripts/worktree.sh` (current structure)
- `src/scripts/lib/` (new location)
- `src/scripts-workflow.md` (roadmap)
- `src/test/worktree.test.ts` (test suite)
