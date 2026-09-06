/**
 * Collection Quest Calculator Tests
 *
 * Pins item-match progress math.
 */
import { describe, expect, it, } from "bun:test";
import { calculateCollectionProgress, } from "./collection.js";

const CTX = { progress: 0, target: 100, } as never;

describe("calculateCollectionProgress", () => {
  it("returns 0 without config or for wrong event type", () => {
    expect(calculateCollectionProgress(CTX, null, { type: "combat", data: {}, } as never,),).toBe(0,);
    expect(
      calculateCollectionProgress(
        CTX,
        { type: "collection", sources: [], } as never,
        { type: "combat", data: {}, } as never,
      ),
    ).toBe(0,);
  });
  it("splits 100 across total quantity on item match", () => {
    const config = { type: "collection", sources: [], items: [{ itemId: "iron", quantity: 4, },], } as never;
    const event = { type: "item_transfer", data: { itemName: "Iron Ingot", }, } as never;
    expect(calculateCollectionProgress(CTX, config, event,),).toBe(25,);
  });
  it("returns 0 when the item does not match", () => {
    const config = { type: "collection", sources: [], items: [{ itemId: "iron", quantity: 4, },], } as never;
    const event = { type: "item_transfer", data: { itemName: "Oak Log", }, } as never;
    expect(calculateCollectionProgress(CTX, config, event,),).toBe(0,);
  });
  it("falls back to category quantity", () => {
    const config = { type: "collection", sources: [], categoryQuantity: 5, } as never;
    const event = { type: "item_transfer", data: {}, } as never;
    expect(calculateCollectionProgress(CTX, config, event,),).toBe(20,);
  });
});
