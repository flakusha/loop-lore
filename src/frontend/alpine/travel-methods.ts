// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Travel methods for the world travel interface (TASK-travel-interface).
 * Pure estimation helpers: a method carries a speed in location-units per
 * hour, and the ETA comes from the coordinate distance between origin and
 * destination (hop count fallback when either endpoint lacks coordinates).
 * Speeds are display-level estimates — the authoritative movement stays
 * with the chat location move, transport routes and the party simulation.
 */

/**
 * A selectable travel method. Ids mirror the player-pickable adjacency modes
 * of the `location_edges` mode enum (db/enums-story/world.ts).
 */
export interface TravelMethod {
  id: "walk" | "ride" | "fly" | "teleport";
  label: string;
  icon: string;
  /** Location-units crossed per hour. Teleport is instant. */
  unitsPerHour: number;
}

/** The selectable methods, in UI order. */
export const TRAVEL_METHODS: readonly TravelMethod[] = [
  { id: "walk", label: "Walk", icon: "🚶", unitsPerHour: 5, },
  { id: "ride", label: "Ride", icon: "🐎", unitsPerHour: 25, },
  { id: "fly", label: "Fly", icon: "🕊️", unitsPerHour: 100, },
  { id: "teleport", label: "Teleport", icon: "✨", unitsPerHour: Number.POSITIVE_INFINITY, },
];

/**
 * @param id a method id or an arbitrary string from the wire
 * @returns the method, defaulting to walk for unknown ids
 */
export function resolveTravelMethod(id: string | null | undefined,): TravelMethod {
  return TRAVEL_METHODS.find((m,) => m.id === id) ?? TRAVEL_METHODS[0]!;
}

/** Minimal coordinate pair the UI keeps for origin/destination. */
export interface TravelPoint {
  coordX: number | null;
  coordY: number | null;
}

/**
 * Euclidean distance between two points; null when either end lacks
 * coordinates (the UI then estimates from hop count instead).
 * @param origin
 * @param destination
 * @returns the distance in location-units, or null when coordinates are missing.
 */
export function coordDistance(origin: TravelPoint, destination: TravelPoint,): number | null {
  if (origin.coordX === null || origin.coordY === null || destination.coordX === null || destination.coordY === null) {
    return null;
  }

  const dx = destination.coordX - origin.coordX;
  const dy = destination.coordY - origin.coordY;
  return Math.sqrt(dx * dx + dy * dy,);
}

/**
 * Estimated travel minutes for a trip, or null when it cannot be estimated
 * (missing coordinates and no hop count). Teleport is always 0 minutes.
 * @param origin
 * @param destination
 * @param method
 * @param hops direct-connection hop count fallback (e.g. 1 for adjacent)
 * @returns the estimated travel minutes, 0 for teleport, or null when unestimable.
 */
export function estimateTravelMinutes(
  origin: TravelPoint,
  destination: TravelPoint,
  method: TravelMethod,
  hops: number | null,
): number | null {
  if (method.unitsPerHour === Number.POSITIVE_INFINITY) { return 0; }
  const distance = coordDistance(origin, destination,) ?? hops;
  if (distance === null) { return null; }
  return Math.ceil((distance / method.unitsPerHour) * 60,);
}

/**
 * @param minutes estimated minutes (null = unknown)
 * @returns human ETA like "45m" / "2h 10m" / "instant" / "unknown"
 */
export function formatEta(minutes: number | null,): string {
  if (minutes === null) { return "unknown"; }
  if (minutes === 0) { return "instant"; }
  if (minutes < 60) { return `${minutes}m`; }
  const hours = Math.floor(minutes / 60,);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
