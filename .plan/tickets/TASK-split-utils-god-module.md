<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Split `src/utils.ts` (God Module, ~52 importers)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-code-quality

## Summary

Break `src/utils.ts` into domain-specific modules. Currently imported by ~52 files — any change ripples widely. Safe-JSON, date, id, and HTTP helpers all in one file.

## Target Structure

```
src/utils/
  json.ts       # safe JSON parse/stringify
  date.ts       # date formatting and helpers
  id.ts         # ID generation
  http.ts       # HTTP utilities
  index.ts      # barrel: re-export all (back-compat)
```

`src/utils.ts` becomes a thin re-export barrel or is removed once imports are migrated.

## Acceptance Criteria

- [ ] Each module < 100 lines
- [ ] `bun run typecheck` passes after split
- [ ] No importers broken (update all 52 import sites)
- [ ] Back-compat barrel (`src/utils.ts`) preserved until all callers migrated

## Files

- `src/utils.ts` → split into `src/utils/`
