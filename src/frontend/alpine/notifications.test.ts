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

beforeEach(() => {
  if (!(globalThis as any).window) { (globalThis as any).window = globalThis; }
  FakeEventSource.instances = [];
  globalState.EventSource = FakeEventSource;
  globalState.apiFetch = async () => Response.json({ chats: {}, },);
  globalState.showToast = () => {};
},);

afterEach(() => {
  globalState.EventSource = originalEventSource;
  globalState.apiFetch = originalApiFetch;
  globalState.showToast = originalShowToast;
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
