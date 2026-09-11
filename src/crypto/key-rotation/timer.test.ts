// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the key auto-rotation timer lifecycle. */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { startAutoRotationTimer, } from "./timer";

createLogger({ level: "error", },);

let db: Kysely<DB>;

beforeAll(async () => {
  db = (await createTestDb()).db;
},);

afterAll(async () => {
  await db.destroy();
},);

describe("startAutoRotationTimer", () => {
  test("returns null when rotation is disabled", () => {
    expect(startAutoRotationTimer(db, 0,),).toBeNull();
    expect(startAutoRotationTimer(db, -1,),).toBeNull();
  });

  test("starts a timer that fires immediately and periodically", async () => {
    const timer = startAutoRotationTimer(db, 30, 20,);
    expect(timer,).not.toBeNull();
    // Encryption is off in tests, so runs no-op; let one interval tick fire.
    await Bun.sleep(60,);
    clearInterval(timer!,);
  });
});
