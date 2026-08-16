// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Location NSFW Config — Public API
 *
 * Re-exports all location NSFW services for use by routes and other modules.
 */
export { LocationNsfwService, } from "./service";
export type {
  LocationAtmosphere,
  LocationNsfwConfig,
  LocationRisks,
  UpdateLocationNsfwOpts,
} from "./service";
