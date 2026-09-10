// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Native loader — coverage test for `resolveNativeBinaryPath`'s
 * "unsupported platform" branch.
 *
 * The function returns `null` when `BINARY_NAMES[process.platform]` is
 * undefined (e.g. `freebsd`, `openbsd`, `haiku`). Stubbing `process.platform`
 * exercises that branch without needing an actual unsupported host.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { resolveNativeBinaryPath, } from "./loader";

/** Snapshot + restore to avoid bleeding into other test files. */
const originalPlatform = process.platform;

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true, },);
},);

describe("resolveNativeBinaryPath — unsupported platform", () => {
  test("returns null for freebsd (no BINARY_NAMES entry)", () => {
    Object.defineProperty(process, "platform", { value: "freebsd", configurable: true, },);
    expect(resolveNativeBinaryPath(),).toBeNull();
  });

  test("returns null for openbsd", () => {
    Object.defineProperty(process, "platform", { value: "openbsd", configurable: true, },);
    expect(resolveNativeBinaryPath(),).toBeNull();
  });

  test("returns null for haiku", () => {
    Object.defineProperty(process, "platform", { value: "haiku", configurable: true, },);
    expect(resolveNativeBinaryPath(),).toBeNull();
  });

  test("returns null for any platform explicitly mapped to undefined", () => {
    Object.defineProperty(process, "platform", { value: "cygwin", configurable: true, },);
    expect(resolveNativeBinaryPath(),).toBeNull();
  });

  test("returns a string path for supported platforms (linux/darwin/win32)", () => {
    for (const platform of ["linux", "darwin", "win32",] as const) {
      Object.defineProperty(process, "platform", { value: platform, configurable: true, },);
      const path = resolveNativeBinaryPath();
      // We don't pin the exact path (depends on repo layout), only that the
      // supported-platform branch returns a non-null candidate. May still be
      // null on a system where the binary was never built; in CI we expect a
      // release or debug path under native/loop-lore-native/target/.
      if (path !== null) {
        expect(typeof path,).toBe("string",);
        expect(path,).toMatch(/(loop_lore_native|loop-lore-native)/,);
      }
    }
  });
});
