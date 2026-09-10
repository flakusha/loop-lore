// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { localInferenceRoutes, } from "./routes";

describe("local inference routes", () => {
  test("manifest endpoint serves the static manifest", async () => {
    const app = localInferenceRoutes();
    const res = await app.handle(new Request("http://localhost/api/local-inference/manifest",),);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.version,).toBe(1,);
    expect(body.eligibleTasks,).toContain("prompt-improve",);
    expect(Array.isArray(body.models,),).toBe(true,);
  });

  test("capability endpoint defaults to opt-out", async () => {
    const app = localInferenceRoutes();
    const res = await app.handle(new Request("http://localhost/api/local-inference/capability",),);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.optInSupported,).toBe(true,);
    expect(body.defaultOptIn,).toBe(false,);
    expect(body.eligibleTasks,).toContain("prompt-analyze",);
  });
});
