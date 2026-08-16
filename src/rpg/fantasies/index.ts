// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fantasy/Kink System — Public API
 *
 * Re-exports all fantasy services for use by routes and other modules.
 */
export { FantasyService, } from "./service";
export type {
  CreateFantasyOpts,
  DiscoveryResult,
  Fantasy,
} from "./service";
