// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { NotificationsManager, } from "./notifications";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  constructor(url: string,) {
    this.url = url;
    FakeEventSource.instances.push(this,);
  }
  addEventListener() {}
  close() {
    this.closed = true;
  }
}

const globalState = globalThis as unknown as Record<string, unknown>;
const originalEventSource = globalState.EventSource;
const originalApiFetch = globalState.apiFetch;
const originalShowToast = globalState.showToast;
// Save the pre-file window state: assigning a window here must not leak into
// later files in a shared-process serial run (a location-less window breaks
// any code that evaluates window.location).
const hadWindow = "window" in globalThis;
const originalWindow = (globalThis as { window?: unknown }).window;
let installedWindow = false;

beforeEach(() => {
  // Falsy check, not key presence: earlier files can leave a `window` KEY
  // whose value is undefined, and the suite needs a real window object.
  installedWindow = !(globalThis as { window?: unknown }).window;
  if (installedWindow) { (globalThis as { window?: unknown }).window = globalThis; }
  FakeEventSource.instances = [];
  globalState.EventSource = FakeEventSource;
  globalState.apiFetch = async () => Response.json({ chats: {}, },);
  globalState.showToast = () => {};
},);

afterEach(() => {
  globalState.EventSource = originalEventSource;
  globalState.apiFetch = originalApiFetch;
  globalState.showToast = originalShowToast;
  if (installedWindow) {
    if (hadWindow) {
      (globalThis as { window?: unknown }).window = originalWindow;
    } else {
      delete (globalThis as { window?: unknown }).window;
    }

    installedWindow = false;
  }
},);

describe("NotificationsManager start/stop", () => {
  test("start is idempotent (single stream)", () => {
    const m = new NotificationsManager();
    m.start();
    const n1 = FakeEventSource.instances.length;
    m.start();
    expect(FakeEventSource.instances.length,).toBe(n1,);
    m.stop();
  });

  test("start opens SSE stream at activity endpoint", () => {
    const m = new NotificationsManager();
    m.start();
    expect(FakeEventSource.instances.length,).toBe(1,);
    expect(FakeEventSource.instances[0]!.url,).toBe("/api/v1/activity/stream",);
    m.stop();
  });

  test("stop closes stream; restart opens new one", () => {
    const m = new NotificationsManager();
    m.start();
    const es = FakeEventSource.instances[0]!;
    m.stop();
    expect(es.closed,).toBe(true,);
    m.start();
    expect(FakeEventSource.instances.length,).toBe(2,);
    m.stop();
  });
});
