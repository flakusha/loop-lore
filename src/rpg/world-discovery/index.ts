// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/world-discovery/index.ts — module barrel
 *
 * Exploration progress and `trade:route` events for the world-tick
 * scheduler, plus the read surface the admin panel uses. See
 * `discovery.ts` for the replay argument and `trade.ts` for the claims
 * decision.
 */
export {
  DECAY_PER_TICK,
  DISCOVERY_THRESHOLD,
  EXPLORE_GAIN,
  runDiscoveryTick,
} from "./discovery";
export { discoveredKey, emitWorldEvent, listWorldEvents, tradeRouteKey, } from "./events";
export { runTradeTick, } from "./trade";
export { discoveryDb, } from "./types";
export type {
  DiscoveryDb,
  DiscoveryResult,
  DiscoveryTables,
  LocationDiscovery,
  TradeResult,
  WorldEventInput,
  WorldEventListQuery,
  WorldEventLog,
  WorldEventPage,
  WorldEventRow,
} from "./types";
export { LOCATION_DISCOVERED, TRADE_ROUTE, } from "./types";
