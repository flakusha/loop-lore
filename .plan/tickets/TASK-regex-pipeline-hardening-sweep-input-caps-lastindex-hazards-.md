# TASK: Regex pipeline hardening sweep: input caps, lastIndex hazards, double scans

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Sweep across the regex pipeline:

- `src/regex/intent.ts:33-90` — ~30 unanchored `INTENT_PATTERNS` tested against full uncapped `userInput` per message (30×n, spammable); truncate to ~2KB before classification.
- `memory-classification.ts:38` — `ENTITY_PATTERN` near-linear but worst-case quadratic on alternating-case spam over uncapped bodies; bound repetition `{0,5}`.
- `story-events.ts:17` — lazy group with optional delimiters forces O(n²) positional retries on long punctuation-free narrative; anchor with required terminator.
- `intent.ts:110` — `REGEX_SPECIAL_CHARS` module-level `/g` flag: `.test()`/`.exec()` consumers inherit stale `lastIndex`; drop `g` flag.
- `placeholders.ts:15,18,24` — shared `/g` constants safe today via `matchAll`/`replace` only; document `matchAll`-only convention or clone per use.
- `generation/transforms.ts:19-24` — same global regex scanned twice per transform (match then replace); single replace pass with counting callback.
- `xml-utils.ts:60-61` — `new RegExp` from tag param without escaping; safe for internal constants, escape or allowlist before any external caller.

**Fix**: address each. Worst is `intent.ts:33-90` (CPU amplification on chat input).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
