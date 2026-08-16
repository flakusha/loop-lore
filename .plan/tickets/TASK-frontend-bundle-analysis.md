<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Analyze Frontend Bundle Composition

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Small
**Epic:** epic-frontend-bundle-optimization

## Summary

Analyze current frontend JS bundle composition to identify bloat, dead code, and optimization opportunities. Produce a report with per-chunk breakdown and recommendations.

## Scope

- Run `bun build` with `--analyze` or `source-map` to identify largest modules per chunk
- Identify duplicated dependencies across chunks (vendor vs app vs pages)
- Find unused exports and dead code in each bundle
- Measure per-chunk gzip/brotli compressed size
- Document findings with concrete recommendations

## Deliverables

- `docs/meta/frontend-bundle-analysis.md` — report with:
  - Per-chunk module breakdown (top 20 largest modules per chunk)
  - Duplicated dependencies across chunks
  - Unused exports / dead code candidates
  - Compression ratio per chunk
  - Recommended split points for lazy loading

## Acceptance Criteria

- [ ] Analysis report exists in `docs/meta/`
- [ ] Top 10 bloat contributors identified
- [ ] Recommended chunk split plan documented
- [ ] Estimated post-optimization sizes provided

## Files

- `dist/public/` — build output to analyze
- `docs/meta/frontend-bundle-analysis.md` — analysis report
