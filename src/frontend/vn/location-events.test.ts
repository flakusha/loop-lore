// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend/vn/location-events.ts — the last-seen location ledger.
 * Mirrors the controller.test.ts fake-dom + storage-stub setup.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { createStorageStub, type FakeDom, installVnFakeDom, } from "../tests/vn-fake-dom";
import { getLocationContext, saveLastLocation, } from "./location-events";
import { handleLocationChanged, } from "./scene-renderer/render";

type Globals = Record<string, unknown>;
const originalStorage = (globalThis as Globals).localStorage;
let dom: FakeDom;

beforeEach(() => {
  dom = installVnFakeDom();
  (globalThis as Globals).localStorage = createStorageStub();
},);

afterEach(() => {
  dom.restore();
  (globalThis as Globals).localStorage = originalStorage;
},);

describe("location ledger", () => {
  test("no stored value returns {}", () => {
    expect(getLocationContext("chat-1",),).toEqual({},);
  });

  test("saved value returns as currentLocationId", () => {
    saveLastLocation("chat-1", "loc-a",);
    expect(getLocationContext("chat-1",),).toEqual({ currentLocationId: "loc-a", },);
  });

  test("overwrite keeps the latest stored value", () => {
    saveLastLocation("chat-1", "loc-a",);
    saveLastLocation("chat-1", "loc-b",);
    expect(getLocationContext("chat-1",),).toEqual({ currentLocationId: "loc-b", },);
  });

  test("null clears the ledger", () => {
    saveLastLocation("chat-1", "loc-a",);
    saveLastLocation("chat-1", null,);
    expect(getLocationContext("chat-1",),).toEqual({},);
  });
});

describe("render import smoke", () => {
  test("handleLocationChanged is a function", () => {
    expect(typeof handleLocationChanged,).toBe("function",);
  });
});
