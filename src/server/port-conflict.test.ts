// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/server/port-conflict.test.ts — EADDRINUSE classifier: friendly message
// for port conflicts, null (generic path) for everything else.

import { describe, expect, test, } from "bun:test";
import { portConflictMessage, } from "./port-conflict";

describe("portConflictMessage", () => {
  test("names the port for EADDRINUSE errors", () => {
    const error = Object.assign(new Error("listen EADDRINUSE: address already in use",), {
      code: "EADDRINUSE",
      port: 3000,
    },);

    const message = portConflictMessage(error,);
    expect(message,).not.toBeNull();
    expect(message,).toContain("port 3000",);
    expect(message,).toContain("another instance or process",);
    expect(message,).toContain("PORT",);
  });

  test("includes the host when the error carries one", () => {
    const error = Object.assign(new Error("listen EADDRINUSE",), {
      code: "EADDRINUSE",
      hostname: "localhost",
      port: 3000,
    },);

    expect(portConflictMessage(error,),).toContain("port 3000 on localhost",);
  });

  test("returns null for non-EADDRINUSE errors", () => {
    expect(portConflictMessage(new Error("boom",),),).toBeNull();
    expect(
      portConflictMessage(Object.assign(new Error("denied",), { code: "EACCES", port: 80, },),),
    ).toBeNull();

    expect(portConflictMessage(null,),).toBeNull();
    expect(portConflictMessage("EADDRINUSE",),).toBeNull();
  });

  test("falls back to the configured port when no port is present", () => {
    const error = Object.assign(new Error("address already in use",), { code: "EADDRINUSE", },);
    const message = portConflictMessage(error,);
    expect(message,).not.toBeNull();
    expect(message,).toContain("the configured port",);
    expect(message,).toContain("PORT",);
  });
});
