// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `warnIfAccessFieldsAreInert` (loader.ts).
 *
 * In solo mode — `auth.required === false`, the app default — `authenticate`
 * resolves EVERY request to the `solo` super-user whose role holds `["*"]`.
 * So `requiresAuth` never denies and `permissions` never denies: a plugin
 * author relying on either gets false assurance. The loader surfaces that once,
 * aggregated, at boot. These tests pin both directions — it fires in solo mode
 * and stays silent when auth is actually required.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, setGlobalLogger, } from "../logger";
import type { Logger, } from "../logger";
import { loadAllPlugins, } from "./loader";
import { warnIfAccessFieldsAreInert, } from "./solo-mode-warning";
import { registry, } from "./registry";

const priorLogger = getLogger();

/** Warn calls the loader emitted during the current test. */
const warns: { message: string; meta?: Record<string, unknown>, }[] = [];

/** Only this loader's own warning — the real plugin scan logs others too. */
const ourWarnings = (): typeof warns => {
  return warns.filter((w,) => w.message.includes("cannot be enforced in solo mode"),);
};

beforeEach(() => {
  warns.length = 0;
  // Spreading a real logger does not work: its methods live on the prototype,
  // so the spread yields `error: undefined` and the loader's own error paths
  // blow up. Same explicit shape loader.test.ts uses for its nullLogger.
  const recorder: Logger = {
    trace: () => {},
    fatal: () => {},
    info: () => {},
    debug: () => {},
    error: () => {},
    warn: (message: string | Record<string, unknown>, meta?: Record<string, unknown>,) => {
      warns.push({ message: typeof message === "string" ? message : "", meta, });
    },
    child: () => recorder,
    addTransport: () => {},
    setBindings: () => {},
    setLevel: () => {},
    flush: async () => {},
  };

  setGlobalLogger(recorder,);

  registry.register({
    manifest: { name: "solo-warn", version: "1", description: "d", author: "t", },
    origin: "local",
    directory: "test",
  },);
},);

afterEach(() => {
  registry.unregisterAll();
  setGlobalLogger(priorLogger,);
},);

describe("warnIfAccessFieldsAreInert", () => {
  test("fires once, aggregated, when solo mode cannot enforce the fields", () => {
    registry.addRoutes("solo-warn", [
      { method: "GET", path: "/a", handler: async () => null, requiresAuth: true, },
      { method: "GET", path: "/b", handler: async () => null, permissions: ["admin.settings",], },
      { method: "GET", path: "/c", handler: async () => null, },
    ],);

    const affected = warnIfAccessFieldsAreInert({ authRequired: false, },);

    expect(affected,).toBe(2,);
    // Exactly ONE warn entry, not one per route.
    expect(warns.length,).toBe(1,);
    expect(warns[0]?.message,).toContain("cannot be enforced in solo mode");
    expect(warns[0]?.meta?.routeCount,).toBe(2,);
    expect(warns[0]?.meta?.routes,).toEqual(["GET /a", "GET /b",],);
  },);

  test("stays silent when auth.required is true (fields are enforceable)", () => {
    registry.addRoutes("solo-warn", [
      { method: "GET", path: "/a", handler: async () => null, requiresAuth: true, },
      { method: "GET", path: "/b", handler: async () => null, permissions: ["admin.settings",], },
    ],);

    expect(warnIfAccessFieldsAreInert({ authRequired: true, },),).toBe(0,);
    expect(warns.length,).toBe(0,);
  },);

  test("stays silent in solo mode when no route declares access fields", () => {
    registry.addRoutes("solo-warn", [
      { method: "GET", path: "/plain", handler: async () => null, },
      { method: "GET", path: "/explicit-false", handler: async () => null, requiresAuth: false, },
      { method: "GET", path: "/empty-perms", handler: async () => null, permissions: [], },
    ],);

    expect(warnIfAccessFieldsAreInert({ authRequired: false, },),).toBe(0,);
    expect(warns.length,).toBe(0,);
  },);

  test("defaults to the fail-loud assumption when no opts are passed", () => {
    registry.addRoutes("solo-warn", [
      { method: "GET", path: "/a", handler: async () => null, requiresAuth: true, },
    ],);

    expect(warnIfAccessFieldsAreInert(),).toBe(1,);
    expect(warns.length,).toBe(1,);
  },);

  test("ignores routes belonging to disabled plugins", () => {
    registry.addRoutes("solo-warn", [
      { method: "GET", path: "/a", handler: async () => null, requiresAuth: true, },
    ],);

    registry.setEnabled("solo-warn", false,);

    expect(warnIfAccessFieldsAreInert({ authRequired: false, },),).toBe(0,);
    expect(warns.length,).toBe(0,);
  },);

  /**
   * The direct-call tests above pin the rule; this one pins the WIRING, i.e.
   * that boot actually reaches it. Without it, deleting the single call inside
   * `loadAllPlugins` would silence every plugin author's warning and no test
   * would notice.
   *
   * Both DB reads in the loader (plugin_state select, persist insert) are
   * already inside try/catch, so an empty stub exercises the real scan path.
   */
  test("loadAllPlugins emits the warning on boot when auth is not required", async () => {
    registry.addRoutes("solo-warn", [
      { method: "GET", path: "/a", handler: async () => null, requiresAuth: true, },
    ],);

    await loadAllPlugins({} as unknown as Kysely<DB>, { authRequired: false, },);

    // The real scan emits unrelated warns, so match on our own message
    // instead of counting every recorded call.
    expect(ourWarnings().length,).toBe(1,);
  },);

  test("loadAllPlugins stays silent on boot when auth is required", async () => {
    registry.addRoutes("solo-warn", [
      { method: "GET", path: "/a", handler: async () => null, requiresAuth: true, },
    ],);

    await loadAllPlugins({} as unknown as Kysely<DB>, { authRequired: true, },);

    expect(ourWarnings().length,).toBe(0,);
  },);
});
