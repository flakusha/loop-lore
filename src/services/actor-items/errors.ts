// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor-items failure set — the tagged errors the gameplay service throws
 * for expected business denials. The routes layer maps each tag to an HTTP
 * status in `src/routes/actor-items/service.ts` through an exhaustive
 * mapped-type record: adding a variant without a status entry fails to
 * compile.
 */
import { TaggedError, } from "../../errors/tagged";
import type { EquipSlot, } from "./equip";

/** Referenced item row does not exist for the actor. */
export class ItemNotFoundError extends TaggedError<"actor-item-not-found"> {
  readonly tag = "actor-item-not-found" as const;

  /** @param itemId */
  constructor(itemId: string,) {
    super(`Item not found: ${itemId}`,);
  }
}

/** Item's category has no equip slot (e.g. misc loot cannot be equipped). */
export class ItemNotEquipableError extends TaggedError<"actor-item-not-equipable"> {
  readonly tag = "actor-item-not-equipable" as const;

  /** @param itemId */
  constructor(itemId: string,) {
    super(`Item cannot be equipped: ${itemId}`,);
  }
}

/** Another item already occupies the slot the category maps to. */
export class SlotConflictError extends TaggedError<"actor-item-slot-conflict"> {
  readonly tag = "actor-item-slot-conflict" as const;

  /**
   * @param slot
   */
  constructor(slot: EquipSlot,) {
    super(`Another ${slot} is already equipped`,);
  }
}

/** Affordance context denies the equip (actor lacks a capability). */
export class AffordanceDeniedError extends TaggedError<"actor-item-affordance-denied"> {
  readonly tag = "actor-item-affordance-denied" as const;

  /**
   * @param denial
   */
  constructor(denial: string,) {
    super(`affordance: ${denial}`,);
  }
}

/** Source and target actor are the same row. */
export class SelfTransferError extends TaggedError<"actor-item-self-transfer"> {
  readonly tag = "actor-item-self-transfer" as const;

  constructor() {
    super("Source and target are the same",);
  }
}

/** Transfer quantity is not a positive integer. */
export class InvalidQuantityError extends TaggedError<"actor-item-invalid-quantity"> {
  readonly tag = "actor-item-invalid-quantity" as const;

  constructor() {
    super("Quantity must be a positive integer",);
  }
}

/** Source item missing, or holds less than the requested quantity. */
export class InsufficientQuantityError extends TaggedError<"actor-item-insufficient-quantity"> {
  readonly tag = "actor-item-insufficient-quantity" as const;

  /**
   * @param available
   */
  constructor(available: number,) {
    super(`Insufficient quantity: ${available}`,);
  }
}

/** Every expected failure the actor-items gameplay service can surface. */
export type ActorItemError =
  | ItemNotFoundError
  | ItemNotEquipableError
  | SlotConflictError
  | AffordanceDeniedError
  | SelfTransferError
  | InvalidQuantityError
  | InsufficientQuantityError;
