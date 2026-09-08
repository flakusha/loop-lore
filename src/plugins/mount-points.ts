// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin UI mount points (FEAT-050).
 *
 * Resolves which registered components belong to a mount-point location.
 * Pure lookup — rendering is consumed by the views layer, which calls
 * {@link getComponentsForMountPoint} per location when building pages.
 */

import type { UIComponentDefinition } from "./types";

/** Known UI mount-point locations. */
export const KNOWN_MOUNT_POINTS = [
  "chat.header",
  "chat.sidebar",
  "chat.composer",
  "admin.dashboard",
] as const;

/** A mount-point location id. */
export type MountPointLocation = (typeof KNOWN_MOUNT_POINTS)[number] | string;

/**
 * Return components registered for one mount-point location.
 * @param components - All registered UI components.
 * @param location - Mount-point location to resolve.
 * @returns Components targeting `location`, in registration order.
 * @example
 * getComponentsForMountPoint(registry.getAllUIComponents(), "chat.sidebar");
 */
export function getComponentsForMountPoint(
  components: UIComponentDefinition[],
  location: MountPointLocation,
): UIComponentDefinition[] {
  return components.filter((c,) => c.location === location,);
}
