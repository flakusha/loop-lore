// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/world-travel/index.ts — module barrel
 *
 * Party travel (route walking) and NPC migration (relocation schedules)
 * for the world-tick scheduler, plus the fractional budget ledger both
 * charge against. See `travel.ts` for the collision rule and
 * `budget.ts` for why the ledger is separate from the governor.
 */
export { ACTION_COST, BUDGET_WINDOW_TICKS, chargeBudget, DEFAULT_CEILING, readBudget, toSqlDate, } from "./budget";
export type { BudgetState, } from "./budget";
export { migrateNpc, } from "./migration";
export { advancePartyTravel, } from "./travel";
export { travelDb, } from "./types";
export type {
  NpcMigrations,
  TravelAction,
  TravelContext,
  TravelDb,
  TravelParties,
  TravelResult,
  TravelTables,
  WorldTravelBudget,
} from "./types";
