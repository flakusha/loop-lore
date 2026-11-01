<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Lorebook Recursive World-Info Scanning

**Effort:** Medium
**Type:** epic
**Tags:** lorebook, world-info, activation, sillytavern-parity
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Medium

## Summary

ST-style recursive World Info scanning: entry content itself triggers other entries (layered worldbuilding — a faction entry mentioning an artifact pulls the artifact lore). Today activation scans only the conversation window and timeline events (`src/assistant/lore/reveal-condition.ts:39-51`); injected entry text is never re-scanned. Verified Absent: `giwt search "recursive scanning"` → no matches; lorebook search results contain no recursion ticket (2026-11-01).

## Scope

- Fixpoint pass over admitted-entry content with a bounded depth cap (ST defaults effectively shallow).
- Recursively admitted entries pass through the same cooldown / activation_chance / rarity / token-budget gates.
- Cycle safety and fail-open to flat activation on errors.

## Related Epics

- `epic-memory-knowledge-systems.md` — lore activation home.
- `epic-chat-context-optimization.md` — token-budget interplay.

## Tickets

- `TASK-recursive-world-info-scanning-entry-content-triggers-entries` (`a0446cf`, Medium) — first ticket per the research doc.

## Open Questions

None listed by the research doc.
