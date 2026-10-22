<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Battle panel health-bar widget + turn-order strip

**Status:** Not Started
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

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
