// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── SSE Parser ────────────────────────────────────────────

import { safeJsonParse, } from "../../../utils";

export function parseSSELine(line: string,): Record<string, string> | null {
  if (!line.startsWith("data: ",)) { return null; }
  const payload = line.slice(6,).trim();
  if (payload === "[DONE]") { return { _done: "true", }; }
  const parsed = safeJsonParse<Record<string, string>>(payload,);
  return parsed.ok ? parsed.value : null;
}
