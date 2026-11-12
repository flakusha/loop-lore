<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: smart-regen decision gate in main pipeline

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** In Progress
**Scope:** THEME 3 scripting-lite: shared macro engine, named args, per-command valves, pipe operator, smart-regen decision gate
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/generation/smart-regen.ts

**What**: Only used on explicit regen — add auto-trigger from quality heuristics.

**Fix**: Auto-trigger smart-regen from quality heuristics in the main pipeline.

**Source**: FEAT-013 gap audit (.tmp/audit/SYNTHESIS.md)

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated — beyond the config description and the note below, the gate's user-facing semantics (off-by-default menu, gate-on size heuristic, explicit-action passthrough) are now in docs/spec/assistant-commands.md "Smart-regen decision gate". Wave-4, scripting-lite lane.

## Implementation note (scripting-lite lane, 2026-11-12)

Decision module: `src/assistant/commands/regen-gate.ts` — pure, no IO. `decideRegenRoute(input)` takes `{ explicitAction, knownActions, target, gateEnabled }` and returns a discriminated union: `{ decision: "action", action }` (explicit, recognized id), `{ decision: "reroll" }`, `{ decision: "style", style }` (the smart-regen transforms vocabulary — shorter/longer from message size), `{ decision: "menu" }`.

Wiring: the single call site is `runRegenAction` (`src/assistant/commands/regen.ts`), which now dispatches through an exhaustive `switch` over the decision (`assertNever` default). Gate OFF (the default) reproduces the legacy behavior exactly: explicit actions dispatch to rewrite/improve, everything else lands on the usage menu.

Heuristic (gate ON only, unqualified regen): target ≥ 1200 chars → style `shorter`; ≤ 200 chars → style `longer`; mid-size → plain re-roll. A typed-but-unknown action id still lands on the menu so the typo stays visible.

Config: `assistant.smartRegenGate` (default `false`) added to the assistant section (`packages/core/src/config/sections/assistant.ts`); `schemas/*.json` regenerated via `bun run schemas:check:fix`. NOTE: the regenerated `schemas/env.schema.json` also picked up PRE-EXISTING staleness on this branch (dev landed the `integrations.inbound` / `repoAccess` config sections without regenerating the snapshots the branch inherited) — those hunks ride along to make `schemas:check` green.

Tests: `src/assistant/commands/regen-gate.test.ts` (pure decisions) + `regen.test.ts` "regen decision gate wiring" describe (gate off menu, heuristic styles by size, explicit-action passthrough with the gate on).

Not done here (kept out of scope): the FEAT's original "auto-trigger from quality heuristics in the main pipeline" framing — this lane implements the gate as the typed decision step at the `/regen` call site per the wave-3 assignment; no automatic mid-pipeline trigger fires without user action. Quality heuristics are message-size only (no LLM grading).
