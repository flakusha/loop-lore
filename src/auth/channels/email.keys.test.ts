// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * MFA email config-key tests — the exported key constants are the actual
 * storage keys, and corrupt stored values reset to the defaults.
 */

import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { getConfigValue, setConfig, } from "../../admin/config";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  MFA_EMAIL_DEFAULT_SENDER,
  MFA_EMAIL_DEFAULT_WINDOW_MS,
  MFA_EMAIL_RATE_LIMIT_WINDOW_MS_KEY,
  MFA_EMAIL_SENDER_KEY,
  readMfaEmailSender,
  readMfaEmailWindowMs,
} from "./email";

let fixture: TestDb | undefined;
let db: Kysely<DB>;

async function freshDb(): Promise<void> {
  fixture = await createTestDb();
  db = fixture.db;
}

async function teardown(): Promise<void> {
  if (fixture) {
    await destroyTestDb(fixture,);
    fixture = undefined;
  }
}

describe("MFA email config keys", () => {
  test("stored values under the exported keys drive the readers", async () => {
    await freshDb();
    try {
      await setConfig(db, MFA_EMAIL_SENDER_KEY, "mfa@example.com",);
      await setConfig(db, MFA_EMAIL_RATE_LIMIT_WINDOW_MS_KEY, "15000",);

      await expect(readMfaEmailSender({ database: db, },),).resolves.toBe("mfa@example.com",);
      await expect(readMfaEmailWindowMs({ database: db, },),).resolves.toBe(15_000,);
      await expect(getConfigValue(db, MFA_EMAIL_SENDER_KEY,),).resolves.toBe("mfa@example.com",);
    } finally {
      await teardown();
    }
  });

  test("blank sender and corrupt window reset to the defaults", async () => {
    await freshDb();
    try {
      await setConfig(db, MFA_EMAIL_SENDER_KEY, "   ",);
      await expect(readMfaEmailSender({ database: db, },),).resolves.toBe(MFA_EMAIL_DEFAULT_SENDER,);

      for (const corrupt of ["garbage", "-5", "0",]) {
        await setConfig(db, MFA_EMAIL_RATE_LIMIT_WINDOW_MS_KEY, corrupt,);
        await expect(readMfaEmailWindowMs({ database: db, },),).resolves.toBe(MFA_EMAIL_DEFAULT_WINDOW_MS,);
      }
    } finally {
      await teardown();
    }
  });
});
