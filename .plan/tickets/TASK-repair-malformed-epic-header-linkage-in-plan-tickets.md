<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Repair malformed Epic header linkage in plan tickets

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Tags:** plan, housekeeping

**Summary:**

Data repair across .plan/tickets, covering THREE spellings of the same defect — an `**Epic:**` value that does not resolve to a bare epic slug, forking the ticket out of its epic:

- **Form A** (155 files) — stray extra colon, so the key is followed by a literal colon before the value.
- **Form B** (5 files) — the whole line escaped, so no literal bold key token survives and giwt silently records an empty epic.
- **Form C** (233 files) — canonically-keyed header, but the VALUE still carries a `.md` suffix.

All three normalise to the canonical header: bold `Epic:` key, single colon, bare slug value.

**Context:**

giwt extracts the epic value in `tickets/sync-parse.ts` with an unanchored regex over the first 30 lines (see line 64), and `plan/feature-matrix.ts` (buildMatrix, line 102) keys every byEpic row on that raw value string. Consequences:

- Form A yields a value beginning with a colon, so the ticket never matches its epic. The `linkage` gate in `plan/validate/format-gates.ts` does not catch it — it only errors when the value ends in `.md` and the named file is absent.
- Form B matches nothing at all, so the ticket lands in the `(unbound)` matrix row with no loud failure. A green `plan validate` does not prove linkage.
- Form C parses cleanly but the value is keyed verbatim, so one epic becomes two matrix rows (`epic-api-governance` and `epic-api-governance.md`). The repo's own normalizer strips the suffix the same way (`scripts/plan/normalize-plan-metadata.ts:106`).

Transform is scripted and line-scoped: rewrite only the single Epic header line, leave every other byte of the file untouched, and leave the files with no Epic header alone.

## Result

393 files rewritten (155 form A + 5 form B + 233 form C); diff is exactly 393 insertions and 393 deletions across `.plan/tickets/*.md` — one header line each, and every added line matches `**Epic:** epic-<slug>`. Canonically-correct tickets verified unchanged as controls.

Measured before/after, reverse-applying the diff to reconstruct the pre-repair state:

| metric | before | after |
| --- | ---: | ---: |
| files with no usable epic per `sync-parse.ts` | 1346 | 1186 |
| `linkage` gate unbound advisory | 1182 | 1182 (see below) |
| `epic-api-versioning` in index.json | 1 | 6 |
| `(unbound)` row in feature-matrix.md | 1681 | 1528 |
| index byEpic keys ending in `.md` | 77 | 7 (all pre-existing, see below) |
| feature-matrix `X` / `X.md` split pairs | 6 named in the brief | 6 residual, none from form C |

`epic-api-versioning` now holds BUG-VERSION-RESOLVER-MIDDLEWARE-BUILT-NOT-WIRED plus FEAT-035..039.

Form C collapsed these paired rows (counts summed, `.md` row gone):

| epic | before | after |
| --- | --- | --- |
| `epic-api-governance` | `1` + `epic-api-governance.md` `2` | single row `3` |
| `epic-api-telemetry` | `epic-api-telemetry.md` `3` (no bare row) | single row `3` |
| `epic-api-validation-guardrails` | `3` + `.md` `2` | single row `5` |

**The `linkage` gate count does not move, and that is the real finding.** The gate matched form A's line even when broken (the unanchored regex happily captures `: epic-slug`), and it only escalates to an error when the value ends in `.md` and the file is absent. Form A's values were bare slugs, so they were never flagged. The gate is not a linkage oracle; the index/matrix projection is.

## Residual `.md` values — pre-existing, deliberately not touched

7 matrix rows still end in `.md`. None came from form C; all were verified against HEAD and left alone:

- **4 stale index entries** (FEAT-2026-IRC-GROUP-CHAT-INTEGRATION, TASK-AUTONOMY-CONFIG-SURFACE-LAYERING-PRESETS-AND-OVERRIDES, TASK-AUTONOMY-RATE-GOVERNOR-FOR-LLM-ACTORS, and the two IDEA-* ones). Their `.md` headers were already bare at HEAD while the index still carried the suffix — index staleness, not a header defect. Fixing them means rewriting index values with no header change behind them.
- **4 multi-epic values** (TASK-CHAT-CONTEXT-PREFERENCE-PER-SCOPE, TASK-SEARCH-ENCRYPTED-BACKFILL, TASK-SEARCH-SERVICE-UNIFIED, TASK-SEARCH-TELEMETRY-OBSERVABILITY). These name 2-4 epics comma-separated; the index records only the first. `normalizeEpicRef` explicitly REFUSES multi-epic values (`normalize-plan-metadata.ts:110`), so choosing one is a human decision.

Also unchanged: 3 index entries carry no `epic` key at all and one `.source` is duplicated. Both anomalies were present at HEAD and are out of scope here.

**Acceptance Criteria:**
- [x] Form A (155), form B (5) and form C (233) normalised — 393 files, one Epic header line each; canonically-correct files untouched (control sample verified)
- [x] `bun run plan:validate` exits 0 after regenerating index, matrix and epics docs (all 11 gates pass)
- [x] Linkage restored with positive evidence: repaired tickets resolve to their epic in index.json and feature-matrix.md
- [x] Paired `X` / `X.md` matrix rows collapsed for every form C epic (75 distinct epics)
- [ ] 7 residual `.md` rows: 4 stale index entries and 4 multi-epic values needing a human decision on which epic wins
