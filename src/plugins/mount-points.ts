// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin UI mount points placeholder (FEAT-050).
 *
 * No-op integration: resolves which registered components belong to a
 * mount-point location. Pure lookup — nothing renders until views consume it.
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
 *
 * Placeholder: pure filter over `UIComponentDefinition.location`. Rendering
 * integration lands in the views layer.
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
