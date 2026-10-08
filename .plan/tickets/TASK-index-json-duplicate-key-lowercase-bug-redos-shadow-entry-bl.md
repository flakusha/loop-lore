<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: index.json duplicate key: lowercase BUG-redos shadow entry blocks clean diff

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Tags:** plan-hygiene, index, duplicate-key

**Summary:**

`index.json` at HEAD contains a lowercase-keyed entry `BUG-redos-in-html-sanitize-script-tag-pattern-chunk-boundary-san` that shadows the correctly-cased entry `BUG-redos-in-html-sanitize-script-tag-pattern-chunk-boundary-san`. The shadowed entry is tracked by git issue `b465b08` (status: Done). The lowercase entry has git issue `1a15200b`. Two git issues exist for what is effectively the same defect.

## Evidence

- `index.json` line ~5983: lowercase key `"BUG-redos-in-html-sanitize-script-tag-pattern-chunk-boundary-san"` with `git_issue: "1a15200b"`.
- `index.json` line ~5991: uppercase key `"BUG-redos-in-html-sanitize-script-tag-pattern-chunk-boundary-san"` with `git_issue: "b465b08"` (Done).
- Both entries reference the same `.md` source file.

## Git issues

| ID | Key | Status |
|----|-----|--------|
| `1a15200b` | lowercase entry | (open, unverified) |
| `b465b08` | uppercase entry | Done |

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

## Decision needed

**Option A:** Close `1a15200b` as duplicate of `b465b08`. Delete the lowercase `index.json` key.

**Option B:** Re-open `b465b08` with new evidence and close the lowercase entry. Keep the correctly-cased key.

**Option C:** Both issues have independent scope — confirm whether the lowercase-keyed entry represents a distinct open defect (chunk-boundary sanitization) not fully resolved by `b465b08`.

**Acceptance Criteria:**

- [ ] Filer decides among Options A/B/C above
- [ ] `index.json` updated to remove ambiguity (either key removed or both retained with distinct scope)
- [ ] `plan:validate` passes
