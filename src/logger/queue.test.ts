// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test } from "bun:test";
import { LoggerQueue } from "./queue";

describe("logger queue", () => {
  test("LoggerQueue exists", () => {
    expect(typeof LoggerQueue).toBe("function");
  });
});
