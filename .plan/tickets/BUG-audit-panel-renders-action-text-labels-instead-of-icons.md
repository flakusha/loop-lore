<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Audit panel renders action text labels instead of icons

**Status:** done
**Priority:** medium
**Effort:** Medium

**Summary:**

**Where**: src/components/chat/memory-panel.html:258

**What**: transform.ts:auditActionLabel text-only — add icon/emoji mapping per action.

**Fix**: Add icon/emoji mapping per action.

**Source**: FEAT-075 gap audit (.tmp/audit/SYNTHESIS.md)

**Context:**

Audit panel (FEAT-075) renders audit-log action labels as plain text. Spec acceptance criterion requires action icons (emoji) for at-a-glance recognition.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Premise partially stale: an icon mapping (`AUDIT_ACTION_ICONS` + `auditActionIcon()` in `src/frontend/alpine/memory-panel/transform.ts:161-170`) was already wired into the template (`memory-panel.html:272` renders `_auditActionIcon(entry.action)` before `_auditActionLabel(entry.action)`) with per-action tests in `transform.test.ts`. This batch closed the remaining recognition gap and hardened the contract:

- `src/frontend/alpine/memory-panel/transform.ts:167` — `purge` previously shared the 🗑 icon with `delete`; now 🧹 so all eight actions are visually distinct (FEAT-075's at-a-glance-recognition criterion).
- `transform.test.ts` — new regression test `auditActionIcon maps each action to a distinct icon` (set-size == action-count), which fails if any two actions ever share an icon again.
- Verified: `bun test src/frontend/alpine/memory-panel/transform.test.ts` passes (includes distinctness + non-empty coverage for every `AUDIT_ACTIONS` entry).
- Docs: `docs/frontend/chat/memories.md` — audit-tab section lists the per-action icon map.

No template change was required — the icon plumbing landed earlier; only the icon map value and the distinctness test changed in this batch.
