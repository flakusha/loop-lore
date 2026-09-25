// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ItemInstance, } from "./types";

/** Item effects stored in an item definition's properties.effects array. */
export type ItemEffect =
  | { kind: "stat_delta"; stat: string; amount: number }
  | { kind: "on_use"; action: string; payload: unknown }
  | { kind: "passive"; condition: string; payload: unknown };

/** Raised when an item definition contains an invalid effects payload. */
export class InvalidItemEffectsError extends Error {
  constructor(message: string,) {
    super(message,);
    this.name = "InvalidItemEffectsError";
  }
}

function isRecord(value: unknown,): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value,);
}

function isNonEmptyString(value: unknown,): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseEffect(value: unknown,): ItemEffect | null {
  if (!isRecord(value,) || typeof value.kind !== "string") { return null; }
  if (
    value.kind === "stat_delta" && isNonEmptyString(value.stat,) && typeof value.amount === "number" &&
    Number.isFinite(value.amount,)
  ) {
    return { kind: value.kind, stat: value.stat, amount: value.amount, };
  }
  if (value.kind === "on_use" && isNonEmptyString(value.action,) && "payload" in value) {
    return { kind: value.kind, action: value.action, payload: value.payload, };
  }
  if (value.kind === "passive" && isNonEmptyString(value.condition,) && "payload" in value) {
    return { kind: value.kind, condition: value.condition, payload: value.payload, };
  }
  return null;
}

/** Validate and return the effects declared by an item definition. */
export function parseItemEffects(value: unknown,): ItemEffect[] {
  if (value === undefined) { return []; }
  if (!Array.isArray(value,)) { throw new InvalidItemEffectsError("properties.effects must be an array",); }
  return value.map((effect,) => {
    const parsed = parseEffect(effect,);
    if (!parsed) { throw new InvalidItemEffectsError("properties.effects contains an invalid effect",); }
    return parsed;
  },);
}

/** Resolve effects carried by an item instance. */
export function resolveItemEffects(item: ItemInstance,): ItemEffect[] {
  return parseItemEffects(item.properties.effects,);
}
