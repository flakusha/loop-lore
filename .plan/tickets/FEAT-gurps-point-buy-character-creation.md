<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: GURPS Point-Buy Character Creation

**Status:** ✅ Done (duplicate — remainder extracted, 2026-09-19)
**Priority:** low
**Effort:** Large
**Summary:** GURPS Point-Buy Character Creation
**Context:** Epic epic-character-spec; tags rpg, gurps, point-buy.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** epic-character-spec
**Tags:** rpg, gurps, point-buy

## Summary

Implement GURPS-style point-buy: configurable character point budget, modular advantages/disadvantages, skill-based granularity. Source: docs/meta/research/rpg-systems-comparison.md lines 130-170.

## Resolution

Core scope tracked by src/rpg/stats/generation.ts; epic-character-core-system.md:130-133. Unplanned remainder extracted 2026-09-19 → E19 modular advantages/disadvantages + 3d6 roll-under switch (epic-resolution-system.md) (docs-gap reconcile audit).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
