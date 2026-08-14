/**
 * Event Extraction — Item Transfer emission tests.
 *
 * Verifies `extractEvents` produces correct `fromActorId`/`toActorId`
 * direction for each item verb class and carries `locationId` so the
 * event application layer can resolve a source instance:
 *   - give/hand/offer/pass/trade → actor RECEIVES (fromActorId null)
 *   - take/pick up/grab/collect → actor RECEIVES (fromActorId null)
 *   - drop/leave/abandon/put down → actor is the SOURCE (fromActorId set)
 */
import { describe, expect, test, } from "bun:test";
import { WorldEventType, } from "../../db/enums-story";
import { extractEvents, } from "./extraction";

const LOC = "loc-1";
const ACTOR = "actor-1";

describe("extractEvents — item transfer direction", () => {
  test("give → actor is the source (gives away)", () => {
    const events = extractEvents({
      messageContent: "Sam gives the Iron Sword to Kara.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);
    const item = events.find((e,) => e.type === WorldEventType.ItemTransfer);
    expect(item,).toBeDefined();
    expect(item!.data.fromActorId,).toBe(ACTOR,);
    expect(item!.data.toActorId,).toBeNull();
    expect(item!.locationId,).toBe(LOC,);
  });

  test("take → actor is the receiver", () => {
    const events = extractEvents({
      messageContent: "Sam picks up the Rusty Dagger.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);
    const item = events.find((e,) => e.type === WorldEventType.ItemTransfer);
    expect(item,).toBeDefined();
    expect(item!.data.fromActorId,).toBeNull();
    expect(item!.data.toActorId,).toBe(ACTOR,);
  });

  test("drop → actor is the source", () => {
    const events = extractEvents({
      messageContent: "Sam drops the Torch and walks on.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);
    const item = events.find((e,) => e.type === WorldEventType.ItemTransfer);
    expect(item,).toBeDefined();
    expect(item!.data.fromActorId,).toBe(ACTOR,);
    expect(item!.data.toActorId,).toBeNull();
    expect(item!.locationId,).toBe(LOC,);
  });

  test("leave behind → actor is the source", () => {
    const events = extractEvents({
      messageContent: "Sam leaves behind the Shield.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);
    const item = events.find((e,) => e.type === WorldEventType.ItemTransfer);
    expect(item,).toBeDefined();
    expect(item!.data.fromActorId,).toBe(ACTOR,);
    expect(item!.data.toActorId,).toBeNull();
  });
});
