// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import {
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

  test("unknown paths return a small 404 without app fingerprints", async () => {
    const res = await fetch(`${listener.url}/api/v1/health`,);
    expect(res.status,).toBe(404,);
    const body = await res.text();
    expect(body,).not.toContain("loop-lore",);
    expect(body.length,).toBeLessThan(64,);
  });
});
