// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { versionRedirect, } from "./version-redirect";

describe("versionRedirect", () => {
  test("redirects /api/{resource} to /api/v1/{resource} with 308", () => {
    const handler = versionRedirect("v1",);
    const res = handler({ request: new Request("http://localhost/api/chats",), },);
    expect(res.status,).toBe(308,);
    expect(res.headers.get("Location",),).toBe("/api/v1/chats",);
    expect(res.headers.get("X-API-Version",),).toBe("v1",);
  });

  test("preserves nested paths and query strings", () => {
    const handler = versionRedirect("v1",);
    const res = handler({ request: new Request("http://localhost/api/rpg/dice/roll?fast=true",), },);
    expect(res.status,).toBe(308,);
    expect(res.headers.get("Location",),).toBe("/api/v1/rpg/dice/roll?fast=true",);
  });

  test("honours a custom target version", () => {
    const handler = versionRedirect("v2",);
    const res = handler({ request: new Request("http://localhost/api/worlds",), },);
    expect(res.headers.get("Location",),).toBe("/api/v2/worlds",);
    expect(res.headers.get("X-API-Version",),).toBe("v2",);
  });

  test("returns an empty body", async () => {
    const handler = versionRedirect("v1",);
    const res = handler({ request: new Request("http://localhost/api/chats",), },);
    expect(await res.text(),).toBe("",);
  });
});
