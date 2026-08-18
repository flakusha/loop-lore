<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-PLAN-UNWIRED-CODEOUT: Unwired-code close-out (LoRA, detectIntent, swipe)

**Status:** ✅ Complete (2026-08-18)
**Priority:** medium
**Labels:** unwired, routes, lora, crafting, battle
**Assignee**:
**Epic**:
**Related:** TASK-crafting-stations-execution.md, TASK-wire-crafting-routes.md, TASK-battle-equipment-integration.md, TASK-lora-discovery-application.md

Git issue: `fea7fe2`

## Summary

Close out remaining unwired-code items: crafting stations/attempts/orders routes,
combat equipment durability, and LoRA route wiring.

## Completed Items (worktree `feature/a8-unwired-closeout`, commit `a7ffbb70`)

| Item | Status | Files |
|------|--------|-------|
| IS1: Crafting stations (defs + instances CRUD) | ✅ | `station-defs.ts`, `station-instances.ts`, `stations.ts` barrel |
| IS2: Crafting attempts (`POST /craft`) | ✅ | `attempt.ts` |
| IS3: Crafting orders (place/accept/fulfill/cancel) | ✅ | `orders.ts`, `CraftingOrderService` |
| IS4–IS6: Trade lifecycle / NPC trading / history | ✅ | Already wired (kept registered) |
| IS7: Combat equipment durability | ✅ | `equipment-durability.ts`, migration `048` |
| LoRA route wiring | ✅ | `register-plugins.ts` (uncommented + wired) |

## Verification

- 20/20 unit tests pass
- typecheck (backend) clean
- typecheck:coverage 96.85% (≥90%)
- lint clean (all A8 files)
- db:schemas:check up-to-date
- wiring:check OK
- Full registration smoke: 611 routes, all A8 endpoints present
