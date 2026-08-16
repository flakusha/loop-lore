<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Split `src/config/schema.ts` (812L)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-code-quality

## Summary

Split `src/config/schema.ts` by domain into `src/config/schema/` submodules. Entire config shape currently in one interface file.

## Target Structure

```
src/config/schema/
  auth.ts             # auth config types
  db.ts               # database config types
  assets.ts           # asset storage config types
  generation.ts       # LLM generation config types
  tui.ts              # terminal UI config types
  server.ts           # server config types
  index.ts            # barrel: merged Config type re-export
```

`src/config/schema.ts` becomes a thin re-export barrel.

## Acceptance Criteria

- [ ] Each domain file < 150 lines
- [ ] `Config` type remains the public surface (unchanged API)
- [ ] `bun run typecheck` passes after split
- [ ] All existing config tests pass
- [ ] No behavior change (pure refactor)

## Files

- `src/config/schema.ts` → split into `src/config/schema/`
