// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the world creation wizard state (TASK-world-dashboard).
 *
 * The real en.json catalog is installed first so t() assertions resolve to
 * English strings rather than raw key paths.
 */
import "./i18n.test-helper";
import { beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import {
  buildWorldCreateWizard,
  stepLabel,
  WIZARD_STEPS,
  type WorldCreateWizardState,
} from "./world-create-wizard";

// ── Mock ./htmx (must precede importing ./world-create-wizard) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({ id: "w-new", },);

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: ((url: string, opts?: RequestInit,) => {
      calls.push({ url, opts: opts ?? {}, },);
      return handler(url, opts,);
    }) satisfies ApiFetchMock,
  }),);
}

let assignedUrl = "";

beforeEach(() => {
  calls = [];
  assignedUrl = "";
  handler = async () => Response.json({ id: "w-new", },);
  const globals = globalThis as unknown as { location: { assign(url: string,): void } };
  globals.location = {
    assign(url: string,) {
      assignedUrl = url;
    },
  };
},);

describeOrSkip("world creation wizard", () => {
  test("starts on the first step with four declared steps", () => {
    const w = buildWorldCreateWizard();
    expect(w.step,).toBe(0,);
    expect(WIZARD_STEPS.length,).toBe(4,);
  });

  test("refuses to leave step 1 without a name", () => {
    const w = buildWorldCreateWizard();
    w.next();
    expect(w.step,).toBe(0,);
    expect(w.error,).toBe("A world name is required.",);
  });

  test("walks forward and back across every step without overshooting", () => {
    const w = buildWorldCreateWizard();
    w.name = "A Realm";
    w.next();
    w.next();
    w.next();
    expect(w.step,).toBe(3,);
    w.next();
    expect(w.step,).toBe(3,);

    w.back();
    w.back();
    w.back();
    w.back();
    expect(w.step,).toBe(0,);
  });

  test("queues and removes locations, ignoring blank names", () => {
    const w = buildWorldCreateWizard();
    w.locationName = "  ";
    w.addLocation();
    expect(w.locations.length,).toBe(0,);

    w.locationName = " Dark Forest ";
    w.addLocation();
    expect(w.locations,).toEqual([{ name: "Dark Forest", },],);
    expect(w.locationName,).toBe("",);

    w.removeLocation(0,);
    expect(w.locations.length,).toBe(0,);
  });

  test("create posts the world then each queued location, then navigates", async () => {
    const w: WorldCreateWizardState = buildWorldCreateWizard();
    w.name = "  Test World  ";
    w.description = "desc";
    w.kind = "rpg";
    w.visibility = "private";
    w.locations = [{ name: "Tavern", }, { name: "Cave", },];

    await w.create();

    expect(calls.map((c,) => c.url),).toEqual([
      "/api/v1/worlds",
      "/api/v1/worlds/w-new/locations",
      "/api/v1/worlds/w-new/locations",
    ],);

    expect(calls.every((c,) => c.opts.method === "POST"),).toBe(true,);
    expect(String(calls[0].opts.body,),).toContain(`"name":"Test World"`,);
    expect(assignedUrl,).toBe("/worlds/w-new/edit",);
    expect(w.busy,).toBe(false,);
  });

  test("keeps the world and navigates when a location create fails", async () => {
    handler = async (url,) =>
      url === "/api/v1/worlds"
        ? Response.json({ id: "w-new", },)
        : new Response(JSON.stringify({ error: "bad", },), { status: 400, },);

    const w = buildWorldCreateWizard();
    w.name = "Test World";
    w.locations = [{ name: "Rejected", },];

    await w.create();

    // The world POST succeeded, so the user keeps their world and lands on it.
    expect(w.error,).toBe("",);
    expect(assignedUrl,).toBe("/worlds/w-new/edit",);
  });

  test("surfaces the server error and does not navigate when the world POST fails", async () => {
    handler = async () => Response.json({ error: "name taken", }, { status: 400, },);
    const w = buildWorldCreateWizard();
    w.name = "Test World";

    await w.create();

    expect(w.error,).toBe("name taken",);
    expect(assignedUrl,).toBe("",);
    expect(w.busy,).toBe(false,);
  });

  test("falls back to the generic message when the failure body has no error field", async () => {
    handler = async () => Response.json({}, { status: 500, },);
    const w = buildWorldCreateWizard();
    w.name = "Test World";

    await w.create();

    expect(w.error,).toBe("Failed to create world",);
  });

  test("create with a blank name short-circuits back to step 1", async () => {
    const w = buildWorldCreateWizard();
    w.step = 2;

    await w.create();

    expect(w.step,).toBe(0,);
    expect(w.error,).toBe("A world name is required.",);
    expect(calls.length,).toBe(0,);
  });

  test("stepLabel resolves each step and is empty past the last", () => {
    expect(stepLabel(0,),).toBe("Name & style",);
    expect(stepLabel(1,),).toBe("Conditions",);
    expect(stepLabel(2,),).toBe("First locations",);
    expect(stepLabel(3,),).toBe("Review",);
    expect(stepLabel(4,),).toBe("",);
  });
},);
