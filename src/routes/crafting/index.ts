// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Crafting Routes — barrel export.
 *
 * Exposes the full crafting HTTP surface. Recipe CRUD landed earlier; station
 * definitions/instances, craft attempts, and crafting orders are wired here
 * (see `epic-item-systems-unification` / A8 close-out).
 */
export { craftingAttemptRoutes, } from "./attempt";
export { craftingOrderRoutes, } from "./orders";
export { craftingRecipeRoutes, } from "./recipes";
export { craftingStationRoutes, } from "./stations";
