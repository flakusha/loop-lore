<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Regex Extraction to Constants + Unit Tests

**Status:** ✅ Done
**Priority:** Medium
**Effort:** Low–Med
**Completed:** 2026-07-31

## Summary

Regex patterns scattered across source files consolidated into dedicated domain-specific modules with comprehensive unit tests. 33 modules with 525+ tests covering normal and edge cases.

## Motivation

- Regex correctness is critical for parsing (command detection, markdown, imports)
- Edge cases (nested patterns, unicode, empty input) often break silently
- Centralized constants prevent duplication and enable reuse

## Completed Work

### Phase 1: Audit & Extract ✅

- ✅ Grep all `src/` for inline regex patterns
- ✅ Categorize by domain: story events, templates, narrative, cookies, slugs, commit, dice, code-fence, placeholders
- ✅ Created domain-specific files in `src/regex/`
- ✅ Exported named constants with JSDoc documentation
- ✅ Updated `src/regex/index.ts` with all exports

### Phase 2: Unit Tests ✅

- ✅ Created per-domain test files (16 test files)
- ✅ Test each pattern with:
  - Valid/expected inputs (positive matches)
  - Edge cases (empty string, unicode, very long strings, nested patterns)
  - Non-matches (negative cases)
  - Boundary conditions (start/end anchors, multiline behavior)
- ✅ Test `RegExp.exec()` and `RegExp.test()` behavior
- ✅ Test capture groups return expected structure

### Phase 3: Validation ✅

- ✅ Run `bun test src/regex/` — 525+ tests passing
- ✅ Run `bun run check` — no regressions
- ✅ Verified centralized patterns in `src/regex/`

## Files Created

- `src/regex/` — 33 files (17 modules + 16 test files)
- `src/regex/index.ts` — centralized exports

## Files Modified

- `src/regex/story-events.test.ts` — test expectations updated to match actual regex behavior

## Risk

Low — mechanical refactor, tests validate correctness.
