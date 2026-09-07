import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { ProfileDetail, } from "./types";
import { profiles, } from "./profiles";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;

const globalState = globalThis as unknown as {
  apiFetch?: ApiFetchMock;
  showToast?: (type: string, message: string,) => void;
};
const originalFetch = globalState.apiFetch;
const originalToast = globalState.showToast;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);
let toasts: { type: string; message: string }[] = [];

beforeEach(() => {
  calls = [];
  toasts = [];
  handler = async () => Response.json({},);
  // profiles.ts calls the ambient apiFetch/showToast globals.
  globalState.apiFetch = (url, opts,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  };
  globalState.showToast = (type, message,) => {
    toasts.push({ type, message, },);
  };
});

afterEach(() => {
  globalState.apiFetch = originalFetch;
  globalState.showToast = originalToast;
});

/** Minimal list payload accepted by AdminTemplateListResponse. */
const listPayload = {
  profiles: [],
  defaultProfileId: "flux",
  builtinCount: 3,
  customCount: 4,
};

function resetProfileState(): void {
  profiles.templateProfiles = [];
  profiles.defaultProfileId = "sdxl";
  profiles.builtinCount = 0;
  profiles.customCount = 0;
  profiles.loadingTemplates = false;
  profiles.selectedProfile = null;
  profiles.showCreateModal = false;
  profiles.newProfile = { id: "", name: "", families: "", promptFormat: "tags", maxTokenHint: 150, };
}

afterEach(() => {
  resetProfileState();
});

describe("adminTemplates.profiles.loadTemplates", () => {
  test("loads and stores the parsed list", async () => {
    handler = async () => Response.json(listPayload,);
    await profiles.loadTemplates();
    expect(calls[0]!.url,).toBe("/api/admin/templates",);
    expect(profiles.templateProfiles,).toEqual([],);
    expect(profiles.defaultProfileId,).toBe("flux",);
    expect(profiles.builtinCount,).toBe(3,);
    expect(profiles.customCount,).toBe(4,);
    expect(profiles.loadingTemplates,).toBe(false,);
  });

  test("falls back to defaults when the payload violates the schema", async () => {
    handler = async () => Response.json({ profiles: "nope", },);
    await profiles.loadTemplates();
    expect(profiles.defaultProfileId,).toBe("sdxl",);
    expect(profiles.builtinCount,).toBe(0,);
    expect(profiles.customCount,).toBe(0,);
    expect(profiles.loadingTemplates,).toBe(false,);
  });

  test("keeps state on non-ok responses and network errors", async () => {
    handler = async () => new Response("", { status: 500, },);
    await profiles.loadTemplates();
    expect(profiles.defaultProfileId,).toBe("sdxl",);
    handler = async () => {
      throw new Error("offline",);
    };
    await profiles.loadTemplates();
    expect(profiles.loadingTemplates,).toBe(false,);
  });
});

describe("adminTemplates.profiles.selectProfile / clearSelection", () => {
  test("stores the fetched profile detail", async () => {
    handler = async () => Response.json({ id: "p1", name: "Profile One", templates: {}, },);
    await profiles.selectProfile("p1",);
    expect(calls[0]!.url,).toBe("/api/admin/templates/p1",);
    expect(profiles.selectedProfile,).toEqual({ id: "p1", name: "Profile One", templates: {}, } as never,);
  });

  test("keeps the prior selection on non-ok responses and network errors", async () => {
    profiles.selectedProfile = { id: "keep", name: "Keep", templates: {}, } as unknown as ProfileDetail;
    handler = async () => new Response("", { status: 404, },);
    await profiles.selectProfile("p2",);
    expect(profiles.selectedProfile!.id,).toBe("keep",);
    handler = async () => {
      throw new Error("offline",);
    };
    await profiles.selectProfile("p2",);
    expect(profiles.selectedProfile!.id,).toBe("keep",);
  });

  test("clearSelection resets the detail and inline edit state", () => {
    profiles.selectedProfile = { id: "p1", name: "P", templates: {}, } as unknown as ProfileDetail;
    profiles.clearSelection.call(profiles as never,);
    expect(profiles.selectedProfile,).toBeNull();
  });
});

describe("adminTemplates.profiles.deleteProfile", () => {
  test("DELETEs and reloads the list on success", async () => {
    handler = async (_url, opts,) =>
      opts?.method === "DELETE" ? Response.json({},) : Response.json(listPayload,);
    await profiles.deleteProfile("p9",);
    const del = calls.find((c,) => c.opts.method === "DELETE",)!;
    expect(del.url,).toBe("/api/admin/templates/p9",);
    expect(toasts[0]!.type,).toBe("success",);
    expect(calls.some((c,) => c.url === "/api/admin/templates",),).toBe(true,);
  });

  test("surfaces the server error on failure", async () => {
    handler = async () => Response.json({ error: "in use", }, { status: 409, },);
    await profiles.deleteProfile("p9",);
    expect(toasts,).toEqual([{ type: "error", message: "in use", },],);
  });

  test("falls back to a generic message and tolerates network errors", async () => {
    handler = async () => Response.json({}, { status: 500, },);
    await profiles.deleteProfile("p9",);
    expect(toasts[0]!.type,).toBe("error",);
    handler = async () => {
      throw new Error("offline",);
    };
    await profiles.deleteProfile("p9",);
    expect(toasts[1]!.type,).toBe("error",);
  });
});

describe("adminTemplates.profiles.createProfile", () => {
  test("refuses to submit without id or name", async () => {
    await profiles.createProfile();
    profiles.newProfile.id = "only-id";
    await profiles.createProfile();
    expect(calls,).toEqual([],);
  });

  test("POSTs trimmed families, resets the form and reloads the list", async () => {
    handler = async (_url, opts,) =>
      opts?.method === "POST" ? Response.json({},) : Response.json(listPayload,);
    profiles.newProfile = { id: "mine", name: "Mine", families: " a , b ,, c ", promptFormat: "tags", maxTokenHint: 200, };
    profiles.showCreateModal = true;
    await profiles.createProfile();
    const post = calls.find((c,) => c.opts.method === "POST",)!;
    expect(post.url,).toBe("/api/admin/templates",);
    expect(JSON.parse(String(post.opts.body,),),).toEqual({
      id: "mine",
      name: "Mine",
      families: ["a", "b", "c",],
      promptFormat: "tags",
      maxTokenHint: 200,
    },);
    expect(toasts[0]!.type,).toBe("success",);
    expect(profiles.showCreateModal,).toBe(false,);
    expect(profiles.newProfile,).toEqual({ id: "", name: "", families: "", promptFormat: "tags", maxTokenHint: 150, },);
    expect(calls.some((c,) => c.url === "/api/admin/templates" && !c.opts.method,),).toBe(true,);
  });

  test("surfaces the server error on rejection", async () => {
    handler = async (_url, opts,) =>
      opts?.method === "POST" ? Response.json({ error: "duplicate", }, { status: 400, },) : Response.json({},);
    profiles.newProfile = { id: "x", name: "X", families: "", promptFormat: "tags", maxTokenHint: 150, };
    await profiles.createProfile();
    expect(toasts,).toEqual([{ type: "error", message: "duplicate", },],);
    expect(profiles.showCreateModal,).toBe(false,);
  });

  test("falls back to a generic message and tolerates network errors", async () => {
    handler = async (_url, opts,) =>
      opts?.method === "POST" ? Response.json({}, { status: 500, },) : Response.json({},);
    profiles.newProfile = { id: "x", name: "X", families: "", promptFormat: "tags", maxTokenHint: 150, };
    await profiles.createProfile();
    expect(toasts[0]!.type,).toBe("error",);
    handler = async () => {
      throw new Error("offline",);
    };
    await profiles.createProfile();
    expect(toasts[1]!.type,).toBe("error",);
  });
});
