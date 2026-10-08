// SPDX-License-Identifier: LGPL-3.0-or-later
import { afterEach, describe, expect, test, } from "bun:test";
import { getTestDatabaseOverride, setTestDatabase, } from "../db/index";
import { createTestDb, destroyTestDb, } from "./create-test-db";

// These tests install a process-global override; clear it unconditionally so
// a failed assertion cannot leak it into a sibling file (see src/db/index.ts).
afterEach(() => {
  setTestDatabase(null,);
},);

describe("test-utils create-test-db", () => {
  test("createTestDb is defined and callable", () => {
    expect(typeof createTestDb,).toBe("function",);
  });

  test("createTestDb returns a Promise", async () => {
    const result = createTestDb();
    expect(result,).toBeInstanceOf(Promise,);
    await result;
  });

  test("destroyTestDb closes the handle so later queries fail", async () => {
    const fx = await createTestDb();
    await destroyTestDb(fx,);
    expect(() => fx.sqlite.run("SELECT 1",)).toThrow();
  });

  // Hazard: callers already closing the handle in their own teardown must not
  // hit a double-destroy throw when they adopt destroyTestDb.
  test("destroyTestDb is idempotent — a second call does not throw", async () => {
    const fx = await createTestDb();
    await destroyTestDb(fx,);
    await expect(destroyTestDb(fx,),).resolves.toBeUndefined();
  });

  // Destroying a fixture still installed as the process-global override would
  // otherwise leave getDatabase() handing a closed handle to sibling files.
  test("destroyTestDb clears a matching setTestDatabase override", async () => {
    const fx = await createTestDb();
    setTestDatabase(fx.db,);
    await destroyTestDb(fx,);
    expect(getTestDatabaseOverride(),).toBeNull();
  });

  test("destroyTestDb leaves an unrelated override in place", async () => {
    const keeper = await createTestDb();
    const victim = await createTestDb();
    setTestDatabase(keeper.db,);
    await destroyTestDb(victim,);
    expect(getTestDatabaseOverride(),).toBe(keeper.db,);
    await destroyTestDb(keeper,);
  });
});
