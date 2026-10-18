// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `resolveUserRole` — the trust boundary that decides what role the
 * assistant command path hands to the shared world-access helpers.
 *
 * The contract is deliberately narrow: return the LIVE `users.role` for an
 * active account, and `null` for everything else. `null` is what makes the
 * whole path fail closed, so each denial reason is pinned separately — a
 * disabled account and a missing row are both no-role, but the caller must be
 * able to tell from the code which branch fired.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { UserRole, UserStatus, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { resolveUserRole, } from "./roles";

describe("resolveUserRole", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  beforeEach(async () => {
    await db.deleteFrom("users",).execute();
  },);

  test("returns the live users.role, including for non-privileged roles", async () => {
    // Every role a caller can actually hold must survive the round-trip —
    // the command path does not get to narrow or widen the vocabulary.
    for (const role of [UserRole.Admin, UserRole.Moderator, UserRole.User, UserRole.Player,]) {
      const id = `user-${role}-${crypto.randomUUID()}`;
      await insertUsers(db, `u-${role}`, "U", { id, role, },);
      expect(await resolveUserRole(db, id,),).toBe(role,);
    }
  });

  test("re-reads the row so a role change takes effect immediately", async () => {
    const id = `user-${crypto.randomUUID()}`;
    await insertUsers(db, "u", "U", { id, role: UserRole.Admin, },);
    expect(await resolveUserRole(db, id,),).toBe(UserRole.Admin,);

    await db.updateTable("users",).set({ role: UserRole.Player, },).where("id", "=", id,).execute();
    expect(await resolveUserRole(db, id,),).toBe(UserRole.Player,);
  });

  test("returns null for an unknown user id", async () => {
    expect(await resolveUserRole(db, `ghost-${crypto.randomUUID()}`,),).toBeNull();
  });

  test("returns null for a disabled account", async () => {
    const id = `user-${crypto.randomUUID()}`;
    await insertUsers(db, "u", "U", {
      id,
      role: UserRole.Admin,
      status: UserStatus.Disabled,
    },);

    // Even a wildcard-privileged role loses every bypass once the account is off.
    expect(await resolveUserRole(db, id,),).toBeNull();
  });

  test("returns null for a deactivated account", async () => {
    const id = `user-${crypto.randomUUID()}`;
    await insertUsers(db, "u", "U", {
      id,
      role: UserRole.Solo,
      status: UserStatus.Deactivated,
    },);

    expect(await resolveUserRole(db, id,),).toBeNull();
  });

  test("returns null for a missing user id", async () => {
    expect(await resolveUserRole(db, null,),).toBeNull();
    expect(await resolveUserRole(db, undefined,),).toBeNull();
    expect(await resolveUserRole(db, "",),).toBeNull();
  });
});
