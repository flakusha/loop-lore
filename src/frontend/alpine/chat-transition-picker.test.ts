// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Behavior tests for the header transition-mode picker
 * (TASK-chat-feature-location-transition-transfer remainder: AC1 mode
 * chooser + AC6 header affordance): toggle/load mirroring, in-place reuse,
 * migrate carry presets per mode, template gating, and failure paths.
 */
import "./i18n.test-helper";
import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import type { ApiFetchMock, Toast, } from "../tests/test-types";
import { transitionPicker, } from "./chat-transition-picker";

// ── Mock ./htmx (must precede importing ./chat-transition-picker) ──
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: (async (url: string, opts?: RequestInit,) => {
      calls.push({ url, opts: opts ?? {}, },);
      return handler(url, opts,);
    }) satisfies ApiFetchMock,
  }),);
}

interface PickerCtx {
  activeChat: string | null;
  _locations: { id: string; name: string; description: string | null }[];
  _selectedLocationId: string;
  _chatCurrentLocationId: string | null;
  toasts: Toast[];
  loadCalls: number;
  changeCalls: number;
  selected: string[];
  $dispatch?: (event: string, detail?: unknown,) => void;
}

/**
 * Build a chat-state stub with spy counters for the location machinery.
 * @param overrides
 * @returns Test context
 */
function buildCtx(overrides?: Partial<PickerCtx>,): PickerCtx {
  const ctx: PickerCtx = {
    activeChat: "c1",
    _locations: [
      { id: "loc1", name: "Town", description: null, },
      { id: "loc2", name: "Forest", description: null, },
    ],
    _selectedLocationId: "loc1",
    _chatCurrentLocationId: "loc1",
    toasts: [],
    loadCalls: 0,
    changeCalls: 0,
    selected: [],
    $dispatch: (event, detail,) => {
      if (event === "show-toast") {
        ctx.toasts.push(detail as Toast,);
      }
    },
    ...overrides,
  };

  const wired = ctx as PickerCtx & Record<string, unknown>;
  wired.loadLocations = async () => {
    ctx.loadCalls++;
  };

  wired.changeChatLocation = async () => {
    ctx.changeCalls++;
  };

  wired.selectChat = async (id: string,) => {
    ctx.selected.push(id,);
  };

  return ctx;
}

let ui: Record<string, unknown>;

beforeEach(() => {
  ui = {
    showTransitionPicker: false,
    transitionDestinationId: "",
    transitionLocations: [],
    transitionBusy: false,
  };

  (globalThis as Record<string, unknown>).Alpine = {
    store: () => ui,
    $data: () => ({}),
  };
},);

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
  delete (globalThis as Record<string, unknown>).Alpine;
},);

describeOrSkip("transitionPicker.toggleTransitionPicker", () => {
  test("opens, loads locations, and mirrors them into $store.ui", async () => {
    const ctx = buildCtx();
    await transitionPicker.toggleTransitionPicker!.call(ctx as never,);

    expect(ui.showTransitionPicker,).toBe(true,);
    expect(ctx.loadCalls,).toBe(1,);
    expect(ui.transitionLocations,).toEqual([
      { id: "loc1", name: "Town", },
      { id: "loc2", name: "Forest", },
    ],);

    expect(ui.transitionDestinationId,).toBe("loc1",);
  });

  test("second call closes without reloading", async () => {
    const ctx = buildCtx();
    await transitionPicker.toggleTransitionPicker!.call(ctx as never,);
    await transitionPicker.toggleTransitionPicker!.call(ctx as never,);

    expect(ui.showTransitionPicker,).toBe(false,);
    expect(ctx.loadCalls,).toBe(1,);
  });

  test("closes immediately when no chat is active", async () => {
    const ctx = buildCtx({ activeChat: null, },);
    await transitionPicker.toggleTransitionPicker!.call(ctx as never,);

    expect(ui.showTransitionPicker,).toBe(false,);
    expect(ctx.loadCalls,).toBe(0,);
  });
},);

describeOrSkip("transitionPicker.runLocationTransition", () => {
  test("no destination: info toast, no work done", async () => {
    const ctx = buildCtx();
    await transitionPicker.runLocationTransition!.call(ctx as never, "in-place",);

    expect(ctx.toasts[0],).toMatchObject({ type: "info", message: "Pick a destination location first.", },);
    expect(ctx.changeCalls,).toBe(0,);
    expect(calls,).toEqual([],);
  });

  test("in-place delegates to changeChatLocation and closes the picker", async () => {
    const ctx = buildCtx();
    ui.transitionDestinationId = "loc2";

    await transitionPicker.runLocationTransition!.call(ctx as never, "in-place",);

    expect(ctx._selectedLocationId,).toBe("loc2",);
    expect(ctx.changeCalls,).toBe(1,);
    expect(calls,).toEqual([],); // the PUT happens inside changeChatLocation (existing code)
    expect(ui.showTransitionPicker,).toBe(false,);
    expect(ui.transitionBusy,).toBe(false,);
  });

  test("new-chat: migrate (continuity carry, no log) → set destination → switch", async () => {
    const ctx = buildCtx();
    ui.transitionDestinationId = "loc2";
    handler = async (url, opts,) => {
      if (url === "/api/v1/chats/c1" && !opts?.method) {
        return Response.json({ template_id: "tmpl-1", },);
      }

      if (url === "/api/v1/chats/c1/migrate") {
        return Response.json({ newChatId: "c2", sourceChatId: "c1", }, { status: 201, },);
      }

      if (url === "/api/v1/chats/c2/location") {
        return Response.json({ ok: true, },);
      }

      return Response.json({}, { status: 404, },);
    };

    await transitionPicker.runLocationTransition!.call(ctx as never, "new-chat",);

    expect(calls,).toHaveLength(3,);
    expect(calls[1]?.url,).toBe("/api/v1/chats/c1/migrate",);
    expect(JSON.parse(calls[1]?.opts.body as string,),).toEqual({
      templateId: "tmpl-1",
      carry: { participants: true, memory: true, worldState: true, state: true, },
    },);

    expect(calls[2]?.url,).toBe("/api/v1/chats/c2/location",);
    expect(JSON.parse(calls[2]?.opts.body as string,),).toEqual({ locationId: "loc2", },);
    expect(ctx.selected,).toEqual(["c2",],);
    expect(ctx.toasts.at(-1,),).toMatchObject({ type: "success", message: "New chat created at the destination.", },);
    expect(ui.showTransitionPicker,).toBe(false,);
    expect(ui.transitionBusy,).toBe(false,);
  });

  test("isolate: migrate carries the full history + sections + state", async () => {
    const ctx = buildCtx();
    ui.transitionDestinationId = "loc2";
    handler = async (url, opts,) => {
      if (url === "/api/v1/chats/c1" && !opts?.method) {
        return Response.json({ template_id: "tmpl-1", },);
      }

      if (url === "/api/v1/chats/c1/migrate") {
        return Response.json({ newChatId: "c3", }, { status: 201, },);
      }

      return Response.json({ ok: true, },);
    };

    await transitionPicker.runLocationTransition!.call(ctx as never, "isolate",);

    expect(JSON.parse(calls[1]?.opts.body as string,),).toEqual({
      templateId: "tmpl-1",
      carry: { history: "full", location: true, state: true, pins: true, memory: true, },
    },);

    expect(ctx.selected,).toEqual(["c3",],);
    expect(ctx.toasts.at(-1,),).toMatchObject({
      type: "success",
      message: "Context isolated — you are now at the destination.",
    },);
  });

  test("template-less chat: error toast, migrate never called", async () => {
    const ctx = buildCtx();
    ui.transitionDestinationId = "loc2";
    handler = async () => Response.json({ template_id: null, },);

    await transitionPicker.runLocationTransition!.call(ctx as never, "isolate",);

    expect(calls,).toHaveLength(1,);
    expect(ctx.toasts.at(-1,),).toMatchObject({
      type: "error",
      message: "This chat has no setup template — only an in-place move is possible.",
    },);

    expect(ui.transitionBusy,).toBe(false,);
  });

  test("migrate failure surfaces an error and resets busy", async () => {
    const ctx = buildCtx();
    ui.showTransitionPicker = true;
    ui.transitionDestinationId = "loc2";
    handler = async (url, opts,) =>
      url === "/api/v1/chats/c1" && !opts?.method
        ? Response.json({ template_id: "tmpl-1", },)
        : Response.json({ error: "bad", }, { status: 400, },);

    await transitionPicker.runLocationTransition!.call(ctx as never, "new-chat",);

    expect(calls,).toHaveLength(2,);
    expect(ctx.selected,).toEqual([],);
    expect(ctx.toasts.at(-1,),).toMatchObject({ type: "error", message: "Location transition failed.", },);
    expect(ui.transitionBusy,).toBe(false,);
    expect(ui.showTransitionPicker,).toBe(true,); // stays open for a retry
  });
},);
