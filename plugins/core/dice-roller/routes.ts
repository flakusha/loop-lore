// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Dice Routes — POST /api/dice/roll
 *
 * Core game mechanic imported by plugin.ts as the apiRoutes handler.
 * Also exposes helpers for frontend/chat text-command detection.
 */

import { rollDice, parseTextCommand } from "./engine";
import { jsonResponse, jsonError, HttpStatus } from "../../../src/routes/http-utils";
import type { DiceRollResult, DiceError } from "./types";

// ── Route handler (called by plugin dispatcher) ──────────────

/**
 * Handle POST /api/dice/roll
 *
 * Body: { expression: string }  |  { text: string }
 *
 * Returns parsed roll result or error.
 */
export async function handleRoll(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/dice/roll" || request.method !== "POST") return null;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", HttpStatus.BadRequest);
  }

  const input = body as Record<string, unknown>;

  // Direct expression roll: { expression: "2d6+3" }
  if (typeof input.expression === "string" && input.expression.trim()) {
    const result = rollDice(input.expression.trim());
    if ("error" in result) {
      return jsonError((result as DiceError).error, HttpStatus.BadRequest);
    }
    return jsonResponse(result satisfies DiceRollResult);
  }

  // Text command detect: { text: "/roll 2d6+3" }
  if (typeof input.text === "string" && input.text.trim()) {
    const cmd = parseTextCommand(input.text.trim());
    if (!cmd.matched || !cmd.expression) {
      return jsonError("No /roll command found in text", HttpStatus.BadRequest);
    }
    const result = rollDice(cmd.expression);
    if ("error" in result) {
      return jsonError((result as DiceError).error, HttpStatus.BadRequest);
    }
    return jsonResponse({
      ...(result satisfies DiceRollResult),
      commandText: cmd.fullMatch,
    });
  }

  return jsonError(
    'Provide either "expression" (e.g. "2d6+3") or "text" (e.g. "/roll 2d6+3")',
    HttpStatus.BadRequest,
  );
}

// ── Exported helpers for chat/frontend use ────────────────────

export { isRollCommand, parseTextCommand } from "./engine";