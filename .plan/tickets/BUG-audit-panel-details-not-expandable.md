<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Audit panel details not expandable

**Status:** done
**Priority:** medium
**Effort:** Medium

**Summary:**

**Where**: src/components/chat/memory-panel.html:261

**What**: Flat x-text span — add Alpine click-to-toggle with formatted JSON.

**Fix**: Add Alpine click-to-toggle with formatted JSON.

**Source**: FEAT-075 gap audit (.tmp/audit/SYNTHESIS.md)

**Context:**

Audit panel (FEAT-075) renders the details JSON field as a single flat text span. Long JSON entries are unreadable.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Implemented 2026-09-24 (the ticket's flat-span line had drifted from :261 to `src/components/chat/memory-panel.html:293`):

- `src/frontend/alpine/memory-panel/transform.ts` — new `formatAuditDetails(details)` (2-space pretty-print via `JSON.stringify(JSON.parse(details), null, 2)`; malformed JSON falls back to the raw string so the payload is never hidden; empty input renders `""`) and `auditDetailsExpandable(entry)` (true iff details are non-empty).
- `src/frontend/alpine/memory-panel/audit.ts` — component wiring: `isAuditExpanded(id)`, `toggleAuditExpanded(id)` (toggles the entry id in `memoryPanel.auditExpandedIds`), `_auditDetailsExpandable(entry)`, `_formatAuditDetails(entry)`.
- `src/frontend/alpine/chat-types/memory.ts` — `MemoryPanelState.auditExpandedIds: string[]`; initialized to `[]` in `src/frontend/alpine/memory-panel.ts`; method declarations added to `ChatMemoryState` (`chat-types/memory-state.ts`).
- `src/components/chat/memory-panel.html:293-312` — the flat `x-text="entry.details"` span is now a click-to-toggle row (`▸`/`▾` chevron + one-line ellipsized preview; `data-testid="memory-audit-details-toggle"`) that expands to the formatted JSON in a `<pre>` (`data-testid="memory-audit-details-json"`). Hidden entirely for empty details; `inject` rows keep their dedicated summary.
- Tests: `transform.test.ts` (pretty-print, malformed fallback, empty input, expandable predicate) and `audit.test.ts` (expand/collapse round-trip, per-entry tracking, transform exposure) — `bun test src/frontend/alpine/memory-panel/transform.test.ts src/frontend/alpine/memory-panel/audit.test.ts` → 44 pass, 0 fail.
- Docs: `docs/frontend/chat/memories.md` — Memory Panel now documents Tab 4 (audit log) including the expandable details behavior.
- Template rendering itself is not unit-testable (htmx/Alpine HTML); the expand/format logic is extracted into tested transforms per repo convention.
