// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the GET /api/commands registry route.
 * (WIRE-assistant-command-palette-stale-static-list)
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { Elysia, } from "elysia";
import {
  listCommands,
  registerCommand,
} from "../../assistant/commands/registry";
import { commandsRoutes, } from "./index";

const TEST_COMMAND = "routes-test-cmd";
const OTHER_TEST_COMMAND = "routes-test-other";

function makeApp(userId: string | null,) {
  const app = new Elysia({ name: "test-commands", },);
  if (userId) { app.derive(() => ({ userId, userRole: "member", })); }
  return app.use(commandsRoutes({},),);
}

describe("GET /api/commands", () => {
  beforeEach(() => {
    if (!listCommands().includes(TEST_COMMAND,)) {
      registerCommand(TEST_COMMAND, () => ({ handled: true, }),);
    }
    if (!listCommands().includes(OTHER_TEST_COMMAND,)) {
      registerCommand(OTHER_TEST_COMMAND, () => ({ handled: true, }),);
    }
  },);

  afterEach(() => {
    // Tests only assert on command *list membership* via name/descriptionKey;
    // any registration done by a prior test that we don't want to leak can
    // be left in the registry — the route returns whatever is registered.
  },);

  it("requires authentication", async () => {
    const app = makeApp(null,);
    const res = await app.handle(new Request("http://localhost/api/commands",),);
    expect(res.status,).toBe(401,);
    const body = await res.json() as { error?: string };
    expect(typeof body.error,).toBe("string",);
  });

  it("returns the live registry with description keys", async () => {
    const app = makeApp("user-1",);
    const res = await app.handle(new Request("http://localhost/api/commands",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { name: string; descriptionKey: string }[] };
    expect(Array.isArray(body.data,),).toBe(true,);
    const names = body.data.map((entry,) => entry.name);
    expect(names,).toContain(TEST_COMMAND,);
    expect(names,).toContain(OTHER_TEST_COMMAND,);
    for (const entry of body.data) {
      expect(entry.descriptionKey,).toBe(`commands.${entry.name}`,);
    }
  });

  it("includes new commands without an FE rebuild", async () => {
    const app = makeApp("user-1",);
    const freshName = `fresh-cmd-${Date.now()}`;
    registerCommand(freshName, () => ({ handled: true, }),);
    const res = await app.handle(new Request("http://localhost/api/commands",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { name: string; descriptionKey: string }[] };
    expect(body.data.map((entry,) => entry.name),).toContain(freshName,);
  });
});
