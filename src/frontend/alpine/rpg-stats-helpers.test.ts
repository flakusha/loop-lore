// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Direct unit tests for the rpg-stats-helpers.ts exports.
 *
 * rpg-stats.test.ts covers these indirectly through the component path;
 * this file pins each export directly (happy path + one malformed edge).
 *
 * Mirrors rpg-stats.test.ts: mocks `./htmx` apiFetch under the ISOLATED
 * gate — the static import pins the module registry, so this suite must
 * not run in a shared process.
 */
import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import {
  defaultEquipmentSlots,
  defaultRpgStats,
  loadEquipmentSlots,
  parseStatusEffects,
  readAsiError,
  readServerError,
  resolveChatActorId,
  slotForEquippedType,
} from "./rpg-stats-helpers";

let fetchHandler: ((url: string,) => Response | Promise<Response>) | null = null;

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string,) => {
      if (!fetchHandler) { return new Response("[]", { status: 200, },); }
      return fetchHandler(url,);
    },
  }),);
}

afterEach(() => {
  fetchHandler = null;
},);

describeOrSkip("defaultRpgStats", () => {
  test("returns level-1 defaults with 10s across abilities", () => {
    expect(defaultRpgStats(),).toEqual({
      level: 1,
      hp: 12,
      maxHp: 12,
      mp: 8,
      maxMp: 8,
      ac: 12,
      initiative: 0,
      xp: 0,
      xpToNext: 100,
      pendingAsi: 0,
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
    },);
  });

  test("returns a fresh object per call", () => {
    const first = defaultRpgStats() as Record<string, number>;
    first.str = 18;
    expect(defaultRpgStats().str,).toBe(10,);
  });
},);

describeOrSkip("defaultEquipmentSlots", () => {
  test("returns the 8 empty slots in display order", () => {
    const slots = defaultEquipmentSlots();
    expect(slots.map((s,) => s.slot),).toEqual(
      ["head", "chest", "legs", "feet", "hands", "weapon", "shield", "accessory",],
    );

    expect(slots.every((s,) => s.itemId === null),).toBe(true,);
  });

  test("returns a fresh array per call", () => {
    const first = defaultEquipmentSlots();
    first.find((s,) => s.slot === "head")!.itemId = "helm-1";
    expect(defaultEquipmentSlots().find((s,) => s.slot === "head")?.itemId,).toBeNull();
  });
},);

describeOrSkip("readAsiError", () => {
  test("reads the server error message", async () => {
    const res = Response.json({ error: "Not enough points", }, { status: 400, },);
    expect(await readAsiError(res, "fallback",),).toBe("Not enough points",);
  });

  test("falls back on empty, unparseable, or non-string bodies", async () => {
    expect(await readAsiError(new Response("", { status: 400, },), "fallback",),).toBe("fallback",);
    expect(await readAsiError(new Response("not json", { status: 400, },), "fallback",),).toBe("fallback",);
    expect(await readAsiError(Response.json({ error: 42, }, { status: 400, },), "fallback",),).toBe("fallback",);
  });
},);

describeOrSkip("readServerError", () => {
  test("reads the server error message", async () => {
    const res = Response.json({ error: "Duplicate discipline", }, { status: 400, },);
    expect(await readServerError(res, "fallback",),).toBe("Duplicate discipline",);
  });

  test("falls back on empty, unparseable, or non-string bodies", async () => {
    expect(await readServerError(new Response("", { status: 400, },), "fallback",),).toBe("fallback",);
    expect(await readServerError(new Response("not json", { status: 400, },), "fallback",),).toBe("fallback",);
    expect(await readServerError(Response.json({ error: 42, }, { status: 400, },), "fallback",),).toBe("fallback",);
  });
},);

describeOrSkip("resolveChatActorId", () => {
  test("returns null without a chat", async () => {
    expect(await resolveChatActorId(null,),).toBeNull();
  });

  test("resolves character_id from the chat lookup", async () => {
    fetchHandler = (url,) =>
      url === "/api/v1/chats/chat-1"
        ? Response.json({ character_id: "actor-1", },)
        : new Response("nope", { status: 404, },);

    expect(await resolveChatActorId("chat-1",),).toBe("actor-1",);
  });

  test("returns null on non-ok, missing id, or transport failure", async () => {
    fetchHandler = () => new Response("nope", { status: 404, },);
    expect(await resolveChatActorId("chat-1",),).toBeNull();

    fetchHandler = () => Response.json({},);
    expect(await resolveChatActorId("chat-1",),).toBeNull();

    fetchHandler = () => {
      throw new Error("offline",);
    };

    expect(await resolveChatActorId("chat-1",),).toBeNull();
  });
},);

describeOrSkip("parseStatusEffects", () => {
  test("maps conditions and buff/debuff effects to badges", () => {
    const out = parseStatusEffects(
      JSON.stringify([{ name: "Poisoned", source: "trap", duration_rounds: 3, },],),
      JSON.stringify([
        { name: "Rage", type: "buff", source: "spell", duration_rounds: 5, stat_modifier: { str: 2, }, },
      ],),
    );

    expect(out,).toEqual([
      { id: "poisoned", name: "Poisoned", description: "Source: trap", duration: 3, modifier: {}, },
      {
        id: "buff_rage",
        name: "⬆ Rage",
        description: "Source: spell",
        duration: 5,
        modifier: { str: 2, },
      },
    ],);
  });

  test("skips malformed input and non-buff/debuff entries", () => {
    expect(parseStatusEffects("garbage", "also garbage",),).toEqual([],);
    expect(parseStatusEffects("", "",),).toEqual([],);
    const out = parseStatusEffects(
      JSON.stringify([{ source: "x", }, { name: "", },],),
      JSON.stringify([
        { name: "Aura", type: "aura", },
        { name: "", type: "buff", },
        { name: "Hex", type: "debuff", stat_modifier: { str: "big", }, },
      ],),
    );

    expect(out,).toEqual([
      { id: "debuff_hex", name: "⬇ Hex", description: "debuff", duration: -1, modifier: {}, },
    ],);
  });
},);

describeOrSkip("loadEquipmentSlots", () => {
  test("fills slots from an equipped-rows array", async () => {
    fetchHandler = () =>
      Response.json([
        { id: "sword-1", name: "Shortsword", item_type: "weapon", },
        { id: "plate-1", name: "Plate", item_type: "armor", },
      ],);

    const slots = await loadEquipmentSlots("actor-1",);
    expect(slots.find((s,) => s.slot === "weapon"),).toMatchObject({ itemId: "sword-1", itemName: "Shortsword", },);
    expect(slots.find((s,) => s.slot === "chest")?.itemId,).toBe("plate-1",);
    expect(slots.find((s,) => s.slot === "head")?.itemId,).toBeNull();
  });

  test("accepts the { data: rows } envelope", async () => {
    fetchHandler = () => Response.json({ data: [{ id: "cap-1", item_type: "helmet", },], },);
    const slots = await loadEquipmentSlots("actor-1",);
    expect(slots.find((s,) => s.slot === "head")?.itemId,).toBe("cap-1",);
  });

  test("keeps defaults on transport failure, non-ok, or malformed rows", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };

    expect(await loadEquipmentSlots("actor-1",),).toEqual(defaultEquipmentSlots(),);

    fetchHandler = () => new Response("oops", { status: 500, },);
    expect(await loadEquipmentSlots("actor-1",),).toEqual(defaultEquipmentSlots(),);

    fetchHandler = () =>
      Response.json(
        [{ id: "", item_type: "weapon", }, { item_type: "weapon", }, { id: "x", item_type: "mystery", }, null,],
      );

    expect(await loadEquipmentSlots("actor-1",),).toEqual(defaultEquipmentSlots(),);
  });
},);

describeOrSkip("slotForEquippedType", () => {
  test("maps known types to display slots", () => {
    expect(slotForEquippedType("weapon",),).toBe("weapon",);
    expect(slotForEquippedType("armor",),).toBe("chest",);
    expect(slotForEquippedType("shield",),).toBe("shield",);
    expect(slotForEquippedType("helmet",),).toBe("head",);
    expect(slotForEquippedType("boots",),).toBe("feet",);
    expect(slotForEquippedType("gloves",),).toBe("hands",);
    expect(slotForEquippedType("legs",),).toBe("legs",);
    expect(slotForEquippedType("accessory",),).toBe("accessory",);
    expect(slotForEquippedType("consumable",),).toBe("accessory",);
  });

  test("returns null for unknown, empty, or miscased types", () => {
    expect(slotForEquippedType("mystery-box",),).toBeNull();
    expect(slotForEquippedType("",),).toBeNull();
    expect(slotForEquippedType("Weapon",),).toBeNull();
  });
},);
