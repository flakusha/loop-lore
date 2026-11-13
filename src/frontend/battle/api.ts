// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle panel HTTP client — the web surface's consumer of the shipped
 * `/api/battle/*` endpoints (epic-frontend-backend-integration: the battle
 * domain previously had no frontend consumer).
 *
 * The panel's authoritative state changes still ride the chat slash-command
 * path (`/attack`, `/heal`, `/battle ...`); these calls resolve the
 * deterministic rolls the panel previews immediately, from the shipped
 * stateless calculators.
 */
import { jsonBody, } from "../alpine/json.js";
import { log as rootLog, } from "../alpine/logger.js";
import { feFetch, } from "../fe-fetch.js";

const log = rootLog.child({ module: "battle-api", },);

/**
 * Same request path the Alpine layer uses (`apiFetch` is a thin logging
 * wrapper around `feFetch`); importing `../alpine/htmx.js` directly would
 * pull its page-global listeners into the backend typecheck program.
 */
function battleApiFetch(url: string, init: RequestInit,): Promise<Response> {
  return feFetch(url, init,);
}

/** A resolved attack roll, as the panel displays it. */
export interface AttackRollPreview {
  /** Natural d20 face the roll was kept with. */
  natural: number;
  /** Roll total after the attack bonus. */
  total: number;
  /** Armor class the roll was compared against. */
  targetAC: number;
  hit: boolean;
  criticalHit: boolean;
  criticalMiss: boolean;
  /** Outcome bucket for i18n ("success" | "failure"). */
  outcome: "success" | "failure";
}

/**
 * Parse a `/api/battle/resolution/attack` response body into a preview.
 * @param payload - The response JSON (the result is spread at the top level)
 * @param targetAC - The AC the roll was requested against
 * @returns The parsed preview, or null when the payload is not usable
 */
export function parseAttackPreview(payload: unknown, targetAC: number,): AttackRollPreview | null {
  if (!payload || typeof payload !== "object") { return null; }
  const v = payload as Record<string, unknown>;
  const roll = v.roll;
  if (!roll || typeof roll !== "object") { return null; }
  const r = roll as Record<string, unknown>;
  if (typeof r.total !== "number" || !Array.isArray(r.results,)) { return null; }
  const keptIdx = typeof r.keptIdx === "number" ? r.keptIdx : 0;
  const natural = r.results[keptIdx];
  if (typeof natural !== "number") { return null; }
  if (typeof v.hit !== "boolean") { return null; }

  return {
    natural,
    total: r.total,
    targetAC,
    hit: v.hit,
    criticalHit: v.criticalHit === true,
    criticalMiss: v.criticalMiss === true,
    outcome: v.hit ? "success" : "failure",
  };
}

/**
 * Resolve an attack roll through `POST /api/battle/resolution/attack`.
 * @param input - The acting combatant's attack bonus and the target's AC
 * @returns The parsed preview, or null when the endpoint fails (the
 *          authoritative roll still arrives via the chat command path)
 */
export async function fetchAttackRollPreview(
  input: { attackBonus: number; targetAC: number },
): Promise<AttackRollPreview | null> {
  try {
    const res = await battleApiFetch("/api/battle/resolution/attack", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({ attackBonus: input.attackBonus, targetAC: input.targetAC, },),
    },);

    if (!res.ok) {
      log.warn("Attack preview request failed", { status: res.status, },);
      return null;
    }

    return parseAttackPreview(await res.json(), input.targetAC,);
  } catch (error) {
    log.warn("Attack preview request errored", { error: String(error,), },);
    return null;
  }
}
