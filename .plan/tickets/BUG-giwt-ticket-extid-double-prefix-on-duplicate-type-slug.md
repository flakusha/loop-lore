<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: giwt-ticket-extid-double-prefix-on-duplicate-type-slug

**Status:** done
**Priority:** medium
**Effort:** Medium
**Summary:** Extid derived from `giwt ticket` title doubles the prefix when the title contains the type-name twice.
**Context:** Backfilled 22 orphan git issues on 2026-09-20; 8 of them were double-prefixed bestiary tickets; renamed them via `git issue edit` to match the .md filename. This ticket records the root cause for giwt upstream.
**Acceptance Criteria:** Single source of truth for extid; repro test added; giwt upstream PR landed.

## Summary

When `giwt ticket` is invoked with a title that already contains the type-name, the resulting extid has the type-name repeated twice. The .md filename does NOT contain the duplication; the git issue title does. The desync persists because `giwt sync --fix` keys both sides on the extid.

## Repro

Run a ticket creation with a doubled-word title; observe the filename uses one prefix while the git issue extid uses two.

## Workaround

Until giwt is fixed, rename the git issue title via `git issue edit <id> -t <newtitle>` so the extid matches the .md filename. Applied to 8 bestiary issues in `tree/fix-orphan-issues-backfill/`.

## Where

- `giwt/src/commands/ticket.ts` — title-based extid derivation
- `giwt/src/tickets/sync-ticket.ts` — extid compare logic

## Fix sketch

- Parse filename for extid (current behavior in `sync-index.ts`) and use the file-extid consistently for ticket creation instead of deriving from the prose title.
- Or: collapse duplicate word-prefix segments when deriving extid from title.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
