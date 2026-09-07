import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { healthPanelMethods, } from "./admin-health";

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
  globalState.apiFetch = (url, opts,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  };
  globalState.showToast = (type, message,) => {
    toasts.push({ type, message, },);
  };
},);

afterEach(() => {
  globalState.apiFetch = originalFetch;
  globalState.showToast = originalToast;
},);

/** Route health / aux / provider-model endpoints; unhandled 404. */
function routeResponses(opts?: {
  health?: unknown;
  healthStatus?: number;
  aux?: unknown;
  auxStatus?: number;
  providerModels?: Record<string, unknown>;
  providerModelsStatus?: number;
  rejectHealth?: boolean;
  rejectProviderModels?: boolean;
},): void {
  handler = async (url,) => {
    if (url === "/api/v1/health") {
      if (opts?.rejectHealth) { throw new Error("offline",); }
      return opts?.healthStatus
        ? new Response("", { status: opts.healthStatus, },)
        : Response.json(
          opts?.health ??
            { status: "ok", uptime: 99, timestamp: "ts-1", providers: [{ name: "p1", status: "up", },], },
        );
    }
    if (url.startsWith("/api/admin/telemetry/aux",)) {
      return opts?.auxStatus
        ? new Response("", { status: opts.auxStatus, },)
        : Response.json(opts?.aux ?? { aggregates: [{ task: "chat", },], events: [{ id: "e1", },], total: 7, },);
    }
    if (url.startsWith("/api/admin/providers/",)) {
      if (opts?.rejectProviderModels) { throw new Error("offline",); }
      const name = url.split("/",)[4];
      return opts?.providerModelsStatus
        ? new Response("", { status: opts.providerModelsStatus, },)
        : Response.json(opts?.providerModels?.[name ?? ""] ?? { models: [`models-${name}`,], },);
    }
    return new Response("", { status: 404, },);
  };
}

describe("healthPanelMethods.loadHealth", () => {
  test("loads aux telemetry, health and enriches providers with models", async () => {
    const panel = healthPanelMethods();
    routeResponses({},);
    await panel.loadHealth();
    expect(panel.healthStatus,).toBe("ok",);
    expect(panel.healthUptime,).toBe(99,);
    expect(panel.healthTimestamp,).toBe("ts-1",);
    expect(panel.healthProviders,).toEqual([{ name: "p1", status: "up", models: ["models-p1",], },],);
    expect(panel.auxAggregates,).toEqual([{ task: "chat", },] as never,);
    expect(panel.auxEvents,).toEqual([{ id: "e1", },] as never,);
    expect(panel.auxTotal,).toBe(7,);
    expect(panel.loadingHealth,).toBe(false,);
    expect(panel.loadingAuxTelemetry,).toBe(false,);
  });

  test("keeps the provider summary when model enrichment fails or 404s", async () => {
    const panel = healthPanelMethods();
    routeResponses({ providerModelsStatus: 404, },);
    await panel.loadHealth();
    expect(panel.healthProviders,).toEqual([{ name: "p1", status: "up", },],);
    const failing = healthPanelMethods();
    routeResponses({ rejectProviderModels: true, },);
    await failing.loadHealth();
    expect(failing.healthProviders,).toEqual([{ name: "p1", status: "up", },],);
  });

  test("leaves health state untouched on non-ok responses", async () => {
    const panel = healthPanelMethods();
    routeResponses({ healthStatus: 500, },);
    await panel.loadHealth();
    expect(panel.healthStatus,).toBe("unknown",);
    expect(panel.healthProviders,).toEqual([],);
    expect(panel.loadingHealth,).toBe(false,);
  });

  test("toasts an error when the health endpoint throws", async () => {
    const panel = healthPanelMethods();
    routeResponses({ rejectHealth: true, },);
    await panel.loadHealth();
    expect(toasts,).toHaveLength(1,);
    expect(toasts[0]!.type,).toBe("error",);
    expect(panel.loadingHealth,).toBe(false,);
  });
});

describe("healthPanelMethods.refreshHealthWithRescan", () => {
  test("triggers a rescan then reloads health with a success toast", async () => {
    const panel = healthPanelMethods();
    routeResponses({},);
    await panel.refreshHealthWithRescan();
    const post = calls.find((c,) => c.opts.method === "POST")!;
    expect(post.url,).toBe("/api/admin/providers/rescan",);
    expect(toasts[0]!.type,).toBe("success",);
    expect(panel.healthStatus,).toBe("ok",);
    expect(panel.loadingHealth,).toBe(false,);
  });

  test("toasts an error and resets the flag when the rescan throws", async () => {
    const panel = healthPanelMethods();
    handler = async () => {
      throw new Error("offline",);
    };
    await panel.refreshHealthWithRescan();
    expect(toasts[0]!.type,).toBe("error",);
    expect(panel.loadingHealth,).toBe(false,);
  });
});

describe("healthPanelMethods.loadAuxTelemetry", () => {
  test("keeps prior data on non-ok and swallows rejections", async () => {
    const panel = healthPanelMethods();
    routeResponses({ auxStatus: 500, },);
    await panel.loadAuxTelemetry();
    expect(panel.auxTotal,).toBe(0,);
    handler = async () => {
      throw new Error("offline",);
    };
    await panel.loadAuxTelemetry();
    expect(panel.loadingAuxTelemetry,).toBe(false,);
  });
});

describe("healthPanelMethods.toggleHealthAutoRefresh", () => {
  test("starts and stops the refresh interval", () => {
    const panel = healthPanelMethods();
    panel.toggleHealthAutoRefresh();
    expect(panel.healthAutoRefresh,).toBe(true,);
    expect(panel.healthRefreshInterval,).not.toBeNull();
    panel.toggleHealthAutoRefresh();
    expect(panel.healthAutoRefresh,).toBe(false,);
    expect(panel.healthRefreshInterval,).toBeNull();
    // Toggling off twice is safe.
    panel.toggleHealthAutoRefresh();
  });
});

describe("healthPanelMethods NSFW config", () => {
  test("loads the config on ok and keeps the default otherwise", async () => {
    const panel = healthPanelMethods();
    handler = async (url,) =>
      url === "/api/admin/nsfw"
        ? Response.json({ allowNsfw: false, nsfwMinAge: 21, },)
        : new Response("", { status: 404, },);
    await panel.loadNsfwConfig();
    expect(panel.nsfwConfig,).toEqual({ allowNsfw: false, nsfwMinAge: 21, },);
    handler = async () => new Response("", { status: 500, },);
    const stale = healthPanelMethods();
    await stale.loadNsfwConfig();
    expect(stale.nsfwConfig,).toEqual({ allowNsfw: true, nsfwMinAge: 18, },);
    handler = async () => {
      throw new Error("offline",);
    };
    await stale.loadNsfwConfig();
    expect(stale.loadingNsfw,).toBe(false,);
  });

  test("saveNsfwConfig PUTs and toasts each outcome", async () => {
    const panel = healthPanelMethods();
    handler = async (_url, opts,) => opts?.method === "PUT" ? Response.json({},) : new Response("", { status: 404, },);
    await panel.saveNsfwConfig();
    const put = calls.find((c,) => c.opts.method === "PUT")!;
    expect(put.url,).toBe("/api/admin/nsfw",);
    expect(JSON.parse(String(put.opts.body,),),).toEqual({ allowNsfw: true, nsfwMinAge: 18, },);
    expect(toasts[0]!.type,).toBe("success",);

    handler = async () => Response.json({ message: "invalid age", }, { status: 400, },);
    await panel.saveNsfwConfig();
    expect(toasts[1],).toEqual({ type: "error", message: "invalid age", },);

    handler = async () => Response.json({}, { status: 500, },);
    await panel.saveNsfwConfig();
    expect(toasts[2]!.type,).toBe("error",);

    handler = async () => {
      throw new Error("offline",);
    };
    await panel.saveNsfwConfig();
    expect(toasts[3]!.type,).toBe("error",);
  });
});
