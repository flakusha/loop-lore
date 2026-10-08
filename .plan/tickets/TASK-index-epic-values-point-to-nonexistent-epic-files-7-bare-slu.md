<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: index epic values point to nonexistent epic files — 7 bare slugs unresolved

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Tags:** epic-linkage, plan-hygiene

**Summary:**

20 bare epic slugs in `index.json` point to `epic-*.md` files that do not exist under `.plan/epics/`. The index records these as-is with no validation, so affected tickets have an epic link that resolves to nothing.

## Unresolved epic slugs

The following slugs appear in `index.json` `epic` fields but have no corresponding file in `.plan/epics/`:

| Slug | Appears in index entries |
|------|-------------------------|
| `epic-asset-support-expansion` | `FEAT-ASSET-SUPPORT-EXPANSION` |
| `epic-encryption-foundation` | `FEAT-ENCRYPTION-FOUNDATION-AES-256-GCM` |
| `epic-auth` | (legacy references) |
| `epic-testing` | (legacy references) |
| `epic-memory-systems` | `FEAT-MEMORY-SYSTEMS-THREE-TIER` |
| `epic-profanity-filter` | (legacy references) |
| `epic-embeddable-engine` | (legacy references; `epic-embeddable-engine-game-frontend` exists but is a different slug) |

Confirmed absent from `.plan/epics/` directory listing.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

## Options

**Option A:** Create the missing epic stub files. Appropriate if the epic is genuinely intended but not yet written.

**Option B:** Repoint the affected index entries to the nearest existing epic slug. Requires product call to determine which epic should own each ticket.

**Option C:** Clear the epic field to empty string (`""`) for affected entries. Makes the orphan state visible; can be resolved later.

## Recommendation

Option B (repoint) with Option C (clear) as fallback for genuinely deprecated slugs. Option A only for slugs that clearly map to a planned epic area.

## Evidence

`.plan/epics/` directory listing confirms none of the 7 slugs exist. `index.json` entries with these slugs are present in HEAD.

**Acceptance Criteria:**

- [ ] Decision made for each of the 7 slug categories
- [ ] Affected `index.json` entries updated or cleared
- [ ] `epics-index.md` regenerated; no broken epic links
- [ ] `plan:validate` passes
