// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import type { Config, } from "../../config/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { resolveEffectiveNaming, } from "../download-resolution";
import { getDownloadNaming, setDownloadNaming, } from "./download-preferences";

describe("download preferences", () => {
  test("unset reads null (follow the admin default)", async () => {
    const { db, } = await createTestDb();
    try {
      expect(await getDownloadNaming(db, randomUUID(),),).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  test("set stores the override and null clears it", async () => {
    const { db, } = await createTestDb();
    try {
      const userId = randomUUID();
      expect(await setDownloadNaming(db, userId, "hash",),).toBe("hash",);
      expect(await getDownloadNaming(db, userId,),).toBe("hash",);
      expect(await setDownloadNaming(db, userId, "datetime",),).toBe("datetime",);
      expect(await getDownloadNaming(db, userId,),).toBe("datetime",);
      expect(await setDownloadNaming(db, userId, null,),).toBeNull();
      expect(await getDownloadNaming(db, userId,),).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  test("resolveEffectiveNaming prefers the stored override over the admin default", async () => {
    const { db, } = await createTestDb();
    try {
      const userId = randomUUID();
      const config = { assets: { downloadNaming: "datetime", }, } as Config;
      expect(await resolveEffectiveNaming({ database: db, config, userId, },),).toBe("datetime",);
      await setDownloadNaming(db, userId, "hash",);
      expect(await resolveEffectiveNaming({ database: db, config, userId, },),).toBe("hash",);
    } finally {
      await db.destroy();
    }
  });

  test("one user's override never leaks to another", async () => {
    const { db, } = await createTestDb();
    try {
      await setDownloadNaming(db, randomUUID(), "hash",);
      expect(await getDownloadNaming(db, randomUUID(),),).toBeNull();
    } finally {
      await db.destroy();
    }
  });
});
