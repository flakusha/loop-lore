// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/image-engine/sdcpp-pick.ts — the stored-setup pick
 * fallback shared by the image-edit sd-server provider and emotion-avatar
 * generation.
 *
 * Asserts: first probe-healthy stored setup wins, unreachable setups are
 * skipped with a structured (key-free) reason and the walk continues, purpose
 * fit filters candidates, and nothing is returned when nothing is stored.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { initSmk, } from "../../crypto/smk";
import type { DB, } from "../../db/schema";
import { createLogger, setGlobalLogger, } from "../../logger";
import type { Logger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { pickStoredSdCppProvider, } from "./sdcpp-pick";
import { saveSdCppSetup, } from "./sdcpp-setup";

const VALID_BASE = "http://127.0.0.1:9010";

const CAPABILITIES_OK = (): Response => Response.json({ version: "t", runtime: { state: "ready", }, },);

interface CapturedWarn {
  message: string | Record<string, unknown>;
}

/** Warn-capturing logger stub — the structured skip logging is what is under
 * test, and the root logger otherwise writes to real transports. */
function capturingLogger(sink: CapturedWarn[],): Logger {
  const noop = (): void => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: (message: string | Record<string, unknown>,) => {
      sink.push({ message, },);
    },
    error: noop,
    fatal: noop,
    child: () => capturingLogger(sink,),
    addTransport: noop,
    setBindings: noop,
    setLevel: noop,
    flush: async () => {},
  };
}

describe("pickStoredSdCppProvider", () => {
  let db: Kysely<DB>;
  const originalFetch = globalThis.fetch;
  const warns: CapturedWarn[] = [];

  beforeAll(async () => {
    createLogger({ level: "error", },);
    setGlobalLogger(capturingLogger(warns,),);
    ({ db, } = await createTestDb());
    await initSmk({
      serverEncryptionKey: "f".repeat(64,),
      required: false,
      compressThreshold: 1024,
      compressAlgorithm: "gzip",
    },);
  },);

  afterAll(async () => {
    await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);
    await db.destroy();
  },);

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    warns.length = 0;
    await db.deleteFrom("system_config",).execute();
  },);

  test("returns null when nothing is stored", async () => {
    expect(await pickStoredSdCppProvider(db, "edit",),).toBeNull();
  });

  test("returns the first probe-healthy stored setup", async () => {
    await saveSdCppSetup(db, { name: "only", baseUrl: VALID_BASE, },);
    globalThis.fetch = (async (input: string | URL | Request,) => {
      expect(String(input instanceof Request ? input.url : input,),).toBe(`${VALID_BASE}/sdcpp/v1/capabilities`,);
      return CAPABILITIES_OK();
    }) as typeof fetch;

    const picked = await pickStoredSdCppProvider(db, "edit",);
    expect(picked?.name,).toBe("only",);
    expect(picked?.apiFamily,).toBe("sdcpp",);
    expect(warns,).toEqual([],);
  });

  test("skips an unreachable stored setup with a structured reason and falls through", async () => {
    await saveSdCppSetup(db, { name: "down", baseUrl: "http://127.0.0.1:9414", },);
    await saveSdCppSetup(db, { name: "up", baseUrl: VALID_BASE, },);
    globalThis.fetch = (async (input: string | URL | Request,) => {
      const url = String(input instanceof Request ? input.url : input,);
      if (url.startsWith("http://127.0.0.1:9414",)) { throw new Error("connection refused",); }
      return CAPABILITIES_OK();
    }) as typeof fetch;

    const picked = await pickStoredSdCppProvider(db, "generate",);
    expect(picked?.name,).toBe("up",);

    expect(warns,).toHaveLength(1,);
    const entry = warns[0]!.message as Record<string, unknown>;
    expect(entry.provider,).toBe("down",);
    expect(String(entry.reason,),).toContain("unreachable",);
  });

  test("filters candidates by purpose fit", async () => {
    await saveSdCppSetup(db, { name: "gen-only", baseUrl: VALID_BASE, purpose: "generate", },);
    globalThis.fetch = (async (_input: string | URL | Request,) => CAPABILITIES_OK()) as typeof fetch;

    expect(await pickStoredSdCppProvider(db, "edit",),).toBeNull();
    expect((await pickStoredSdCppProvider(db, "generate",))?.name,).toBe("gen-only",);
  });

  test("never leaks the stored API key through the skip path", async () => {
    const KEY = "sk-test-secret-value";
    await saveSdCppSetup(db, { name: "keyed", baseUrl: "http://127.0.0.1:9415", apiKey: KEY, },);
    globalThis.fetch = (async (_input: string | URL | Request,): Promise<Response> => {
      throw new Error("connection refused",);
    }) as typeof fetch;

    expect(await pickStoredSdCppProvider(db, "edit",),).toBeNull();
    expect(JSON.stringify(warns,),).not.toContain(KEY,);
  });
});
