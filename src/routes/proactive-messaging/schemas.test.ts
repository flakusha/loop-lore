// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { createLogger, } from "../../logger";
import { configBody, logErr, R, } from "./schemas";

createLogger({ level: "error", },);

describe("proactive-messaging schemas", () => {
  test("exposes the route root", () => {
    expect(R,).toBe("/api/proactive-messaging",);
  });

  test("configBody is defined for route validation", () => {
    expect(configBody,).toBeDefined();
  });

  test("logErr logs Error instances without throwing", () => {
    expect(() => logErr("send failed", new Error("boom",),)).not.toThrow();
  });

  test("logErr wraps non-Error values without throwing", () => {
    expect(() => logErr("send failed", "plain string failure",)).not.toThrow();
    expect(() => logErr("send failed", undefined,)).not.toThrow();
  });
});
