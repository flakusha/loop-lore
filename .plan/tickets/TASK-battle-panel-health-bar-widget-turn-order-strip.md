<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Battle panel health-bar widget + turn-order strip

**Status:** Done
**Priority:** high
**Effort:** Small
**Epic:** battle-ui
**Tags:** battle-ui

**Summary:**

Extract a reusable health-bar widget (src/frontend/battle/health-bar.ts) from the roster's inline HP markup — accessible progressbar, clamped 0-100, t()-driven label — and add a turn-order strip (src/frontend/battle/turn-order.ts) deriving the acting-first initiative queue from the turnIndex/initiative roster the battle payload already delivers; rendered above the roster while the battle is active. Wired into panel.ts/render.ts with vn.css styles, en.json + locale keys, and unit tests (health-bar.test.ts, turn-order.test.ts, panel.test.ts pins).

**Caveats:**

- **TOCTOU:** none — pure DOM builders over an already-delivered payload.
- **Security:** combatant names/labels flow through textContent / aria attrs, never innerHTML; no new injection surface.
- **Authorization:** display-only; reuses the existing panel send path with no new commands.
- **Parallelism:** panel keeps its module-level singleton state as before; widgets are stateless.
- **Lock/unlock lifecycle:** N/A.
- **Partial failure:** renderTurnOrder on an empty roster renders label-only; renderHealthBar clamps degenerate hp/maxHp inputs.
- **Rollback:** revert the single feat(frontend) commit; no data or schema touchpoints.
- **Stale state:** strip re-renders on every panel render; refreshBattle path unchanged.
- **Data races:** none — no async, no shared mutable state introduced.
- **Idempotency:** builders are pure; repeated render() calls replaceChildren first.
- **Observability:** N/A (no new network or telemetry surface).

**Context:**

The roster previously carried inline HP markup, so the battle panel duplicated presentation logic instead of reusing a shared component. Per epic-battle-ui's shared-component table, a reusable health-bar widget was extracted and a turn-order strip added, derived client-side from the delivered turnIndex/initiative roster (serializeBattle payload) — no backend change. Both are wired in panel.ts/render.ts, styled in vn.css, and keyed in all 10 locale files via i18n:fix.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution (2026-10-23, worktree battle-ui-actions)

Implemented in commit fa1deb092: health-bar.ts + turn-order.ts + render.ts/panel.ts wiring + vn.css + locale keys. Tests added: health-bar.test.ts (8) and turn-order.test.ts (8), plus a panel.test.ts overlay child-order pin (header, turn-order, roster, actions; strip omitted when inactive). Plan artifacts were regenerated; remaining gaps (status badges, battle log, flee) are documented in the epic's Unticketed Gaps with payload evidence.
