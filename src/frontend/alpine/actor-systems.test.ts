// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, mock, test, } from "bun:test";
import {
  actorSystems,
  actorSystemsFactory,
  type ActorSystemsState,
  EXPORT_SECTIONS,
} from "./actor-systems";

// ── Mock ../htmx (must precede importing ./actor-systems) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

mock.module("./htmx", () => ({
  apiFetch: ((url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

const baseCtx = (): ActorSystemsState & Record<string, unknown> => {
  const state = Object.create(actorSystems,) as ActorSystemsState & Record<string, unknown>;
  state._sysActorId = null;
  state.sections = {
    traits: true,
    mood: true,
    relationships: true,
    avatars: true,
    licensing: true,
    availability: true,
    worldSetup: true,
  };
  state.worldId = "";
  state.busy = false;
  state.message = "";
  state.error = "";
  state.importPreview = "";
  state.importUrl = "";
  state.importResult = null;
  return state;
};

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
},);

describe("actorSystems.setActorId", () => {
  test("binds and clears prior state", () => {
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    expect(ctx._sysActorId,).toBe("actor-1",);
  });

  test("no-op when actor unchanged", () => {
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    ctx.error = "old";
    ctx.setActorId("actor-1",);
    expect(ctx.error,).toBe("old",);
  });
});

describe("actorSystems.buildExportBody", () => {
  test("emits one includeXxx per section + worldId", () => {
    const ctx = baseCtx();
    ctx._sysActorId = "actor-1";
    ctx.sections.traits = false;
    ctx.worldId = "world-7";
    const body = ctx.buildExportBody();
    expect(body.includeTraits,).toBe(false,);
    expect(body.includeMood,).toBe(true,);
    expect(body.worldId,).toBe("world-7",);
  });

  test("omits worldId when not set", () => {
    const ctx = baseCtx();
    ctx._sysActorId = "actor-1";
    const body = ctx.buildExportBody();
    expect("worldId" in body,).toBe(false,);
  });
});

describe("actorSystems.exportAsBlob", () => {
  test("returns null without actor", async () => {
    const ctx = baseCtx();
    expect(await ctx.exportAsBlob(),).toBeNull();
  });

  test("POSTs export body and returns a Blob on 200", async () => {
    handler = async () => Response.json({ ok: true, },);
    const ctx = baseCtx();
    ctx._sysActorId = "actor-1";
    const blob = await ctx.exportAsBlob();
    expect(blob,).not.toBeNull();
    expect(calls.some((c,) => c.opts.method === "POST" && c.url === "/api/v1/actors/actor-1/systems/export"),).toBe(
      true,
    );
  });

  test("returns null on non-200", async () => {
    handler = async () => Response.json({}, { status: 500, },);
    const ctx = baseCtx();
    ctx._sysActorId = "actor-1";
    expect(await ctx.exportAsBlob(),).toBeNull();
  });

  test("records nothing when network fails (returns null)", async () => {
    handler = async () => {
      throw new Error("net",);
    };
    const ctx = baseCtx();
    ctx._sysActorId = "actor-1";
    expect(await ctx.exportAsBlob(),).toBeNull();
  });
});

describe("actorSystems.triggerDownload", () => {
  test("no-op without actor", async () => {
    const ctx = baseCtx();
    await ctx.triggerDownload();
    expect(calls,).toHaveLength(0,);
  });

  test("records error on export failure", async () => {
    handler = async () => Response.json({}, { status: 500, },);
    const ctx = baseCtx();
    ctx._sysActorId = "actor-1";
    await ctx.triggerDownload();
    expect(ctx.error,).toBeTruthy();
    expect(ctx.busy,).toBe(false,);
  });
});

describe("actorSystems.describeSection", () => {
  test("returns human label for known sections", () => {
    const ctx = baseCtx();
    expect(ctx.describeSection("traits",),).toBe("Traits",);
    expect(ctx.describeSection("worldSetup",),).toBe("World setup",);
  });

  test("falls back to raw section id", () => {
    const ctx = baseCtx();
    expect(ctx.describeSection("unknown_section",),).toBe("unknown_section",);
  });
});

describe("actorSystems.importFromPayload", () => {
  test("no-op without actor", async () => {
    const ctx = baseCtx();
    ctx.importPreview = '{"version":1}';
    await ctx.importFromPayload();
    expect(calls,).toHaveLength(0,);
  });

  test("errors on empty preview", async () => {
    const ctx = baseCtx();
    ctx._sysActorId = "actor-1";
    await ctx.importFromPayload();
    expect(ctx.error,).toBeTruthy();
    expect(calls,).toHaveLength(0,);
  });

  test("errors on invalid JSON", async () => {
    const ctx = baseCtx();
    ctx._sysActorId = "actor-1";
    ctx.importPreview = "not json {";
    await ctx.importFromPayload();
    expect(ctx.error,).toBeTruthy();
  });

  test("POSTs valid payload and stores result", async () => {
    handler = async () =>
      Response.json({
        success: true,
        imported: { traits: 3, licensingImported: true, },
        errors: [],
      },);
    const ctx = baseCtx();
    ctx._sysActorId = "actor-1";
    ctx.importPreview = '{"version":1,"data":{}}';
    await ctx.importFromPayload();
    expect(calls.some((c,) => c.opts.method === "POST" && c.url === "/api/v1/actors/actor-1/systems/import"),).toBe(
      true,
    );
    expect(ctx.importResult?.success,).toBe(true,);
    expect(ctx.message,).toBeTruthy();
  });

  test("captures server message on non-200", async () => {
    handler = async () => Response.json({ message: "bad version", }, { status: 400, },);
    const ctx = baseCtx();
    ctx._sysActorId = "actor-1";
    ctx.importPreview = '{"version":1}';
    await ctx.importFromPayload();
    expect(ctx.error,).toBe("bad version",);
  });

  test("records generic error on network failure", async () => {
    handler = async () => {
      throw new Error("net",);
    };
    const ctx = baseCtx();
    ctx._sysActorId = "actor-1";
    ctx.importPreview = '{"version":1}';
    await ctx.importFromPayload();
    expect(ctx.error,).toBeTruthy();
    expect(ctx.busy,).toBe(false,);
  });
});

describe("actorSystems.importFromUrl", () => {
  test("no-op without actor", async () => {
    const ctx = baseCtx();
    ctx.importUrl = "https://example.com/x.json";
    await ctx.importFromUrl();
    expect(calls,).toHaveLength(0,);
  });

  test("errors on empty URL", async () => {
    const ctx = baseCtx();
    ctx._sysActorId = "actor-1";
    await ctx.importFromUrl();
    expect(ctx.error,).toBeTruthy();
  });

  test("POSTs the URL + worldId and stores result", async () => {
    handler = async () => Response.json({ success: true, imported: {}, errors: [], },);
    const ctx = baseCtx();
    ctx._sysActorId = "actor-1";
    ctx.importUrl = "https://example.com/x.json";
    ctx.worldId = "world-1";
    await ctx.importFromUrl();
    expect(calls.some((c,) => c.opts.method === "POST" && c.url === "/api/v1/actors/actor-1/systems/import/url"),).toBe(
      true,
    );
    expect(ctx.importResult?.success,).toBe(true,);
  });

  test("captures server message on non-200", async () => {
    handler = async () => Response.json({ message: "denied", }, { status: 403, },);
    const ctx = baseCtx();
    ctx._sysActorId = "actor-1";
    ctx.importUrl = "https://example.com/x.json";
    await ctx.importFromUrl();
    expect(ctx.error,).toBe("denied",);
  });
});

describe("actorSystems.resetImport", () => {
  test("clears all import fields and status", () => {
    const ctx = baseCtx();
    ctx.importPreview = "x";
    ctx.importUrl = "u";
    ctx.importResult = { success: true, imported: {}, errors: [], };
    ctx.message = "ok";
    ctx.error = "fail";
    ctx.resetImport();
    expect(ctx.importPreview,).toBe("",);
    expect(ctx.importUrl,).toBe("",);
    expect(ctx.importResult,).toBeNull();
    expect(ctx.message,).toBe("",);
    expect(ctx.error,).toBe("",);
  });
});

describe("EXPORT_SECTIONS export", () => {
  test("includes every supported section key", () => {
    expect(new Set(EXPORT_SECTIONS,),).toEqual(
      new Set([
        "traits",
        "mood",
        "relationships",
        "avatars",
        "licensing",
        "availability",
        "worldSetup",
      ],),
    );
  });
});

describe("actorSystemsFactory", () => {
  test("returns a fresh state bound to the actor", () => {
    const a = actorSystemsFactory("actor-a",);
    const b = actorSystemsFactory("actor-b",);
    expect(a,).not.toBe(b,);
    expect(a._sysActorId,).toBe("actor-a",);
    expect(b._sysActorId,).toBe("actor-b",);
  });
});
