// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared key-rotation logger.
 */
import { getLogger, type Logger, } from "../../logger";

/**
 * Shared key-rotation logger.
 * @returns a child logger namespaced for the `crypto:key-rotation` module.
 */
export function log(): Logger {
  return getLogger().child({ module: "crypto:key-rotation", },);
}
