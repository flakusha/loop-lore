// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Auto-rotation timer.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { runAutoRotation, } from "./auto-run";
import { log, } from "./log";

/**
 * Start auto-rotation timer.
 * Calls runAutoRotation periodically based on the configured interval.
 *
 * @param database - Kysely DB instance
 * @param rotationDays - Days before a key is considered expired
 * @param intervalMs - How often to check for expired keys (default: 1 hour)
 * @returns Timer ID for cleanup
 */
export function startAutoRotationTimer(
  database: Kysely<DB>,
  rotationDays: number,
  intervalMs: number = 60 * 60 * 1000, // 1 hour
): ReturnType<typeof setInterval> | null {
  if (rotationDays <= 0) {
    log().debug("Auto-rotation disabled, not starting timer",);
    return null;
  }

  log().info(`Starting auto-rotation timer (check every ${intervalMs / 1000}s, rotate after ${rotationDays} days)`,);

  // Run immediately on start
  void runAutoRotation(database, rotationDays,).catch((error,) => {
    log().error(`Auto-rotation failed: ${String(error,)}`,);
  },);

  // Then run periodically
  return setInterval(() => {
    void runAutoRotation(database, rotationDays,).catch((error,) => {
      log().error(`Auto-rotation failed: ${String(error,)}`,);
    },);
  }, intervalMs,);
}
