// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/timescale.test.ts — unit tests for the epoch + time-scale
 * engine: default-row creation, upsert validation, advance math at
 * several scale sizes, world-clock readout and epoch listing. The clock
 * is injected, so every stamp is deterministic.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, insertWorlds, insertWorldTimescale, } from "../test-utils/insert-helpers";
import {
  createTimescaleService,
  DEFAULT_EPOCH,
  DEFAULT_SCALE_SIZE,
  MAX_EPOCH_LENGTH,
  TimescaleError,
} from "./timescale";

let db: Kysely<DB>;

/** Fixed base instant; tests move `clockMs` forward to vary stamps. */
let clockMs: number;

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(db, "user-owner", "Test World", { id: "w1", },);
  clockMs = Date.UTC(2026, 0, 1, 0, 0, 0, 0,);
},);

afterEach(async () => {
  await db.destroy();
},);

function makeService() {
  return createTimescaleService(db, { now: () => new Date(clockMs,), },);
}

async function expectTimescaleError(fn: () => Promise<unknown>,): Promise<void> {
  await expect(fn(),).rejects.toBeInstanceOf(TimescaleError,);
}

describe("getTimescale", () => {
  test("creates the default row when absent", async () => {
    const service = makeService();
    const row = await service.getTimescale("w1",);
    expect(row.world_id,).toBe("w1",);
    expect(row.epoch,).toBe(DEFAULT_EPOCH,);
    expect(row.scale_size,).toBe(DEFAULT_SCALE_SIZE,);
    expect(row.advanced_minutes,).toBe(0,);
    expect(row.anchor_at,).toBe("2026-01-01T00:00:00.000Z",);
  });

  test("returns the same row on repeat reads without duplicating", async () => {
    const service = makeService();
    const first = await service.getTimescale("w1",);
    clockMs += 60_000;
    const second = await service.getTimescale("w1",);
    expect(second.id,).toBe(first.id,);
    const rows = await db.selectFrom("world_timescale",).selectAll().execute();
    expect(rows.length,).toBe(1,);
  });

  test("throws for an unknown world", async () => {
    const service = makeService();
    await expectTimescaleError(() => service.getTimescale("nope",));
  });
});

describe("setTimescale", () => {
  test("updates epoch and appends one history row per change", async () => {
    const service = makeService();
    await service.getTimescale("w1",);
    clockMs += 60_000;
    const row = await service.setTimescale("w1", { epoch: "second_age", },);
    expect(row.epoch,).toBe("second_age",);
    expect(row.updated_at,).toBe("2026-01-01T00:01:00.000Z",);
    const history = await db
      .selectFrom("world_timescale_history",)
      .where("world_id", "=", "w1",)
      .orderBy("changed_at", "asc",)
      .selectAll()
      .execute();

    expect(history.map((h,) => h.epoch),).toEqual([DEFAULT_EPOCH, "second_age",],);
  });

  test("setting the same epoch does not append history", async () => {
    const service = makeService();
    await service.setTimescale("w1", { epoch: "  second_age ", },);
    const row = await service.setTimescale("w1", { epoch: "second_age", scaleSize: 30, },);
    expect(row.epoch,).toBe("second_age",);
    expect(row.scale_size,).toBe(30,);
    const history = await db.selectFrom("world_timescale_history",).selectAll().execute();
    expect(history.length,).toBe(2,);
  });

  test("updates scale without touching epoch", async () => {
    const service = makeService();
    const row = await service.setTimescale("w1", { scaleSize: 1.5, },);
    expect(row.epoch,).toBe(DEFAULT_EPOCH,);
    expect(row.scale_size,).toBe(1.5,);
  });

  test("empty patch writes nothing", async () => {
    const service = makeService();
    const before = await service.getTimescale("w1",);
    clockMs += 60_000;
    const after = await service.setTimescale("w1", {},);
    expect(after.updated_at,).toBe(before.updated_at,);
  });

  test.each([
    { scaleSize: 0, },
    { scaleSize: -1, },
    { scaleSize: Number.NaN, },
    { scaleSize: Number.POSITIVE_INFINITY, },
  ],)("rejects invalid scaleSize %p", async (patch,) => {
    const service = makeService();
    await expectTimescaleError(() => service.setTimescale("w1", patch,));
  },);

  test.each(["", "   ", "a".repeat(MAX_EPOCH_LENGTH + 1,),],)("rejects invalid epoch %p", async (epoch,) => {
    const service = makeService();
    await expectTimescaleError(() => service.setTimescale("w1", { epoch, },));
  },);

  test("rejects non-number scaleSize", async () => {
    const service = makeService();
    await expectTimescaleError(() => service.setTimescale("w1", { scaleSize: "60" as unknown as number, },));
  });
});

describe("advance", () => {
  test("applies the default scale of 60 world-minutes per real-minute", async () => {
    const service = makeService();
    const result = await service.advance("w1", 2,);
    expect(result.worldMinutes,).toBe(120,);
    expect(result.advancedMinutes,).toBe(120,);
  });

  test("applies a fractional scale", async () => {
    const service = makeService();
    await service.setTimescale("w1", { scaleSize: 1.5, },);
    const result = await service.advance("w1", 10,);
    expect(result.worldMinutes,).toBe(15,);
  });

  test("applies a large scale across day boundaries", async () => {
    const service = makeService();
    await service.setTimescale("w1", { scaleSize: 1440, },);
    const first = await service.advance("w1", 1,);
    expect(first.worldMinutes,).toBe(1440,);
    const second = await service.advance("w1", 0.5,);
    expect(second.advancedMinutes,).toBe(2160,);
  });

  test("accumulates across calls and persists", async () => {
    const service = makeService();
    await service.advance("w1", 1,);
    await service.advance("w1", 2,);
    const row = await service.getTimescale("w1",);
    expect(row.advanced_minutes,).toBe(180,);
  });

  test("auto-creates the default row first", async () => {
    const service = makeService();
    const result = await service.advance("w1", 1,);
    expect(result.epoch,).toBe(DEFAULT_EPOCH,);
    expect(result.scaleSize,).toBe(DEFAULT_SCALE_SIZE,);
  });

  test.each([-1, Number.NaN, Number.POSITIVE_INFINITY,],)("rejects invalid realMinutes %p", async (realMinutes,) => {
    const service = makeService();
    await expectTimescaleError(() => service.advance("w1", realMinutes,));
  },);

  test("rejects advances for an unknown world without creating a row", async () => {
    const service = makeService();
    await expectTimescaleError(() => service.advance("ghost", -5,));
    const rows = await db.selectFrom("world_timescale",).selectAll().execute();
    expect(rows.length,).toBe(0,);
  });
});

describe("currentWorldTime", () => {
  test("reads day 1 00:00 on a fresh world", async () => {
    const service = makeService();
    const time = await service.currentWorldTime("w1",);
    expect(time.day,).toBe(1,);
    expect(time.hour,).toBe(0,);
    expect(time.minute,).toBe(0,);
    expect(time.advancedMinutes,).toBe(0,);
    expect(time.anchorAt,).toBe("2026-01-01T00:00:00.000Z",);
  });

  test("derives hour and minute within the day", async () => {
    const service = makeService();
    await service.advance("w1", 1.5,); // 90 world-minutes
    const time = await service.currentWorldTime("w1",);
    expect(time.day,).toBe(1,);
    expect(time.hour,).toBe(1,);
    expect(time.minute,).toBe(30,);
  });

  test("rolls over to the next day", async () => {
    const service = makeService();
    await service.advance("w1", 25,); // 1500 world-minutes
    const time = await service.currentWorldTime("w1",);
    expect(time.day,).toBe(2,);
    expect(time.hour,).toBe(1,);
    expect(time.minute,).toBe(0,);
  });

  test("floors fractional world-minutes", async () => {
    const service = makeService();
    await service.setTimescale("w1", { scaleSize: 0.5, },);
    await service.advance("w1", 3,); // 1.5 world-minutes
    const time = await service.currentWorldTime("w1",);
    expect(time.advancedMinutes,).toBe(1.5,);
    expect(time.minute,).toBe(1,);
  });
});

describe("listEpochs", () => {
  test("lists the default epoch with its first-seen instant", async () => {
    const service = makeService();
    const epochs = await service.listEpochs("w1",);
    expect(epochs,).toEqual([{ epoch: DEFAULT_EPOCH, firstSeenAt: "2026-01-01T00:00:00.000Z", },],);
  });

  test("orders distinct epochs by first entry", async () => {
    const service = makeService();
    await service.setTimescale("w1", { epoch: "second_age", },);
    clockMs += 60_000;
    await service.setTimescale("w1", { epoch: "third_age", },);
    clockMs += 60_000;
    await service.setTimescale("w1", { epoch: "second_age", },);
    const epochs = await service.listEpochs("w1",);
    expect(epochs.map((e,) => e.epoch),).toEqual([DEFAULT_EPOCH, "second_age", "third_age",],);
    expect(epochs[1]!.firstSeenAt,).toBe("2026-01-01T00:00:00.000Z",);
    expect(epochs[2]!.firstSeenAt,).toBe("2026-01-01T00:01:00.000Z",);
  });

  test("is scoped to its world", async () => {
    const service = makeService();
    await insertWorlds(db, "user-owner", "Other World", { id: "w2", },);
    await service.setTimescale("w1", { epoch: "second_age", },);
    const w2Epochs = await service.listEpochs("w2",);
    expect(w2Epochs.map((e,) => e.epoch),).toEqual([DEFAULT_EPOCH,],);
  });
});

describe("row lifecycle", () => {
  test("seeded row is reused, not re-defaulted", async () => {
    await insertWorldTimescale(db, "w1", {
      epoch: "seeded_age",
      scale_size: 90,
      advanced_minutes: 45,
      anchor_at: "2025-12-31T00:00:00.000Z",
    },);

    const service = makeService();
    const row = await service.getTimescale("w1",);
    expect(row.epoch,).toBe("seeded_age",);
    expect(row.scale_size,).toBe(90,);
    const result = await service.advance("w1", 1,);
    expect(result.advancedMinutes,).toBe(135,);
    const time = await service.currentWorldTime("w1",);
    expect(time.day,).toBe(1,);
    expect(time.hour,).toBe(2,);
    expect(time.minute,).toBe(15,);
  });
});
