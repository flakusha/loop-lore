<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: World Lore Lifecycle (confidence/decay/distortion)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** World Lore Lifecycle (confidence/decay/distortion)
**Context:** Source: docs/research/world-spec-extension-2026-09-21.md; tags lore, worlds.
**Epic:** epic-lore-knowledge
**Tags:** lore, worlds

## Summary

`world_lore_entries` has no concept of source reliability or temporal decay. A rumour promoted at world-day 0 is injected with the same weight as a fact verified at world-day 1000. `promoteEventToLore` (`src/story/events/promote-lore.ts`) writes to the same table. Need lifecycle metadata so `loreSection` can drop low-confidence lore and tag high-distortion entries.

## Acceptance Criteria

- Migration `002_world_lore_lifecycle.ts` appends five columns to `world_lore_entries`: `confidence` REAL NOT NULL DEFAULT 100, `last_verified` TEXT, `source_count` INTEGER NOT NULL DEFAULT 1, `distortion_level` REAL NOT NULL DEFAULT 0, `disputed` INTEGER NOT NULL DEFAULT 0.
- `bun run db:sync-types && bun run db:sync-manifest` regenerates schema, manifest, insert-helpers, db-schemas.
- `src/assistant/lore/lifecycle.ts` exports `LifecycleConfig`, `DEFAULT_LIFECYCLE_CONFIG`, `effectiveConfidence(row, worldDaysSince, cfg)`, `isDisputed(row, cfg)`, `resolveLifecycleConfig(worldRules)`. Pure functions, no DB I/O.
- `src/assistant/lore/lifecycle.test.ts` covers decay math, distortion clamp, no-verified identity, dispute threshold.
- `src/assistant/prompt/sections/lore.ts` queries the new columns, reads `lifecycle_config` from `worlds.rules`, drops entries where `effectiveConfidence < cfg.min_confidence`, wraps `disputed` entries in a `<disputed>` section.
- `src/assistant/prompt/sections/lore.test.ts` adds 3 cases: drop on low confidence, keep on fresh verification, wrap on dispute.
- `docs/spec/lore.md` §1.1 row table updated; new §1.4 lifecycle section.
