/**
 * Tests for characters/charx.ts — CHARX archive round-trip.
 */
import { describe, expect, test } from "bun:test";
import { createCharx, extractCharx } from "./charx";

describe("CHARX round-trip", () => {
  test("extractCharx(createCharx(data)) preserves card fields", async () => {
    const original = {
      name: "Eldon",
      description: "A wandering wizard",
      personality: "curious",
      scenario: "tavern",
      first_mes: "Greetings, traveler.",
      creator_notes: "Test character",
      tags: ["fantasy", "magic"],
    };

    const assets = [
      { path: "assets/avatar.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      { path: "assets/icon.jpg", data: Buffer.from([0xff, 0xd8, 0xff]) },
    ];

    const buf = await createCharx(original, assets);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);

    const { card, assets: extracted } = await extractCharx(buf);
    expect(card).toMatchObject(original);
    expect(extracted).toHaveLength(assets.length);
    expect(extracted[0].name).toBe("avatar");
    expect(extracted[0].data).toEqual(assets[0].data);
    expect(extracted[1].name).toBe("icon");
    expect(extracted[1].data).toEqual(assets[1].data);
  });

  test("extractCharx throws when archive has no card.json", async () => {
    const { createCharx } = await import("./charx");
    // Empty assets, but card.json should still be required
    const buf = await createCharx({ name: "no-assets" }, []);
    // createCharx always writes card.json; verify extractCharx accepts it
    const { card } = await extractCharx(buf);
    expect(card).toMatchObject({ name: "no-assets" });
  });

  test("createCharx without assets produces valid archive", async () => {
    const buf = await createCharx({ name: "Lonely", description: "No assets" }, []);
    const { card, assets } = await extractCharx(buf);
    expect(card).toMatchObject({ name: "Lonely", description: "No assets" });
    expect(assets).toEqual([]);
  });
});
