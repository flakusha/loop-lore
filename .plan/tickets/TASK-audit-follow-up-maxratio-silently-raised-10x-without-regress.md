<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Audit follow-up: maxRatio silently raised 10x without regression test

**Status:** ✅ Done — verified stale (no code change required)
**Priority:** low
**Effort:** Medium

## Summary

Audit found a refactor commit raised maxRatio by 10x without an accompanying regression test. Either add coverage or document why the higher ratio is safe. See audit .tmp/audit/batch-C-rbac-refactor.md finding MEDIUM.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution (2026-09-03)

Verified stale — no code change required. The regression test exists and the audit's premise is wrong:

- `DEFAULT_MAX_RATIO = 1000` is declared in `src/utils/safe-buffer/constants.ts`; git history shows
  the constant has been 1000 since the original `feat(utils): add safeFetch and safeBuffer utilities`
  commit `93e85791`. No "silently raised 10x" refactor exists in `src/utils/safe-buffer` history —
  the audit's claim of a 10x change is unsupported by `git log -S "DEFAULT_MAX_RATIO" src/utils/safe-buffer`
  (only the original commit and the SPDX header sweep touch the constant).
- Regression coverage exists at `src/utils/safe-buffer/compression.test.ts:64-72`:
  ```
  test("post-check: zip bomb (high decompress/compress ratio) is still rejected", () => {
    // 5MB of zeros gzips to ~5KB — ratio ~1000x. Exceeds the 1000x limit.
    const bomb = Buffer.alloc(5_000_000, 0,);
    const compressed = gzipSync(bomb,);
    ...
    expect(result.error.message,).toMatch(/Compression ratio .* exceeds limit/,);
  });
  ```
- Other regression tests in the same file (lines 52, 64, 71) all exercise the ratio check directly.
- Conclusion: the 1000x cap is constant since inception, and the regression test that asserts
  rejection at this ratio is present and passing. No action required. Ticket resolved.
