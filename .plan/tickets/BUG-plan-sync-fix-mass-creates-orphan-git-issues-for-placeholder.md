<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: plan:sync --fix mass-creates orphan git issues for placeholder hashes

**Status:** ✅ Resolved (commit `4a1f56b8`)
**Priority:** high
**Effort:** Medium

## Summary

When --fix encounters entries whose .md file is missing (phantom index entry), it calls  with the ticket title. Closing the orphaned issue causes --fix to spawn a NEW orphan with a different hash on the next run. Observed in session-2026-09-03: 6+  issues spawned (, , , , …) — none with a real .md source. Source: scripts/sync-ticket-index.ts:252-271 (placeholder-hash auto-create). Fix: skip auto-create when entry.source file is missing; instead warn that the .md must be restored before --fix can register a git_issue.

## Resolution

Fixed in commit `4a1f56b8` by removing the auto-create branch in `scripts/sync-ticket-index.ts:252-273` (`applyFixes()` placeholder-hash loop):

```diff
-    // 2. Otherwise create a git issue so the entry has provenance.
+    // 2. Otherwise leave the placeholder as-is. Mass-creating git issues
+    //    for unprovenanced index entries produced a flood of orphan issues
+    //    (see BUG-plan-sync-fix-creates-orphan-git-issues); let the user
+    //    open the issue explicitly when they're ready.
     if (!target) {
-      const title = ph.ticketTitle || ph.extid;
-      const safeTitle = title.replace(/"/g, '\\"',);
-      const body = `Auto-created during index reconciliation (placeholder hash ${ph.indexHash} had no provenance).`;
-      try {
-        const out = execSync(
-          `git issue create "${ph.extid}: ${safeTitle}" -m "${body}" -l task -p medium`,
-          { timeout: 15_000, },
-        ).toString();
-        const hm = out.match(/Created issue ([0-9a-f]{7,})/,);
-        if (hm) {
-          const newHash = hm[1].slice(0, 7,);
-          target = { hash: newHash, status: "open", title: `${ph.extid}: ${title}`, extid: ph.extid, };
-          gitIssues.set(newHash, target,);
-          report.fixesApplied.push(`${ph.extid}: created git issue ${newHash}`,);
-        }
-      } catch {
-        report.fixesApplied.push(`${ph.extid}: FAILED to create git issue`,);
-        continue;
-      }
+      report.fixesApplied.push(`${ph.extid}: SKIPPED placeholder fix — no matching git issue (orphan left in place)`,);
+      continue;
     }
```

Placeholder hashes now log `...: SKIPPED placeholder fix ...` and `continue;` past the create branch. Real, non-placeholder hashes continue to flow through the existing matching/creation path unchanged — no regression on the happy path.

Diff: `+6 / -20` lines in `scripts/sync-ticket-index.ts` (commit `4a1f56b8`).

Bucket X close-out: `.plan/backlog/bucket-x-build-integrity-close-out-2026-09-03.md`.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Related

- `.plan/backlog/open-build-integrity.md` — cluster parent
- git issue `49dd182` / `2c747e0` / `7bb2bdf` — sibling build-integrity tsc errors
