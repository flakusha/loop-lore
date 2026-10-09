// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared wire shapes for the world travel feed and route stops — the single
 * definition both the backend routes and the frontend Alpine stores import.
 */

/** A transport (or any route-bound location) currently following a route. */
export interface TransportStatus {
  locationId: string;
  name: string;
  routeId: string;
  routeName: string;
  loop: boolean;
  progress: number;
  stopCount: number;
  nextStopName: string | null;
  hazards: string[];
}

/** A party walking a stored route (world-travel simulation). */
export interface PartyStatus {
  id: string;
  name: string;
  status: string;
  routeIndex: number;
  travelProgress: number;
  currentLocationId: string | null;
  currentLocationName: string | null;
  hazards: string[];
}

/** The whole GET /worlds/:worldId/travel/status payload. */
export interface TravelStatusPayload {
  transports: TransportStatus[];
  parties: PartyStatus[];
}

/** One row of travel_route_stops as served to route consumers. */
export interface TravelRouteStopRow {
  id: string;
  location_id: string;
  stop_order: number;
  dwell_seconds: number;
  coord_x: number | null;
  coord_y: number | null;
  coord_z: number | null;
}
