// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the admin llama-swap status/config surface: permission gates,
 * file-plane fallback + DB overrides, boundary validation, honest running
 * state, and PATCH → GET round trip.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { getConfigValue, } from "../../admin/config";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import {
  LLAMA_SWAP_AUTOSTART_CONFIG_PATH_KEY,
  LLAMA_SWAP_AUTOSTART_ENABLED_KEY,
  LLAMA_SWAP_AUTOSTART_LISTEN_PORT_KEY,
} from "../../llm/llama-swap-effective-config";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { llamaSwapRoutes, } from "./llama-swap";

let fixture: TestDb;
let db: Kysely<DB>;
let fileConfig: Config;

beforeAll(async () => {
  fixture = await createTestDb();
  db = fixture.db;
  fileConfig = {
    generation: {
      autoStart: {
        llamaSwap: { enabled: true, configPath: "/etc/llama-swap.yaml", listenPort: 8080, },
      },
    },
  } as unknown as Config;
},);

afterAll(async () => {
  await destroyTestDb(fixture,);
},);

function makeApp(userRole: string | null, prefix = "/api",) {
  const app = new Elysia({ name: "test-llama-swap", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));

  return app.use(llamaSwapRoutes({ database: db, config: fileConfig, }, prefix,),);
}

function handle(app: Elysia, method: "GET" | "PATCH", urlPath: string, body?: unknown,): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${urlPath}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json", }, body: JSON.stringify(body,), }),
    },),
  );
}

interface LlamaSwapStatus {
  configured: boolean;
  autoStartEnabled: boolean;
  listenPort: number | null;
  configPath: string | null;
  running: boolean;
}

describe("admin llama-swap routes", () => {
  test("status returns 401 for anonymous and 403 for non-admin", async () => {
    expect((await handle(makeApp(null,), "GET", "/api/admin/llama-swap/status",)).status,).toBe(401,);
    expect((await handle(makeApp("user",), "GET", "/api/admin/llama-swap/status",)).status,).toBe(403,);
  });

  test("config PATCH denies non-admin without writing", async () => {
    const res = await handle(makeApp("user",), "PATCH", "/api/admin/llama-swap/config", {
      autoStartEnabled: false,
    },);

    expect(res.status,).toBe(403,);
    expect(await getConfigValue(db, LLAMA_SWAP_AUTOSTART_ENABLED_KEY,),).toBeUndefined();
  });

  test("status falls back to file-plane config and never claims running", async () => {
    const res = await handle(makeApp("admin",), "GET", "/api/admin/llama-swap/status",);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as LlamaSwapStatus;
    expect(body,).toEqual({
      configured: true,
      autoStartEnabled: true,
      listenPort: 8080,
      configPath: "/etc/llama-swap.yaml",
      running: false,
    },);
  });

  test("rejects invalid ports and empty config paths", async () => {
    const app = makeApp("admin",);
    const cases: unknown[] = [
      { listenPort: 0, },
      { listenPort: 65_536, },
      { listenPort: 1.5, },
      { configPath: "   ", },
    ];

    for (const body of cases) {
      const res = await handle(app, "PATCH", "/api/admin/llama-swap/config", body,);
      expect(res.status,).toBe(400,);
    }
  });

  test("PATCH persists DB overrides reflected by a later GET", async () => {
    const res = await handle(makeApp("admin",), "PATCH", "/api/admin/llama-swap/config", {
      autoStartEnabled: false,
      listenPort: 9090,
      configPath: " /srv/llama-swap.yml ",
    },);

    expect(res.status,).toBe(200,);
    const patched = (await res.json()) as LlamaSwapStatus;
    expect(patched.autoStartEnabled,).toBe(false,);
    expect(patched.listenPort,).toBe(9090,);
    expect(patched.configPath,).toBe("/srv/llama-swap.yml",);
    expect(patched.running,).toBe(false,);

    expect(await getConfigValue(db, LLAMA_SWAP_AUTOSTART_ENABLED_KEY,),).toBe("false",);
    expect(await getConfigValue(db, LLAMA_SWAP_AUTOSTART_LISTEN_PORT_KEY,),).toBe("9090",);
    expect(await getConfigValue(db, LLAMA_SWAP_AUTOSTART_CONFIG_PATH_KEY,),).toBe("/srv/llama-swap.yml",);

    const after = await handle(makeApp("admin",), "GET", "/api/admin/llama-swap/status",);
    expect((await after.json()) as LlamaSwapStatus,).toEqual(patched,);
  });

  test("serves the same contract at the v1 prefix", async () => {
    const res = await handle(makeApp("admin", "/api/v1",), "GET", "/api/v1/admin/llama-swap/status",);
    expect(res.status,).toBe(200,);
  });
});
