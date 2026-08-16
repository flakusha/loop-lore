<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Split `src/logger/index.ts` (God Module, ~59 importers)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-code-quality

## Summary

Break `src/logger/index.ts` into focused sub-modules. Currently imported by ~59 files. Index re-exports many sub-services, masking what callers actually need.

## Target Structure

```
src/logger/
  core.ts           # base logger class
  format.ts         # log formatting helpers
  levels.ts         # log level definitions and filtering
  transports.ts     # output transports (file, stderr, etc.)
  index.ts          # barrel: selective re-exports only what callers need
```

## Acceptance Criteria

- [ ] Each module < 150 lines
- [ ] `bun run typecheck` passes after split
- [ ] No importers broken (update all 59 import sites)
- [ ] Callers import only what they use (no more `import { something } from 'logger'` for things they don't need)

## Files

- `src/logger/index.ts` → split into `src/logger/`
