// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, mock, test, } from "bun:test";
import {
  actorLicensing,
  actorLicensingFactory,
  type ActorLicensingState,
  type CharacterLicensing,
  LICENSE_TYPES,
} from "./actor-licensing";

// ── Mock ../htmx (must precede importing ./actor-licensing) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({}, { status: 404, },);

mock.module("./htmx", () => ({
  apiFetch: ((url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

const baseCtx = (): ActorLicensingState & Record<string, unknown> => {
  const state = Object.create(actorLicensing,) as ActorLicensingState & Record<string, unknown>;
  state._licActorId = null;
  state.license = null;
  state.licenseForm = {
    license_type: "proprietary",
    custom_license_text: "",
    attribution: "",
    allow_derivatives: true,
    allow_commercial: false,
    share_alike: false,
  };
  state.licenseLoading = false;
  state.licenseSaving = false;
  state.licenseError = "";
  state.licenseDirty = false;
  return state;
};

/** Drive the microtask queue. */
const flush = async (): Promise<void> => {
  const { promise, resolve, } = Promise.withResolvers<void>();
  queueMicrotask(() => {
    resolve();
  },);
  await promise;
};

afterEach(() => {
  calls = [];
  handler = async () => Response.json({}, { status: 404, },);
},);

describe("actorLicensing.setActorId", () => {
  test("binds and clears prior state", () => {
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    expect(ctx._licActorId,).toBe("actor-1",);
    expect(ctx.license,).toBeNull();
    expect(ctx.licenseDirty,).toBe(false,);
  });

  test("no-op when actor unchanged", () => {
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    ctx.licenseDirty = true;
    ctx.setActorId("actor-1",);
    expect(ctx.licenseDirty,).toBe(true,);
  });
});

describe("actorLicensing.loadLicensing", () => {
  const sampleLicensing: CharacterLicensing = {
    id: "lic-1",
    actor_id: "actor-1",
    license_type: "cc_by_nc_sa",
    custom_license_text: null,
    attribution: "Original by Aria",
    allow_derivatives: 1,
    allow_commercial: 0,
    share_alike: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  test("no-op without actor id", async () => {
    const ctx = baseCtx();
    await ctx.loadLicensing();
    expect(calls,).toHaveLength(0,);
  });

  test("populates license + form on 200", async () => {
    handler = async () => Response.json(sampleLicensing,);
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    await flush();
    expect(ctx.license?.id,).toBe("lic-1",);
    expect(ctx.licenseForm.license_type,).toBe("cc_by_nc_sa",);
    expect(ctx.licenseForm.allow_commercial,).toBe(false,);
    expect(ctx.licenseForm.share_alike,).toBe(true,);
  });

  test("treats 404 as 'no license yet'", async () => {
    handler = async () => Response.json({}, { status: 404, },);
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    await flush();
    expect(ctx.license,).toBeNull();
    expect(ctx.licenseError,).toBe("",);
  });

  test("captures error on non-OK non-404", async () => {
    handler = async () => Response.json({}, { status: 500, },);
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    await flush();
    expect(ctx.licenseError,).toBeTruthy();
  });

  test("records error on network failure", async () => {
    handler = async () => {
      throw new Error("net",);
    };
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    await flush();
    expect(ctx.licenseError,).toBeTruthy();
  });
});

describe("actorLicensing.save", () => {
  test("no-op without actor id", async () => {
    const ctx = baseCtx();
    await ctx.save();
    expect(calls,).toHaveLength(0,);
  });

  test("POSTs the form and reloads on 200", async () => {
    handler = async (_url: string, opts?: RequestInit,) => {
      if (opts?.method === "POST") { return Response.json({ id: "lic-1", updated: true, }, { status: 200, },); }
      return Response.json({
        id: "lic-1",
        actor_id: "actor-1",
        license_type: "cc0",
        custom_license_text: null,
        attribution: null,
        allow_derivatives: 1,
        allow_commercial: 1,
        share_alike: 0,
        created_at: "",
        updated_at: "",
      },);
    };
    const ctx = baseCtx();
    ctx._licActorId = "actor-1";
    ctx.licenseForm.license_type = "cc0";
    ctx.licenseForm.allow_commercial = true;
    ctx.licenseDirty = true;
    await ctx.save();
    expect(calls.some((c,) => c.opts.method === "POST" && c.url === "/api/actors/actor-1/licensing"),).toBe(true,);
    expect(ctx.licenseDirty,).toBe(false,);
  });

  test("captures server message on non-200", async () => {
    handler = async () => Response.json({ message: "denied", }, { status: 403, },);
    const ctx = baseCtx();
    ctx._licActorId = "actor-1";
    await ctx.save();
    expect(ctx.licenseError,).toBe("denied",);
    expect(ctx.licenseSaving,).toBe(false,);
  });

  test("records generic error on network failure", async () => {
    handler = async () => {
      throw new Error("net",);
    };
    const ctx = baseCtx();
    ctx._licActorId = "actor-1";
    await ctx.save();
    expect(ctx.licenseError,).toBeTruthy();
  });
});

describe("actorLicensing.remove", () => {
  test("DELETEs and clears license on 200", async () => {
    handler = async () => Response.json({ ok: true, },);
    const ctx = baseCtx();
    ctx._licActorId = "actor-1";
    ctx.license = {
      id: "lic-1",
      actor_id: "actor-1",
      license_type: "cc0",
      custom_license_text: null,
      attribution: null,
      allow_derivatives: 1,
      allow_commercial: 1,
      share_alike: 0,
      created_at: "",
      updated_at: "",
    };
    await ctx.remove();
    expect(calls.some((c,) => c.opts.method === "DELETE" && c.url === "/api/actors/actor-1/licensing"),).toBe(true,);
    expect(ctx.license,).toBeNull();
    expect(ctx.licenseDirty,).toBe(false,);
  });

  test("captures error on non-200", async () => {
    handler = async () => Response.json({}, { status: 500, },);
    const ctx = baseCtx();
    ctx._licActorId = "actor-1";
    await ctx.remove();
    expect(ctx.licenseError,).toBeTruthy();
  });

  test("no-op without actor id", async () => {
    const ctx = baseCtx();
    await ctx.remove();
    expect(calls,).toHaveLength(0,);
  });
});

describe("actorLicensing.describeLicense", () => {
  test("returns human label for known codes", () => {
    const ctx = baseCtx();
    expect(ctx.describeLicense("cc_by_nc_sa",),).toBe("CC BY-NC-SA",);
    expect(ctx.describeLicense("cc0",),).toBe("CC0 (Public Domain)",);
  });

  test("falls back to the raw code", () => {
    const ctx = baseCtx();
    expect(ctx.describeLicense("unknown_xyz",),).toBe("unknown_xyz",);
  });
});

describe("LICENSE_TYPES export", () => {
  test("includes every enum value", () => {
    expect(LICENSE_TYPES.includes("cc0",),).toBe(true,);
    expect(LICENSE_TYPES.includes("cc_by_nc_sa",),).toBe(true,);
    expect(LICENSE_TYPES.includes("proprietary",),).toBe(true,);
    expect(LICENSE_TYPES.includes("custom",),).toBe(true,);
  });
});

describe("actorLicensingFactory", () => {
  test("returns a fresh state bound to the given actor", async () => {
    handler = async () =>
      Response.json({
        id: "lic-1",
        actor_id: "actor-1",
        license_type: "cc0",
        custom_license_text: null,
        attribution: null,
        allow_derivatives: 1,
        allow_commercial: 1,
        share_alike: 0,
        created_at: "",
        updated_at: "",
      },);
    const state = actorLicensingFactory("actor-1",);
    await flush();
    expect(state._licActorId,).toBe("actor-1",);
    expect(state.license?.license_type,).toBe("cc0",);
  });

  test("factory instances do not share state across calls", async () => {
    const a = actorLicensingFactory("actor-a",);
    const b = actorLicensingFactory("actor-b",);
    expect(a,).not.toBe(b,);
    expect(a._licActorId,).toBe("actor-a",);
    expect(b._licActorId,).toBe("actor-b",);
  });
});
