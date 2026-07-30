---
name: sync-tickets
description: >
  Sync .plan/tickets/ .md files with git issues. Links orphan files to
  existing issues, creates compact git issues for unmatched files, and
  rebuilds index.json. Trigger: "sync tickets", "link tickets", "git issue sync",
  "sync-tickets".
---

# Sync Tickets — loop-lore

Links all `.plan/tickets/*.md` files to git issues using compact format
that references docs instead of duplicating content.

## Overview

| Step | Action                                                       |
| ---- | ------------------------------------------------------------ |
| 1    | Run `sync-ticket-index.ts` to find orphans                   |
| 2    | Link orphans to existing git issues via fuzzy title matching |
| 3    | Create compact git issues for unmatched files                |
| 4    | Update `index.json` with all links                           |
| 5    | Verify with sync script (0 mismatches)                       |

---

## Quick Start

```bash
# 1. Run sync to see current state
bun run scripts/sync-ticket-index.ts

# 2. Fix orphan files (interactive)
./scripts/worktree.sh sync

# 3. Verify clean
bun run scripts/sync-ticket-index.ts  # expect 0 mismatches
```

---

## Compact Git Issue Format

When creating new git issues for orphan files:

```bash
# Format:
git issue create -m "See: .plan/tickets/<filename>.md" "<extid>: <title>"

# Example:
git issue create -m "See: .plan/tickets/TASK-AUTH-COOKIES.md" "TASK-AUTH-COOKIES: Session cookies"
```

**Benefits:**

- Git issue body references .md file (no content duplication)
- Single source of truth: `.plan/tickets/*.md`
- Git issues are lightweight pointers

---

## Fuzzy Title Matching

The sync script matches extid → git issue using word overlap:

```javascript
// Matching criteria (any one passes):
indexTitleNorm.includes(issueTitleClean.slice(0, 15,),);
issueTitleClean.includes(indexTitleNorm.slice(0, 15,),);
overlap.length >= 2; // 2+ words match
overlap.length > 0 && extidWords.length <= 3; // 1 match for short extids
```

**Examples:**

- `TASK-AUTH-COOKIES` matches `TASK-003: Session cookies` (overlap: "session", "cookies")
- `EPIC-COMBAT-SYSTEM` matches `EPIC-045: Combat & Battle Systems` (overlap: "combat", "system")

---

## Index.json Structure

```json
{
  "TASK-EXAMPLE": {
    "file": "TASK-EXAMPLE.md",
    "title": "Example task",
    "status": "open",
    "git_issue": "a1b2c3d",
    "hash": "a1b2c3d"
  }
}
```

**Rules:**

- Keys are UPPERCASE (consistent lookup)
- `git_issue` is the 7-char short hash
- `hash` matches `git_issue` (for quick comparison)

---

## Sync Script Output

```
📊 Scanning...
   Ticket .md files:  312
   Git issues:        401
   Index entries:     312
📋 Reconciliation Report
🟢 No orphan files        ← all .md files in index
🟢 No phantom entries     ← no index entries without .md files
🟢 No hash mismatches     ← all git_issue links valid
🟢 No status mismatches   ← index status matches git status
🟢 No missing hashes     ← all entries have git_issue
```

---

## Orphan File Handling

**Definition:** Orphan = `.md` file not in `index.json`

**Resolution:**

1. **Fuzzy match** → link to existing git issue
2. **No match** → create compact git issue (body: `See: .plan/tickets/<file>.md`)
3. **Link** → update index.json with new `git_issue` hash

---

## Common Commands

```bash
# Check current state
bun run scripts/sync-ticket-index.ts

# Fix orphans (interactive)
./scripts/worktree.sh sync

# Force rebuild index from .md files
./scripts/worktree.sh sync:fix

# Create single git issue for orphan
git issue create -m "See: .plan/tickets/TASK-NEW.md" "TASK-NEW: Title"
```

---

## Troubleshooting

**Problem:** "34 hash mismatches"
**Cause:** TASK→EPIC cross-type links where extid differs from git issue prefix
**Fix:** Script title matching accepts 2+ word overlap; run sync again after update

**Problem:** "Phantom entries in index"
**Cause:** Index has entries without corresponding .md files
**Fix:** `bun run scripts/sync-ticket-index.ts` removes phantoms automatically

**Problem:** "Status mismatch"
**Cause:** index.json status differs from git issue status
**Fix:** Script auto-updates index status from git issue status

---

## Related Skills

- `native-issue` — create/list/search git issues
- `commit-message` — conventional commits for ticket changes
