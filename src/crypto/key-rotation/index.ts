// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Key Rotation — Auto-rotation logic for actor keys.
 *
 * Original module split into domain modules; this barrel preserves the
 * public import surface (`key-rotation` / `key-rotation/index`).
 */
export { runAutoRotation, } from "./auto-run";
export { findExpiredKeys, } from "./find-expired";
export { rotateActorKey, } from "./rotate";
export { startAutoRotationTimer, } from "./timer";
export type { RotationResult, RotationSummary, } from "./types";
