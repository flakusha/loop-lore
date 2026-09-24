<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC-RESEARCH-MATH-ECONOMY — Action & resource economy

**Status:** 📝 Draft
**Priority:** medium
**Effort:** Medium (turn budget table + Bennies table + dispatch enforcement)
**Type:** Research → Implementation
**Tags:** rpg, math, economy, action-economy, bennies, dispatch
**Overview:** Introduce an action economy: per-actor turn budget (major/minor/reaction) plus a Bennies-like meta-currency for rerolls. Make the LLM a principled refuser of repeat commands.

Introduce an action economy: per-actor turn budget (major/minor/reaction)
plus a Bennies-like meta-currency for rerolls. Make the LLM a principled
refuser of repeat commands.

## Why

Today the user can `/attack` repeatedly with no system enforcement. The
LLM often refuses narratively, but the platform has no opinion. Action
economy is the system-level answer.

## Sub-systems

- `src/db/migrations/011_turn_budget.ts` — `actor_turn_budget(actor_id,
  chat_id, major_used, minor_used, reaction_used, reset_at)`.
- `src/db/migrations/011_bennies.ts` — `actor_bennies(actor_id, balance,
  last_refresh)`.
- `src/rpg/economy/` — budget enforcement at command dispatch; Bennies
  spend/refund API.

## Acceptance criteria

- A second `/attack` in the same turn is rejected with
  `BUDGET_EXHAUSTED` and a clear error.
- A Bennie spend rerolls the last d20 and is reflected in the
  `interaction_logs.modifiers` JSON.
- Tests cover refresh logic (per-turn vs per-scene) and Bennie cap.

## Out of scope

- Per-scene / per-encounter refresh policy tuning — config-driven, but
  the default is "per turn" for the MVP.


git issue: 9c3661f
