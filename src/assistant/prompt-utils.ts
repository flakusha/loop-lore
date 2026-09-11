// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 20

import { jsonParseOr, } from "../utils/safe-json";

/**
 * @param raw
 * @param fallback
 * @returns string
 */
export function parseJsonOr<T,>(raw: string | null | undefined, fallback: T,): T {
  if (!raw) { return fallback; }
  return jsonParseOr<T>(raw, fallback,);
}
