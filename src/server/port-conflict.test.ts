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
    expect(message,).toContain("--instance",);
    expect(message,).not.toContain("PORT=",);
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

  test("reads the port out of Bun's listen message (no port/address fields)", () => {
    // The shape Bun actually throws: code + syscall + errno, and the port
    // only in the message text.
    const error = Object.assign(new Error("Failed to start server. Is port 39882 in use?",), {
      code: "EADDRINUSE",
    },);

    const message = portConflictMessage(error,);
    expect(message,).not.toBeNull();
    expect(message,).toContain("port 39882",);
    expect(message,).toContain("LOOP_LORE_INSTANCE",);
  });

  test("the message reads as balanced prose", () => {
    const error = Object.assign(new Error("listen EADDRINUSE",), {
      code: "EADDRINUSE",
      port: 3000,
    },);

    const message = portConflictMessage(error,) ?? "";
    const opens = message.split("(",).length - 1;
    const closes = message.split(")",).length - 1;
    expect(opens,).toBe(closes,);
  });

  test("falls back to the configured port when no port is present", () => {
    const error = Object.assign(new Error("address already in use",), { code: "EADDRINUSE", },);
    const message = portConflictMessage(error,);
    expect(message,).not.toBeNull();
    expect(message,).toContain("the configured port",);
    expect(message,).toContain("--instance",);
  });
});
