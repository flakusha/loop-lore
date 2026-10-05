// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export interface LocationTreeNode {
  id: string;
  parent_location_id: string | null;
  path: string;
  depth: number;
}

/** A `LocationTreeNode` plus its immediate children, recursively. `tree()` also emits `name` for display. */
export type LocationTreeBranch = LocationTreeNode & {
  name: string;
  children: LocationTreeBranch[];
};

export interface InsertLocationInput {
  worldId: string;
  name: string;
  description?: string;
  kind?: string;
  mobilityMode?: string;
  parentLocationId: string | null;
}

/**
 * Why `moveSubtree` refused a move. `code` lets callers map to HTTP statuses
 * without string-matching messages.
 */
export type LocationMoveReason = "self-parent" | "not-found" | "cross-world" | "cycle";

/** Typed rejection from `LocationTreeService.moveSubtree`. */
export class LocationMoveError extends Error {
  /**
   * @param code machine-readable rejection reason
   * @param message human-readable detail
   */
  constructor(
    readonly code: LocationMoveReason,
    message: string,
  ) {
    super(message,);
    this.name = "LocationMoveError";
  }
}
