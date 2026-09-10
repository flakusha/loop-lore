// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeEach, describe, expect, test, } from "bun:test";
import { createLogger, } from "../logger";
import { BROWSER_MODEL_CATALOG, isWllamaEngine, } from "./manifest";
import { localInferenceRoutes, } from "./routes";

describe("local inference routes", () => {
  beforeEach(() => {
    createLogger({ level: "warn", },);
  },);

  test("manifest endpoint serves the static manifest", async () => {
    const app = localInferenceRoutes();
    const res = await app.handle(new Request("http://localhost/api/local-inference/manifest",),);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.version,).toBe(1,);
    expect(body.eligibleTasks,).toContain("prompt-improve",);
    expect(Array.isArray(body.models,),).toBe(true,);
    for (const model of body.models) {
      expect(Array.isArray(model.files,),).toBe(true,);
      if (!isWllamaEngine(model.engine,)) {
        expect(model.files.length,).toBeGreaterThan(0,);
      }
      for (const file of model.files) {
        expect(typeof file.name,).toBe("string",);
        expect(String(file.url,).startsWith("https://",),).toBe(true,);
      }
    }
  });

  test("capability endpoint defaults to opt-out", async () => {
    const app = localInferenceRoutes();
    const res = await app.handle(new Request("http://localhost/api/local-inference/capability",),);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.optInSupported,).toBe(true,);
    expect(body.defaultOptIn,).toBe(false,);
    expect(body.eligibleTasks,).toContain("prompt-analyze",);
    expect(body.downloadsAllowed,).toBe(true,);
  });
  test("deny policy flips the capability downloads flag", async () => {
    const app = localInferenceRoutes({
      resolvePolicy: () => ({ allowDownloads: false, }),
    },);
    const res = await app.handle(new Request("http://localhost/api/local-inference/capability",),);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.downloadsAllowed,).toBe(false,);
    expect(body.models,).toBeUndefined();
  });
  test("injected deny policy filters the served catalog", async () => {
    const first = BROWSER_MODEL_CATALOG[0];
    if (!first) { throw new Error("policy test needs a catalog model",); }
    const app = localInferenceRoutes({
      resolvePolicy: () => ({ models: { [first.id]: { allowDownload: false, }, }, }),
    },);
    const res = await app.handle(new Request("http://localhost/api/local-inference/manifest",),);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.models.map((model: { id: string },) => model.id),).not.toContain(first.id,);
  });
});
