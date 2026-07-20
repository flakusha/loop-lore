# TASK: Regex Extraction to Constants + Unit Tests

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Low–Med

## Summary

Regex patterns scattered across source files need consolidation into dedicated constants with comprehensive unit tests. Validates correctness for normal and edge cases.

## Motivation

- Regex correctness is critical for parsing (command detection, markdown, imports)
- Edge cases (nested patterns, unicode, empty input) often break silently
- Centralized constants prevent duplication and enable reuse

## Tasks

### Phase 1: Audit & Extract

- [ ] Grep all `src/` for inline regex patterns (`/.../`, `new RegExp(...)`)
- [ ] Categorize by domain: markdown, commands, URLs, emails, filenames, etc.
- [ ] Create `src/constants/regex.ts` (or domain-specific files like `src/commands/regex.ts`)
- [ ] Export named constants: `MARKDOWN_CODE_BLOCK`, `COMMAND_PATTERN`, `URL_REGEX`, etc.
- [ ] Rewire all usages to import from constants

### Phase 2: Unit Tests

- [ ] Create `src/constants/regex.test.ts` (or per-domain test files)
- [ ] Test each pattern with:
  - Valid/expected inputs (positive matches)
  - Edge cases (empty string, unicode, very long strings, nested patterns)
  - Non-matches (negative cases)
  - Boundary conditions (start/end anchors, multiline behavior)
- [ ] Test `RegExp.exec()` and `RegExp.test()` behavior
- [ ] Test capture groups return expected structure

### Phase 3: Validation

- [ ] Run `bun test src/constants/`
- [ ] Run `bun run check` — ensure no regressions
- [ ] Verify no inline regex remains outside constants (except trivial cases)

## Files to Create

- `src/constants/regex.ts` — centralized regex constants
- `src/constants/regex.test.ts` — comprehensive tests

## Files to Modify

- All files importing regex patterns (repoint imports)

## Risk

Low — mechanical refactor, tests validate correctness.
