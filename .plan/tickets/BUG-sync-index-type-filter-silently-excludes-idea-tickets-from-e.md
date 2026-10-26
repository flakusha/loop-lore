<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: sync-index type filter silently excludes IDEA tickets from every --fix mode

**Status:** In Progress
**Status Note:** [2026-10-26 sweep-C verify + fix pass] NEEDS-UPSTREAM. Verified in node_modules/giwt/src/tickets/sync-index.ts:112 and :123 — the scan filter /^(TASK|FEAT|BUG|FIX|EPIC|SOL|INFRA|TEST|PERF|WIRE|IMPROVE)-/i still excludes IDEA, so IDEA tickets are invisible to every sync/`--fix` mode. `giwt` is a pinned GitHub dependency (package.json: `"giwt": "github:flakusha/giwt"`), node_modules must not be edited, and this repo carries NO local override seam: scripts/ contains no duplicate of the filter (grep for the prefix alternation across scripts/ finds nothing) — `plan:sync` shells straight through to the giwt binary. Fix requires an upstream giwt change (widen the prefix set to include IDEA, or derive it from guessType in sync-parse.ts); tracked here until the upstream dep is bumped.
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-tooling-improvement
**Git Issue:** 28d0678

**Summary:**

BUG sync-index type filter silently excludes IDEA tickets
The ticket-index scan filter in sync-index.ts (both the .plan/tickets readdir at ~line 112 and the .plan/epics readdir at ~line 123) admits only files matching /^(TASK|FEAT|BUG|FIX|EPIC|SOL|INFRA|TEST|PERF|WIRE|IMPROVE)-/i. Every other .md in those directories is dropped before parseTicketFile runs, so it never reaches any reconciliation pass. Measured on the current tree: 3100 .md files in .plan/tickets, 3080 matched, 20 skipped — all 20 are IDEA-*. native-issue/SKILL.md lists IDEA- as a first-class ticket type accepted by `giwt ticket`, so these are legitimate tickets, not stray files.

Consequence: the 20 IDEA tickets (14 still open) are invisible to every `--fix` mode. They are never adopted as orphans, never relinked when their hash goes stale, never status-reconciled against the registry, and never reported as importable/foreign. Three IDEA entries in .plan/tickets/index.json currently carry dead hashes (IDEA-CHAT-COMPOSER-INLINE-SUGGESTIONS-PROPOSAL=8ae1e91, IDEA-CHAT-COMPOSER-PREDICTIVE-INLINE-TEXT-SUGGESTIONS=056e932) and sync reports them only as advisory placeholders; `plan:sync --fix` emits "SKIPPED placeholder fix — no matching git issue (orphan left in place)" and leaves them forever. Their live registry issues are 3caee0f (open) and fef1c8b (closed), so the index can never self-heal to them. The scan count also under-reports, so the "Ticket .md files" line understates reality.

Same class of bug, opposite direction: placeholder repair matches by exact extid equality (sync-fix-index.ts fixPlaceholderHashes, `issue.extid === ph.extid`), while registry extids are normalized to uppercase and index keys come from filenames verbatim. BUG-redos-in-html-sanitize-script-tag-pattern-chunk-boundary-san is stored lowercase, its registry issue is BUG-REDOS-IN-HTML-SANITIZE-SCRIPT-TAG-PATTERN-CHUNK-BOUNDARY-SAN, and its registry issue b465b08 (closed) is unreachable by that case-sensitive scan. Any ticket whose index key case differs from its registry extid can never be repaired by --fix, silently, with no diagnostic.

Proposed fix, either is sufficient: (a) widen the prefix filter to include IDEA (and derive the accepted set from one shared list, as guessType in sync-parse.ts already does, so the two cannot drift again), or (b) keep the filter but emit an explicit advisory listing every skipped .md file, so a ticket type that sync cannot manage is visible instead of invisible. Additionally make placeholder repair and extid lookups case-insensitive (normalize both sides to upper case), and check the .md's own `git issue:`/`Git Issue:` line before falling back to a registry extid scan — the md already carries the correct hash for the ReDoS ticket.

Acceptance: every .md in .plan/tickets and .plan/epics is either reconciled or reported; a ticket type accepted by `giwt ticket` can be reconciled by `plan:sync --fix`; a case-differing index key is still repaired rather than reported as "no matching git issue".

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 28d0678 (registry tip: 3b911ed55 Konstantin Fedotov Close issue)
