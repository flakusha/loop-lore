// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Lore-entry 084 field handling shared by the world and actor lore entity
 * routes: value transforms for the create/update pipeline and a write guard
 * that rejects invalid reveal-condition JSON server-side (the lorebook UI
 * relies on this for validation feedback).
 *
 * Column semantics (084_lore_reveal_condition_timeline_rarity):
 *   - reveal_condition: JSON text; NULL/blank = not secret. Evaluated by
 *     `src/assistant/lore/reveal-condition.ts` at prompt time — fail closed.
 *   - timeline_id: nullable timeline slug; NULL = every timeline.
 *   - rarity: canonical ItemRarity tier; unknown input falls back to
 *     'common' (rarity-weight treats unknown tiers as weight 1).
 */
import { parseRevealCondition, } from "../assistant/lore/reveal-condition";
import { ItemRarity, } from "../db/enums";
import { jsonStringifyOr, } from "../utils";
import { HttpStatus, type HttpStatusCode, } from "./http-utils";

/**
 * Normalize a `revealCondition` API value to the stored JSON text.
 * Strings pass through untouched (never double-encoded); objects and other
 * JSON values are serialized.
 * @param value - API input (string or object form).
 * @returns The value to persist in `reveal_condition`.
 */
export function revealConditionValue(value: unknown,): unknown {
  return typeof value === "string" ? value : jsonStringifyOr(value,);
}

/**
 * Normalize a `rarity` API value to the canonical ItemRarity scale.
 * @param value - API input.
 * @returns The recognized tier, or 'common' for unknown/null-ish input.
 */
export function rarityValue(value: unknown,): unknown {
  return Object.values(ItemRarity,).some((r,) => r === value) ? value : ItemRarity.Common;
}

/** Result of {@link validateRevealConditionWrite} (EntityConfig writeGuard shape). */
export type RevealConditionWriteResult =
  | { ok: true }
  | { ok: false; status: HttpStatusCode; message: string };

/**
 * Validate a lore-entry write body's `revealCondition` server-side.
 * Accepts the same string/object forms as {@link revealConditionValue} and
 * rejects values that do not parse into a valid reveal-condition tree —
 * the lore section fails closed on such rows, so a typo would silently
 * hide the secret forever.
 * @param body - create/update body (may omit revealCondition).
 * @returns ok, or a 400-ready rejection naming the field.
 */
export function validateRevealConditionWrite(body: Record<string, unknown>,): RevealConditionWriteResult {
  const raw = body["revealCondition"];
  if (raw == null) { return { ok: true, }; }
  const normalized = revealConditionValue(raw,);
  if (typeof normalized !== "string") {
    return { ok: false, status: HttpStatus.BadRequest, message: "revealCondition must be a JSON object or string", };
  }

  if (parseRevealCondition(normalized,) !== null) { return { ok: true, }; }
  return {
    ok: false,
    status: HttpStatus.BadRequest,
    message: "revealCondition is not valid reveal-condition JSON (keywords/event/all/any)",
  };
}
