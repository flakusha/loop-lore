// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for tui/models-api.ts and tui/models-overlay.ts — the admin models
 * surface.
 *
 * The API layer is driven through its own `setFetch` seam rather than
 * `mock.module`, which leaks across files in a shared bun process.
 *
 * `ModelsOverlay` is built from `ModelsOverlay.prototype` with hand-injected
 * widget stubs instead of `new ModelsOverlay(screen)`: the real constructor
 * calls blessed.box/list/text, which need a live screen. Same approach as
 * chat-picker.test.ts and asset-view.test.ts, and because no `mock.module` is
 * involved these tests RUN in a plain shared `bun test src/tui/` rather than
 * sitting behind the ISOLATED gate.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { safeFetch, } from "../utils";
import type { FetchResult, SafeFetchOptions, } from "../utils/safe-fetch/types";
import {
  ADMIN_ONLY,
  assignRole,
  clearRole,
  loadProviderModels,
  loadProviders,
  loadPublicProviders,
  loadRoles,
  rescanProviders,
  setFetch,
  testProviderConnection,
} from "./models-api";
import type { RolesEnvelope, } from "./models-api";
import { formatConnectionTest, formatProviderHealth, HEALTH_UNAVAILABLE, } from "./models-display";
import { ModelsOverlay, } from "./models-overlay";

interface RecordedCall {
  url: string;
  options: SafeFetchOptions;
}

const calls: RecordedCall[] = [];
const realFetch = safeFetch;

beforeEach(() => {
  calls.length = 0;
},);

afterEach(() => {
  setFetch(realFetch,);
},);

/**
 * Install a stub answering every call with `payload`.
 * @param payload - value placed in the success envelope's `data`
 */
function stubClient(payload: unknown,): void {
  setFetch(<T,>(url: string, options?: SafeFetchOptions,): Promise<FetchResult<T>> => {
    calls.push({ url, options: options ?? {}, },);
    return Promise.resolve({
      ok: true,
      data: payload as T,
      status: 200,
      headers: new Headers(),
    },);
  },);
}

/** Install a stub answering every call with a 403, as a non-admin would get. */
function stubForbidden(): void {
  setFetch(<T,>(url: string, options?: SafeFetchOptions,): Promise<FetchResult<T>> => {
    calls.push({ url, options: options ?? {}, },);
    return Promise.resolve({
      ok: false,
      error: new Error("forbidden",),
      status: 403,
      headers: new Headers(),
    },);
  },);
}

const ROLES: RolesEnvelope = {
  roles: [
    { role: "main", provider: "openai", model: "gpt-4o", source: "db", },
    { role: "auxiliary", provider: "ollama", model: "llama-3.1-70b", source: "config", },
  ],
  overrides: {},
  validRoles: ["main", "auxiliary", "captioning", "classifier",],
};

describe("models api", () => {
  it("loads roles from the v1 admin path with the bearer token", async () => {
    stubClient(ROLES,);
    const result = await loadRoles("tok-1",);

    expect(result,).toEqual({ ok: true, data: ROLES, },);
    expect(calls[0]?.url,).toBe("http://localhost:3000/api/v1/admin/model-roles",);
    expect(calls[0]?.options.auth,).toEqual({ sessionToken: "tok-1", },);
  });

  it("omits auth entirely when no token is supplied", async () => {
    stubClient(ROLES,);
    await loadRoles(undefined,);
    expect(calls[0]?.options.auth,).toBeUndefined();
  });

  it("maps a 403 to the admin-only line rather than a bare status code", async () => {
    stubForbidden();
    const result = await loadRoles("tok-1",);
    expect(result,).toEqual({ ok: false, error: ADMIN_ONLY, status: 403, },);
  });

  it("reports a thrown transport error instead of rejecting", async () => {
    setFetch(() => Promise.reject(new Error("ECONNREFUSED",),));
    expect(await loadRoles(undefined,),).toEqual({ ok: false, error: "ECONNREFUSED", },);
  });

  it("url-escapes the provider name in the models path", async () => {
    stubClient({ name: "a b", label: "A B", models: [], status: "healthy", },);
    await loadProviderModels({ provider: "a b", sessionToken: undefined, },);
    expect(calls[0]?.url,).toBe("http://localhost:3000/api/v1/admin/providers/a%20b/models",);
  });

  it("PUTs provider and model only, leaving tuning to the web client", async () => {
    stubClient({ ok: true, },);
    await assignRole({ role: "main", provider: "openai", model: "gpt-4o", sessionToken: "t", },);

    expect(calls[0]?.options.method,).toBe("PUT",);
    expect(calls[0]?.options.body,).toEqual({ provider: "openai", model: "gpt-4o", },);
    expect(calls[0]?.url,).toBe("http://localhost:3000/api/v1/admin/model-roles/main",);
  });

  it("DELETEs the role to clear its override", async () => {
    stubClient(undefined,);
    await clearRole({ role: "main", sessionToken: "t", },);
    expect(calls[0]?.options.method,).toBe("DELETE",);
    expect(calls[0]?.url,).toBe("http://localhost:3000/api/v1/admin/model-roles/main",);
  });

  it("POSTs the rescan endpoint", async () => {
    stubClient({ providers: [], },);
    await rescanProviders(undefined,);
    expect(calls[0]?.options.method,).toBe("POST",);
    expect(calls[0]?.url,).toBe("http://localhost:3000/api/v1/admin/providers/rescan",);
  });

  it("loads providers from the v1 admin path", async () => {
    stubClient({ providers: [], },);
    await loadProviders(undefined,);
    expect(calls[0]?.url,).toBe("http://localhost:3000/api/v1/admin/providers",);
  });

  // The PUBLIC list is the one route in this module with no auth middleware,
  // so it must not carry a bearer token even when one is available.
  it("loads the public provider list without auth", async () => {
    stubClient({ providers: [], },);
    await loadPublicProviders();
    expect(calls[0]?.url,).toBe("http://localhost:3000/api/v1/providers",);
    expect(calls[0]?.options.auth,).toBeUndefined();
  });

  it("POSTs the connection ping with the provider name in the body", async () => {
    stubClient({ ok: true, status: "ok", latencyMs: 12, },);
    const result = await testProviderConnection({ provider: "ollama", sessionToken: "tok", },);

    expect(result,).toEqual({ ok: true, data: { ok: true, status: "ok", latencyMs: 12, }, },);
    expect(calls[0]?.options.method,).toBe("POST",);
    expect(calls[0]?.options.body,).toEqual({ provider: "ollama", },);
    expect(calls[0]?.options.auth,).toEqual({ sessionToken: "tok", },);
  });

  // A DOWN provider answers HTTP 200 with ok:false. Treating the envelope's
  // ok as the verdict would report an outage as a success.
  it("keeps a failed health check distinguishable from a failed request", async () => {
    stubClient({ ok: false, status: "down", error: "connection refused", },);
    const result = await testProviderConnection({ provider: "ollama", sessionToken: undefined, },);
    expect(result,).toEqual({
      ok: true,
      data: { ok: false, status: "down", error: "connection refused", },
    },);
  });

  // The ping needs requireUserId, not admin.system, so an anonymous caller
  // gets a 401 the caller must render rather than a crash.
  it("reports a 401 from the ping instead of throwing", async () => {
    stubForbidden();
    expect(await testProviderConnection({ provider: "ollama", sessionToken: undefined, },),).toEqual({
      ok: false,
      error: ADMIN_ONLY,
      status: 403,
    },);
  });
});

describe("status bar health segment", () => {
  it("shows a bare count when every provider is reachable", () => {
    const segment = formatProviderHealth([
      { name: "openai", label: "OpenAI", status: "healthy", },
      { name: "ollama", label: "Ollama", status: "healthy", },
    ],);

    expect(segment,).toBe("Providers: {green-fg}2{/green-fg}/2 ok",);
  });

  it("names the unreachable providers so an outage is actionable", () => {
    const segment = formatProviderHealth([
      { name: "openai", label: "OpenAI", status: "healthy", },
      { name: "ollama", label: "Ollama", status: "unreachable", },
    ],);

    expect(segment,).toContain("/2 ok",);
    expect(segment,).toContain("ollama",);
    expect(segment,).not.toContain("openai",);
  });

  it("caps the names it lists rather than overflowing the bar", () => {
    const segment = formatProviderHealth([
      { name: "a", label: "A", status: "down", },
      { name: "b", label: "B", status: "down", },
      { name: "c", label: "C", status: "down", },
      { name: "d", label: "D", status: "down", },
    ],);

    expect(segment,).toContain("+1",);
    expect(segment,).not.toContain("d,",);
  });

  it("degrades to the unknown marker when the route returns nothing", () => {
    expect(formatProviderHealth([],),).toBe(HEALTH_UNAVAILABLE,);
  });

  it("renders a healthy ping with its latency", () => {
    expect(formatConnectionTest({ ok: true, status: "ok", latencyMs: 42, },),).toBe(
      "{green-fg}ok{/green-fg} 42ms",
    );
  });

  it("prefers the provider's own error over the bare status word", () => {
    expect(formatConnectionTest({ ok: false, status: "down", error: "refused", },),).toBe(
      "{red-fg}refused{/red-fg}",
    );
  });
});

// ── Widget stubs ────────────────────────────────────────────────────────

interface ListStub {
  items: string[];
  content: string;
  selected: number;
  setItems(items: string[],): void;
  setContent(content: string,): void;
  focus(): void;
  select(index: number,): void;
}

interface LabelStub {
  content: string;
  setContent(content: string,): void;
}

/**
 * The overlay as the tests drive it: real prototype methods plus the private
 * fields they read, bound to stubs. One `unknown` hop on the way in, because
 * intersecting the class with a bag of same-named private fields collapses to
 * `never`.
 */
interface OverlayUnderTest {
  screen: { renders: number; render(): void };
  box: { shown: boolean; show(): void; hide(): void };
  list: ListStub;
  statusLabel: LabelStub;
  sessionToken: string | undefined;
  visible: boolean;
  level: "roles" | "providers" | "models";
  roles: RolesEnvelope["roles"];
  providers: Array<{ name: string; label: string; status: string; modelCount: number }>;
  modelIds: string[];
  targetRole: string | undefined;
  targetProvider: string | undefined;
  show(): void;
  hide(): void;
  dismiss(): boolean;
  isVisible(): boolean;
  cursor: number;
  refreshRoles(): Promise<void>;
  moveCursor(delta: number,): void;
  onSelect(index: number,): Promise<void>;
  onClear(): Promise<void>;
  onRescan(): Promise<void>;
  onPing(): Promise<void>;
}

/** Build an overlay without running its blessed constructor. */
function buildOverlay(sessionToken?: string,): OverlayUnderTest {
  const overlay = Object.create(ModelsOverlay.prototype,) as unknown as OverlayUnderTest;
  overlay.screen = {
    renders: 0,
    render(): void {
      this.renders++;
    },
  };

  overlay.box = {
    shown: false,
    show(): void {
      this.shown = true;
    },
    hide(): void {
      this.shown = false;
    },
  };

  overlay.list = {
    items: [],
    content: "",
    selected: 0,
    setItems(items: string[],): void {
      this.items = items;
    },
    setContent(content: string,): void {
      this.content = content;
    },
    focus(): void {/* no-op */},
    select(index: number,): void {
      this.selected = index;
    },
  };

  overlay.statusLabel = {
    content: "",
    setContent(content: string,): void {
      this.content = content;
    },
  };

  overlay.sessionToken = sessionToken;
  overlay.visible = false;
  overlay.level = "roles";
  overlay.cursor = 0;
  overlay.roles = [];
  overlay.providers = [];
  overlay.modelIds = [];
  overlay.targetRole = undefined;
  overlay.targetProvider = undefined;
  return overlay;
}

describe("ModelsOverlay", () => {
  it("shows hidden and reports visibility for dismiss", () => {
    const overlay = buildOverlay();
    expect(overlay.isVisible(),).toBe(false,);
    expect(overlay.dismiss(),).toBe(false,);
  });

  it("dismisses only when visible, so Esc does not quit the shell", () => {
    const overlay = buildOverlay();
    overlay.visible = true;
    expect(overlay.dismiss(),).toBe(true,);
    expect(overlay.isVisible(),).toBe(false,);
  });

  it("renders every role with its source, which is the point of the surface", async () => {
    stubClient(ROLES,);
    const overlay = buildOverlay("tok",);
    await overlay.refreshRoles();

    expect(overlay.list.items,).toHaveLength(2,);
    expect(overlay.list.items[0],).toContain("main",);
    expect(overlay.list.items[0],).toContain("openai / gpt-4o",);
    expect(overlay.list.items[0],).toContain("[db]",);
    expect(overlay.list.items[1],).toContain("[config]",);
  });

  it("drills role -> providers -> models and commits a PUT", async () => {
    stubClient({ providers: [{ name: "openai", label: "OpenAI", status: "healthy", modelCount: 2, },], },);
    const overlay = buildOverlay("tok",);
    overlay.roles = ROLES.roles;
    await overlay.onSelect(0,);
    expect(overlay.level,).toBe("providers",);
    expect(overlay.targetRole,).toBe("main",);

    setFetch(<T,>(): Promise<FetchResult<T>> =>
      Promise.resolve({
        ok: true,
        data: { name: "openai", label: "OpenAI", models: [{ id: "gpt-4o", },], status: "healthy", } as T,
        status: 200,
        headers: new Headers(),
      },)
    );

    await overlay.onSelect(0,);
    expect(overlay.level,).toBe("models",);

    setFetch(<T,>(): Promise<FetchResult<T>> =>
      Promise.resolve({ ok: true, data: { ok: true, } as T, status: 200, headers: new Headers(), },)
    );

    await overlay.onSelect(0,);
    // Committed: the PUT landed and the overlay fell back to the roles level.
    expect(overlay.level,).toBe("roles",);
  });

  it("shows provider health, model count and latency in the provider list", async () => {
    stubClient(
      {
        providers: [
          { name: "openai", label: "OpenAI", status: "healthy", modelCount: 3, latencyMs: 120, },
          { name: "ollama", label: "Ollama", status: "unreachable", modelCount: 0, error: "refused", },
        ],
      },
    );

    const overlay = buildOverlay("tok",);
    overlay.roles = ROLES.roles;
    await overlay.onSelect(0,);

    expect(overlay.list.items[0],).toContain("healthy",);
    expect(overlay.list.items[0],).toContain("3 model(s)",);
    expect(overlay.list.items[0],).toContain("120ms",);
    expect(overlay.list.items[1],).toContain("unreachable",);
    expect(overlay.list.items[1],).toContain("refused",);
  });

  it("degrades a 403 to the admin-only line instead of an error", async () => {
    stubForbidden();
    const overlay = buildOverlay("tok",);
    overlay.roles = ROLES.roles;
    await overlay.onSelect(0,);

    expect(overlay.list.content,).toContain(ADMIN_ONLY,);
    expect(overlay.list.content,).not.toContain("HTTP 403",);
  });

  // The list runs with blessed's own keys off, so `cursor` is the only
  // selection state Enter and `c` read. If these drift apart the highlight
  // stops matching the row a keystroke acts on — the bug they pin.
  it("moves the cursor and pushes the highlight along with it", () => {
    const overlay = buildOverlay();
    overlay.roles = ROLES.roles;

    overlay.moveCursor(1,);
    expect(overlay.cursor,).toBe(1,);
    expect(overlay.list.selected,).toBe(1,);

    overlay.moveCursor(-1,);
    expect(overlay.cursor,).toBe(0,);
    expect(overlay.list.selected,).toBe(0,);
  });

  it("clamps the cursor at both ends instead of reading off the list", () => {
    const overlay = buildOverlay();
    overlay.roles = ROLES.roles;

    overlay.moveCursor(-1,);
    expect(overlay.cursor,).toBe(0,);

    overlay.moveCursor(99,);
    expect(overlay.cursor,).toBe(1,);
  });

  it("ignores cursor movement when the level is empty", () => {
    const overlay = buildOverlay();
    overlay.roles = [];
    overlay.moveCursor(1,);
    expect(overlay.cursor,).toBe(0,);
  });

  it("clears the row under the cursor, not the first row", async () => {
    stubClient(ROLES,);
    const overlay = buildOverlay("tok",);
    overlay.roles = ROLES.roles;
    overlay.cursor = 1;

    await overlay.onClear();

    expect(calls[0]?.url,).toContain("auxiliary",);
  });

  it("clears the focused role's override and reloads", async () => {
    stubClient(ROLES,);
    const overlay = buildOverlay("tok",);
    overlay.roles = ROLES.roles;
    await overlay.onClear();
    expect(calls[0]?.options.method,).toBe("DELETE",);
    expect(overlay.level,).toBe("roles",);
  });

  it("pings the focused provider and shows the verdict", async () => {
    stubClient({ ok: true, status: "ok", latencyMs: 9, },);
    const overlay = buildOverlay("tok",);
    overlay.level = "providers";
    overlay.providers = [{ name: "ollama", label: "Ollama", status: "unreachable", modelCount: 0, },];

    await overlay.onPing();

    expect(calls[0]?.options.body,).toEqual({ provider: "ollama", },);
    expect(overlay.statusLabel.content,).toBe("{green-fg}ok{/green-fg} 9ms",);
  });

  // The envelope's ok is true even when the health check failed, so the verdict
  // has to be read off the body or an outage reads as a success.
  it("reports a down provider as a failure despite HTTP 200", async () => {
    stubClient({ ok: false, status: "down", error: "connection refused", },);
    const overlay = buildOverlay("tok",);
    overlay.level = "providers";
    overlay.providers = [{ name: "ollama", label: "Ollama", status: "unreachable", modelCount: 0, },];

    await overlay.onPing();

    expect(overlay.statusLabel.content,).toBe("{red-fg}connection refused{/red-fg}",);
  });

  // `p` is bound on the box at every level, so pressing it on a level with no
  // provider row must say something rather than silently do nothing.
  it("says where to press p instead of no-oping on other levels", async () => {
    stubClient(ROLES,);
    const overlay = buildOverlay("tok",);
    overlay.level = "roles";
    overlay.roles = ROLES.roles;

    await overlay.onPing();

    expect(calls.length,).toBe(0,);
    expect(overlay.statusLabel.content,).toBe("press p on a provider row",);
  });

  it("reports an empty provider level rather than pinging nothing", async () => {
    stubClient(ROLES,);
    const overlay = buildOverlay("tok",);
    overlay.level = "providers";
    overlay.providers = [];

    await overlay.onPing();

    expect(calls.length,).toBe(0,);
    expect(overlay.statusLabel.content,).toBe("no provider selected",);
  });

  it("rescans providers on request", async () => {
    stubClient({ providers: [], },);
    const overlay = buildOverlay("tok",);
    overlay.level = "providers";
    await overlay.onRescan();
    expect(calls[0]?.options.method,).toBe("POST",);
  });
});
