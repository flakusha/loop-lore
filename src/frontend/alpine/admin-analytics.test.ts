import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { adminAnalytics, } from "./admin-analytics";

const globalState = globalThis as unknown as {
  apiFetch?: (url: string, opts?: RequestInit,) => Promise<Response>;
  showToast?: (type: string, message: string,) => void;
};
const originalFetch = globalState.apiFetch;
const originalToast = globalState.showToast;
let handler: (url: string,) => Promise<Response> = () => Response.json({},);
let toasts: { type: string; message: string }[] = [];

beforeEach(() => {
  toasts = [];
  handler = () => Response.json({},);
  globalState.apiFetch = (url,) => handler(url,);
  globalState.showToast = (type, message,) => {
    toasts.push({ type, message, },);
  };
},);

afterEach(() => {
  globalState.apiFetch = originalFetch;
  globalState.showToast = originalToast;
},);

/** Fresh copy of the slice so mutations don't leak between tests. */
function makeState() {
  return {
    ...adminAnalytics,
    dailyStats: [] as { count: number; active_users: number; date: string }[],
    errorEvents: [],
    analyticsCharacters: [],
    analyticsDailyBars: [],
    analyticsLatencyBars: [],
    analyticsRoleSegments: [],
    conversationOverview: {
      ...adminAnalytics.conversationOverview,
      tokensByRole: { user: 0, assistant: 0, system: 0, },
      latencyBuckets: [],
      topChats: [],
    },
  };
}

function routeResponses(): void {
  handler = (url,) => {
    if (url.startsWith("/api/v1/telemetry/analytics/summary",)) {
      return Response.json({ total: 5, distinct_sessions: 2, distinct_users: 1, },);
    }
    if (url.startsWith("/api/v1/telemetry/analytics/daily",)) {
      return Response.json([
        { date: "2026-10-01", count: 3, active_users: 1, },
        { date: "2026-10-02", count: 6, active_users: 2, },
      ],);
    }
    if (url.startsWith("/api/v1/telemetry/analytics/errors",)) { return Response.json([],); }
    if (url.startsWith("/api/v1/telemetry/analytics/purge",)) { return Response.json({ ok: true, },); }
    if (url === "/api/analytics/overview") {
      return Response.json({
        totalMessages: 2,
        totalTokens: 300,
        tokensByRole: { user: 100, assistant: 200, system: 0, },
        averageSessionLength: 1,
        totalGenerations: 2,
        avgLatencyMs: 1000,
        latencyBuckets: [{ label: "<500ms", count: 1, }, { label: "500-1000ms", count: 2, },],
        costEstimate: 0,
        topChats: [],
      },);
    }
    if (url === "/api/analytics/characters") {
      return Response.json({
        characters: [{
          id: "c1",
          name: "Char A",
          totalMessages: 2,
          totalTokens: 200,
          avgResponseLength: 14,
          tokensPerMessage: 100,
        },],
      },);
    }
    return new Response("", { status: 404, },);
  };
}

describe("adminAnalytics.loadAnalytics", () => {
  test("projects overview, daily and character data into chart-ready bars", async () => {
    const state = makeState();
    routeResponses();
    await state.loadAnalytics();

    expect(state.analyticsSummary.total,).toBe(5,);
    // Role segments sum to the role token total; percentages round to 33/67.
    expect(state.analyticsRoleSegments.map((s,) => s.tokens),).toEqual([100, 200, 0,],);
    expect(state.analyticsRoleSegments.map((s,) => s.pct),).toEqual([33, 67, 0,],);
    // Daily bars scale to the busiest day (6 -> 100%, 3 -> 50%).
    expect(state.analyticsDailyBars.map((b,) => b.pct),).toEqual([50, 100,],);
    // Latency histogram scales to its own max (2 -> 100%, 1 -> 50%).
    expect(state.analyticsLatencyBars.map((b,) => b.pct),).toEqual([50, 100,],);
    expect(state.analyticsCharacters,).toHaveLength(1,);
    expect(state.analyticsCharacters[0]?.tokensPerMessage,).toBe(100,);
    expect(state.loadingAnalytics,).toBe(false,);
  });

  test("toasts and leaves chart state untouched when a request rejects", async () => {
    const state = makeState();
    routeResponses();
    const base = handler;
    handler = (url,) => url === "/api/analytics/characters" ? Promise.reject(new Error("offline",),) : base(url,);
    await state.loadAnalytics();
    expect(toasts,).toHaveLength(1,);
    expect(toasts[0]!.type,).toBe("error",);
    expect(state.loadingAnalytics,).toBe(false,);
    expect(state.analyticsCharacters,).toHaveLength(0,);
  });
});

describe("adminAnalytics.purgeAnalytics", () => {
  test("toasts success and reloads analytics", async () => {
    const state = makeState();
    routeResponses();
    await state.purgeAnalytics();
    expect(toasts.some((toast,) => toast.type === "success"),).toBe(true,);
    expect(state.purgingAnalytics,).toBe(false,);
  });

  test("toasts the server message when the purge fails", async () => {
    const state = makeState();
    routeResponses();
    const base = handler;
    handler = (url,) =>
      url.startsWith("/api/v1/telemetry/analytics/purge",)
        ? Response.json({ message: "nope", }, { status: 500, },)
        : base(url,);
    await state.purgeAnalytics();
    expect(toasts,).toEqual([{ type: "error", message: "nope", },],);
    expect(state.purgingAnalytics,).toBe(false,);
  });
});
