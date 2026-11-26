// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import {
  assertPublicDecoyAllowed,
  type DecoyHit,
  type DecoyListener,
  startDecoyListener,
} from "./decoy-listener";

let listener: DecoyListener;
let hits: DecoyHit[];

beforeEach(() => {
  hits = [];
  listener = startDecoyListener({
    onHit: (hit,) => {
      hits.push(hit,);
    },
  },);
},);

afterEach(async () => {
  await listener.stop();
},);

describe("isolated decoy listener", () => {
  test("robots.txt disallows the bait paths and is not indexable", async () => {
    const res = await fetch(`${listener.url}/robots.txt`,);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("X-Robots-Tag",),).toBe("noindex, nofollow",);
    const body = await res.text();
    expect(body,).toContain("Disallow: /admin",);
    expect(body,).toContain("Disallow: /moderator",);
    expect(body,).toContain("Disallow: /api/",);
  });

  test("bait pages contain only fixtures", async () => {
    const index = await fetch(listener.url,);
    expect(await index.text(),).toContain("/admin/login",);
    const admin = await fetch(`${listener.url}/admin/login`,);
    expect(await admin.text(),).toContain("Sign in",);
    const config = await fetch(`${listener.url}/api/v1/admin/config`,);
    expect(await config.json(),).toEqual({
      mode: "example",
      notice: "synthetic fixture",
    },);

    expect(hits.filter((hit,) => hit.kind === "bait").length,).toBe(3,);
  });

  test("fake success token is example-only and logged", async () => {
    const res = await fetch(`${listener.url}/api/v1/auth/login`, {
      body: "username=admin&password=guess",
      method: "POST",
    },);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { authenticated: boolean; token: string };
    expect(body.authenticated,).toBe(true,);
    expect(body.token.startsWith("llh_example_",),).toBe(true,);
    expect(body.token,).not.toContain("loop-lore",);
    expect(hits.some((hit,) => hit.kind === "fake-auth"),).toBe(true,);
  });

  test("refuses oversized bodies without reading them", async () => {
    const res = await fetch(`${listener.url}/admin`, {
      body: "x".repeat(5000,),
      method: "POST",
    },);

    expect(res.status,).toBe(413,);
  });

  test("caps requests per source IP", async () => {
    await listener.stop();
    listener = startDecoyListener({ maxRequestsPerWindow: 2, },);
    await fetch(`${listener.url}/admin`,);
    await fetch(`${listener.url}/admin`,);
    const blocked = await fetch(`${listener.url}/admin`,);
    expect(blocked.status,).toBe(429,);
    expect(blocked.headers.get("Retry-After",),).toBeDefined();
  });

  test("breach page is a static fixture and is classified", async () => {
    const res = await fetch(`${listener.url}/trap/breach`,);
    expect(res.status,).toBe(200,);
    expect(await res.text(),).toContain("Synthetic fixture",);
    expect(hits.at(-1,)?.kind,).toBe("breach",);
  });

  test("report page becomes a whitehat hit only after repeated contact", async () => {
    await fetch(`${listener.url}/report-security`,);
    expect(hits.at(-1,)?.kind,).toBe("bait",);

    for (let i = 0; i < 5; i += 1) {
      await fetch(`${listener.url}/admin`,);
    }

    await fetch(`${listener.url}/report-security`,);
    expect(hits.at(-1,)?.kind,).toBe("report",);
  });

  test("tarpit delays only repeated bait hits", async () => {
    await listener.stop();
    listener = startDecoyListener({ tarpitMs: 150, },);

    for (let i = 0; i < 5; i += 1) {
      await fetch(`${listener.url}/admin`,);
    }

    const started = Date.now();
    const response = await fetch(`${listener.url}/admin`,);
    await response.arrayBuffer();
    expect(Date.now() - started,).toBeGreaterThanOrEqual(80,);
    expect(response.status,).toBe(200,);
  });

  test("deny rules block literal user agents before any hit", async () => {
    await listener.stop();
    listener = startDecoyListener({
      denyRules: [{ userAgent: "BlockedBot", },],
    },);

    const res = await fetch(`${listener.url}/admin`, {
      headers: { "user-agent": "BlockedBot/1.0", },
    },);

    expect(res.status,).toBe(404,);
    expect(hits,).toHaveLength(0,);
  });

  test("unknown paths return a small 404 without app fingerprints", async () => {
    const res = await fetch(`${listener.url}/api/v1/health`,);
    expect(res.status,).toBe(404,);
    const body = await res.text();
    expect(body,).not.toContain("loop-lore",);
    expect(body.length,).toBeLessThan(64,);

    const inherited = await fetch(`${listener.url}/__proto__`,);
    expect(inherited.status,).toBe(404,);
    expect(hits.at(-1,)?.kind,).toBe("unknown",);
  });

  test("the report page accepts no input and mints no credential", async () => {
    const res = await fetch(`${listener.url}/report-security`, {
      body: "username=admin&finding=fake",
      method: "POST",
    },);

    expect(res.status,).toBe(404,);
    expect(await res.text(),).not.toContain("<form",);
    expect(res.headers.get("set-cookie",),).toBeNull();
  });
});

describe("decoy boundary", () => {
  test("public bind requires auth.required=true on the real app", () => {
    expect(() => assertPublicDecoyAllowed("127.0.0.1", false,)).not.toThrow();
    expect(() => assertPublicDecoyAllowed("::1", false,)).not.toThrow();
    expect(() => assertPublicDecoyAllowed("0.0.0.0", true,)).not.toThrow();
    expect(() => assertPublicDecoyAllowed("0.0.0.0", false,)).toThrow(/auth\.required=true/,);
  });

  test("the decoy module imports no app, DB, session, or plugin machinery", () => {
    const source = readFileSync(new URL("./decoy-listener.ts", import.meta.url,), "utf8",);
    const imports = source.split("\n",).filter((line,) => /^import\b/.test(line,)).join("\n",);

    for (const banned of ["createApp", "getDatabase", "session", "plugin", "../db", "../server",]) {
      expect(imports,).not.toContain(banned,);
    }
  });
});
