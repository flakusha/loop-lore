// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for POST /api/frontend/logs (ingestion branches).
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { createLogger, } from "../logger";
import { frontendLogsRoutes, } from "./frontend-logs";

/** */
function makeApp(): Elysia {
  return new Elysia({ name: "test-frontend-logs-coverage", },).use(frontendLogsRoutes(),) as unknown as Elysia;
}

/**
 * @param entries
 */
function batchBody(entries: unknown[],): { body: string; headers: Record<string, string> } {
  return {
    body: JSON.stringify({ entries, },),
    headers: { "Content-Type": "application/json", },
  };
}

describe("frontendLogsRoutes coverage", () => {
  beforeAll(() => {
    createLogger({ level: "error", },);
  },);

  test("ingests every documented level", async () => {
    const app = makeApp();
    const levels = ["trace", "debug", "info", "warn", "error", "fatal",];
    const entries = levels.map((level,) => ({
      level,
      module: "test-mod",
      message: `msg-${level}`,
      meta: { k: 1, },
      timestamp: new Date().toISOString(),
    }));
    const { body, headers, } = batchBody(entries,);
    const res = await app.handle(
      new Request("http://localhost/api/frontend/logs", { method: "POST", headers, body, },),
    );
    expect(res.status,).toBe(200,);
    const parsed = (await res.json()) as { ok: boolean; ingested: number };
    expect(parsed.ok,).toBe(true,);
    expect(parsed.ingested,).toBe(levels.length,);
  });

  test("unknown level falls back to info and still ingests", async () => {
    const app = makeApp();
    const { body, headers, } = batchBody([
      { level: "verbose", module: "m", message: "hi", timestamp: new Date().toISOString(), },
    ],);
    const res = await app.handle(
      new Request("http://localhost/api/frontend/logs", { method: "POST", headers, body, },),
    );
    expect(res.status,).toBe(200,);
    const parsed = (await res.json()) as { ingested: number };
    expect(parsed.ingested,).toBe(1,);
  });

  test("ingests entries without optional meta", async () => {
    const app = makeApp();
    const { body, headers, } = batchBody([
      { level: "info", module: "m", message: "no-meta", timestamp: new Date().toISOString(), },
    ],);
    const res = await app.handle(
      new Request("http://localhost/api/frontend/logs", { method: "POST", headers, body, },),
    );
    expect(res.status,).toBe(200,);
  });

  test("400 on malformed JSON body", async () => {
    const app = makeApp();
    const res = await app.handle(
      new Request("http://localhost/api/frontend/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: "{not-json",
      },),
    );
    expect(res.status,).toBe(400,);
    const parsed = (await res.json()) as { error: string };
    expect(typeof parsed.error,).toBe("string",);
  });

  test("400 on empty entries array", async () => {
    const app = makeApp();
    const { body, headers, } = batchBody([],);
    const res = await app.handle(
      new Request("http://localhost/api/frontend/logs", { method: "POST", headers, body, },),
    );
    expect(res.status,).toBe(400,);
  });

  test("400 when entries is missing or not an array", async () => {
    const app = makeApp();
    for (const payload of [{}, { entries: "nope", }, { entries: null, },]) {
      const res = await app.handle(
        new Request("http://localhost/api/frontend/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify(payload,),
        },),
      );
      expect(res.status,).toBe(400,);
    }
  });
});
