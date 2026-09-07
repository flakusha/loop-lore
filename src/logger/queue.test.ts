// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test } from "bun:test";
import { AsyncLogQueue } from "./queue";

describe("logger queue", () => {
  test("AsyncLogQueue exists", () => {
    expect(typeof AsyncLogQueue).toBe("function");
  });
});
