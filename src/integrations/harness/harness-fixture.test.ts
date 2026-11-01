// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Composite harness-fixture tests: fake ACP server + in-memory DB wired
 * together, released by one cleanup().
 *
 * Resource contract (parallel-safe): per-test fixture, both the adapter
 * child and the fixture's server reaped in afterEach; the DB is closed by
 * destroyTestDb. No ports, no shared state, no sleeps.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { createHarnessFixture, type HarnessFixture, } from "./harness-fixture";
import { OmpAcpAdapter, } from "./omp";

/** Fixtures opened by the current test; released after each. */
const fixtures: HarnessFixture[] = [];
/** Adapters created by the current test; reaped after each. */
const adapters: OmpAcpAdapter[] = [];

/** Open a fixture and register it for teardown. */
async function open(env?: Parameters<typeof createHarnessFixture>[0],): Promise<HarnessFixture> {
  const fixture = await createHarnessFixture(env,);
  fixtures.push(fixture,);
  return fixture;
}

/** Create an adapter over a fixture's server and register it for teardown. */
function makeAdapter(argv: string[],): OmpAcpAdapter {
  const adapter = new OmpAcpAdapter({ command: argv, requestTimeoutMs: 5000, },);
  adapters.push(adapter,);
  return adapter;
}

afterEach(async () => {
  while (adapters.length > 0) { adapters.pop()?.close(); }
  while (fixtures.length > 0) { await fixtures.pop()?.cleanup(); }
},);

describe("createHarnessFixture", () => {
  it("wires the fake server and a live in-memory DB side by side", async () => {
    const fx = await open({ server: { FAKE_MODELS: "m1,m2", }, },);
    const adapter = makeAdapter(fx.server.argv,);

    expect(await adapter.enumerateModels(),).toEqual(["m1", "m2",],);
    await fx.db.insertInto("system_config",).values({ key: "harness-fixture-probe", value: "alive", },).execute();
    const row = await fx.db
      .selectFrom("system_config",)
      .select("value",)
      .where("key", "=", "harness-fixture-probe",)
      .executeTakeFirstOrThrow();

    expect(row.value,).toBe("alive",);
  });

  it("cleanup is idempotent", async () => {
    const fx = await open();
    await fx.cleanup();
    await expect(fx.cleanup(),).resolves.toBeUndefined();
  });

  it("gives each fixture its own isolated server and DB", async () => {
    const a = await open({ server: { FAKE_MODELS: "a-only", }, },);
    const b = await open({ server: { FAKE_MODELS: "b-only", }, },);
    const adapterA = makeAdapter(a.server.argv,);
    const adapterB = makeAdapter(b.server.argv,);

    expect(await adapterA.enumerateModels(),).toEqual(["a-only",],);
    expect(await adapterB.enumerateModels(),).toEqual(["b-only",],);
    await a.db.insertInto("system_config",).values({ key: "only-a", value: "1", },).execute();
    const leaked = await b.db
      .selectFrom("system_config",)
      .select("key",)
      .where("key", "=", "only-a",)
      .executeTakeFirst();

    expect(leaked,).toBeUndefined();
  });
});
