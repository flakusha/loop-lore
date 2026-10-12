// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor-items failure set — pins each tagged error's tag, name and message
 * so the routes layer's exhaustive tag→status mapping stays honest.
 */
import { describe, expect, test, } from "bun:test";
import { TaggedError, } from "../../errors/tagged";
import {
  AffordanceDeniedError,
  InsufficientQuantityError,
  InvalidQuantityError,
  ItemNotEquipableError,
  ItemNotFoundError,
  SelfTransferError,
  SlotConflictError,
} from "./errors";

describe("actor-items tagged errors", () => {
  test("ItemNotFoundError carries the actor-item-not-found tag", () => {
    const err = new ItemNotFoundError("item-1",);
    expect(err.tag,).toBe("actor-item-not-found",);
    expect(err.name,).toBe("ItemNotFoundError",);
    expect(err.message,).toBe("Item not found: item-1",);
    expect(err,).toBeInstanceOf(TaggedError,);
    expect(err,).toBeInstanceOf(Error,);
  });

  test("ItemNotEquipableError carries the actor-item-not-equipable tag", () => {
    const err = new ItemNotEquipableError("item-2",);
    expect(err.tag,).toBe("actor-item-not-equipable",);
    expect(err.name,).toBe("ItemNotEquipableError",);
    expect(err.message,).toBe("Item cannot be equipped: item-2",);
  });

  test("SlotConflictError names the occupied slot", () => {
    const err = new SlotConflictError("armor",);
    expect(err.tag,).toBe("actor-item-slot-conflict",);
    expect(err.name,).toBe("SlotConflictError",);
    expect(err.message,).toBe("Another armor is already equipped",);
  });

  test("AffordanceDeniedError carries the denial reason", () => {
    const err = new AffordanceDeniedError("lacks equip-capability",);
    expect(err.tag,).toBe("actor-item-affordance-denied",);
    expect(err.name,).toBe("AffordanceDeniedError",);
    expect(err.message,).toBe("affordance: lacks equip-capability",);
  });

  test("SelfTransferError requires no payload", () => {
    const err = new SelfTransferError();
    expect(err.tag,).toBe("actor-item-self-transfer",);
    expect(err.name,).toBe("SelfTransferError",);
    expect(err.message,).toBe("Source and target are the same",);
  });

  test("InvalidQuantityError requires no payload", () => {
    const err = new InvalidQuantityError();
    expect(err.tag,).toBe("actor-item-invalid-quantity",);
    expect(err.name,).toBe("InvalidQuantityError",);
    expect(err.message,).toBe("Quantity must be a positive integer",);
  });

  test("InsufficientQuantityError reports the available count", () => {
    const err = new InsufficientQuantityError(3,);
    expect(err.tag,).toBe("actor-item-insufficient-quantity",);
    expect(err.name,).toBe("InsufficientQuantityError",);
    expect(err.message,).toBe("Insufficient quantity: 3",);
  });
});
