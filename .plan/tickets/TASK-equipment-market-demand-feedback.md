<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Equipment/inventory ↔ market demand feedback loop

**Summary:** Trading core (tradecore, src/services) and the implemented inventory/equipment model have no price feedback: character purchases never move market prices. Wire equipment/inventory transactions into MarketDynamics (epic-battle-action-systems.md:314; epic-economy-trading.md owns the market sim) so buying/selling in a market zone shifts that item's local supply/demand and price.
**Context:** Read/write seam between character economy actions and the planned economy sim; tradecore currently lacks even a world-id filter (BUG-services-tradecore-validatelines-lacks-world-id-filter-cross) — that bug gates correct zone scoping and should land first.
**Acceptance Criteria:** Purchase/sale events update zone-level demand for the item category; subsequent price lookups reflect the shift (bounded, decaying); feedback is per-world scoped; prompt/narration surface mentions scarcity or glut after large swings; tests for buy-shift, sell-shift, and decay.

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

**References:**
- Epic: .plan/epics/epic-character-world-integration.md
- Market owner: .plan/epics/epic-economy-trading.md, MarketDynamics in .plan/epics/epic-battle-action-systems.md
- Blocker-ish: BUG-services-tradecore-validatelines-lacks-world-id-filter-cross

**Branch:** open on dev.
