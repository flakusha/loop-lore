import { afterEach, beforeEach, describe, expect, it, mock, } from "bun:test";
import { createLogger, setGlobalLogger, } from "../logger";
import { requirePermission, } from "./permissions";

/** No-op logger for test isolation (doesn't pollute test output). */
function silentLogger(): ReturnType<typeof createLogger> {
  // Bun's default logger writes to stderr; silencing per-test is impractical.
  // Instead, use a fake logger and capture calls via mock.
  const log = createLogger({ level: "fatal", },);
  return log;
}

describe("requirePermission", () => {
  let originalLogger: ReturnType<typeof createLogger> | null = null;

  beforeEach(() => {
    setGlobalLogger(silentLogger(),);
  },);

  afterEach(() => {
    if (originalLogger) { setGlobalLogger(originalLogger,); }
  },);

  it("returns undefined (allow) when role has the permission", async () => {
    const guard = requirePermission("admin.settings",);
    const result = await guard({
      request: new Request("http://localhost/api/admin/x",),
      userId: "user-1",
      userRole: "admin",
      t: (k,) => k,
    },);
    expect(result,).toBeUndefined();
  });

  it("returns 403 Response when role lacks the permission", async () => {
    const guard = requirePermission("admin.settings",);
    const result = await guard({
      request: new Request("http://localhost/api/admin/x", { method: "POST", },),
      userId: "user-1",
      userRole: "user",
      t: (k,) => `[${k}]`,
    },);
    expect(result,).toBeInstanceOf(Response,);
    expect(result!.status,).toBe(403,);
    const body = await result!.json();
    expect(body.code,).toBe("FORBIDDEN",);
  });

  it("logs denial with userId + permission + path + requestId", async () => {
    const warnMock = mock(() => {},);
    const fakeLog = { warn: warnMock, info: () => {}, error: () => {}, debug: () => {}, } as unknown as ReturnType<
      typeof createLogger
    >;
    const guard = requirePermission("admin.settings", { logger: fakeLog, },);
    await guard({
      request: new Request("http://localhost/api/admin/secret", { method: "DELETE", },),
      userId: "u-42",
      userRole: "user",
      requestId: "req-abc",
      t: (k,) => k,
    },);
    expect(warnMock,).toHaveBeenCalledTimes(1,);
    const [msg, entry,] = warnMock.mock.calls[0] as unknown as [string, Record<string, unknown>,];
    expect(msg,).toBe("Permission denied",);
    expect(entry.permission,).toBe("admin.settings",);
    expect(entry.userId,).toBe("u-42",);
    expect(entry.method,).toBe("DELETE",);
    expect(entry.path,).toBe("/api/admin/secret",);
    expect(entry.requestId,).toBe("req-abc",);
  });

  it("uses i18n translator for denial message when provided", async () => {
    const guard = requirePermission("admin.settings",);
    const result = await guard({
      request: new Request("http://localhost/api/admin/x",),
      userId: "user-1",
      userRole: "user",
      t: (k,) => `[tr]${k}`,
    },);
    const body = await result!.json();
    expect(body.error,).toBe("[tr]admin.adminAccessRequired",);
  });

  it("falls back to English when no translator is provided", async () => {
    const guard = requirePermission("admin.settings",);
    const result = await guard({
      request: new Request("http://localhost/api/admin/x",),
      userId: "user-1",
      userRole: "user",
    },);
    const body = await result!.json();
    expect(body.error,).toBe("Admin access required",);
  });

  it("resolves handle for audit log when resolveHandle provided", async () => {
    const resolveHandle = mock(async (id: string,) => `handle-for-${id}`);
    const warnMock = mock(() => {},);
    const fakeLog = { warn: warnMock, info: () => {}, error: () => {}, debug: () => {}, } as unknown as ReturnType<
      typeof createLogger
    >;
    const guard = requirePermission("admin.settings", { logger: fakeLog, resolveHandle, },);

    // First denial — triggers DB lookup
    await guard({
      request: new Request("http://localhost/api/admin/x",),
      userId: "u-99",
      userRole: "user",
      t: (k,) => k,
    },);
    // Second denial — same user — should hit cache, no second DB call
    await guard({
      request: new Request("http://localhost/api/admin/y",),
      userId: "u-99",
      userRole: "user",
      t: (k,) => k,
    },);

    expect(resolveHandle,).toHaveBeenCalledTimes(1,);
    const [, entry,] = warnMock.mock.calls[1] as unknown as [string, Record<string, unknown>,];
    expect(entry.handle,).toBe("handle-for-u-99",);
  });
});
