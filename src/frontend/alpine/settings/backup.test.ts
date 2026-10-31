// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the settings backup Alpine mixin (src/frontend/alpine/settings/backup.ts).
 *
 * Same harness as general.test.ts: the mixin talks through the ambient
 * `apiFetch` global (stubbed per test) and the ambient `confirm` +
 * `localStorage` globals (stubbed per test).
 */
import "../i18n.test-helper";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { backup, classifyBackupStatus, reconcileBackups, } from "./backup";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;

interface Call {
  url: string;
  opts?: RequestInit;
}

interface Host {
  backupEnabled: boolean;
  backupTypes: Record<string, boolean>;
  backupReport: { resourceId: string; status: string }[];
  backupNotice: string;
  persistSettings(payload: Record<string, unknown>,): Promise<void>;
  loadBackupPrefs(): Promise<void>;
  toggleBackup(enabled: boolean,): Promise<void>;
  toggleBackupType(type: string,): Promise<void>;
  saveBackupPrefs(): Promise<void>;
  refreshBackupDashboard(
    locals: { resourceId: string; resourceType: string; contentHash: string; version: number }[],
  ): Promise<void>;
  recoverBackup(backupId: string,): Promise<void>;
}

const globals = globalThis as unknown as Record<string, unknown>;
const originalApiFetch = globals.apiFetch;
const originalConfirm = (globals as { confirm?: unknown }).confirm;
const originalLocalStorage = globals.localStorage;

let calls: Call[] = [];
let handler: ApiFetchMock = async () => Response.json({},);
let persisted: Record<string, unknown>[] = [];
let store: Record<string, string> = {};
let confirmResult = true;

function freshHost(): Host {
  const host = {
    backupEnabled: false,
    backupTypes: { chat: false, asset: false, world: false, lore: false, },
    backupReport: [],
    backupNotice: "",
    persistSettings: async (payload: Record<string, unknown>,) => {
      persisted.push(payload,);
    },
    loadBackupPrefs: async () => {},
    toggleBackup: async () => {},
    toggleBackupType: async () => {},
    saveBackupPrefs: async () => {},
    refreshBackupDashboard: async () => {},
    recoverBackup: async () => {},
  } as unknown as Host;

  Object.assign(host, backup(),);
  return host;
}

beforeEach(() => {
  calls = [];
  persisted = [];
  store = {};
  confirmResult = true;
  handler = async () => Response.json({},);
  globals.apiFetch = (url: string, opts?: RequestInit,) => {
    calls.push({ url, opts, },);
    return handler(url, opts,);
  };

  globals.localStorage = {
    getItem: (k: string,) => store[k] ?? null,
    setItem: (k: string, v: string,) => {
      store[k] = v;
    },
    removeItem: (k: string,) => {
      delete store[k];
    },
  };

  (globals as { confirm?: unknown }).confirm = () => confirmResult;
},);

afterEach(() => {
  globals.apiFetch = originalApiFetch;
  (globals as { confirm?: unknown }).confirm = originalConfirm;
  globals.localStorage = originalLocalStorage;
},);

describe("classifyBackupStatus", () => {
  test("missing server side is orphaned", () => {
    expect(classifyBackupStatus({ contentHash: "a", version: 1, }, {},),).toBe("orphaned",);
  });

  test("older local version is stale", () => {
    expect(classifyBackupStatus({ contentHash: "a", version: 1, }, { serverHash: "a", serverVersion: 2, },),).toBe(
      "stale",
    );
  });

  test("hash mismatch is drifted", () => {
    expect(classifyBackupStatus({ contentHash: "a", version: 2, }, { serverHash: "b", serverVersion: 2, },),).toBe(
      "drifted",
    );
  });

  test("matching hash and version is consistent", () => {
    expect(classifyBackupStatus({ contentHash: "a", version: 2, }, { serverHash: "a", serverVersion: 2, },),).toBe(
      "consistent",
    );
  });
});

describe("reconcileBackups", () => {
  test("per-item report carries status and action", () => {
    const report = reconcileBackups(
      [{ resourceId: "chat:x", resourceType: "chat", contentHash: "a", version: 1, },],
      {},
    );

    expect(report.length,).toBe(1,);
    expect(report[0]?.status,).toBe("orphaned",);
    expect(report[0]?.action,).toBe("push (create server counterpart)",);
  });
});

describe("settings backup mixin", () => {
  test("toggle flips and persists via the settings merge", async () => {
    const host = freshHost();
    await host.toggleBackup(true,);
    expect(host.backupEnabled,).toBe(true,);
    expect(persisted[0]?.["backupEnabled"],).toBe(true,);
  });

  test("type selector flips one type and persists", async () => {
    const host = freshHost();
    await host.toggleBackupType("world",);
    expect(host.backupTypes["world"],).toBe(true,);
    expect(host.backupTypes["chat"],).toBe(false,);
    expect(persisted.length,).toBe(1,);
  });

  test("dashboard renders per-item reconcile statuses", async () => {
    handler = async (url: string,) => {
      if (url === "/api/v1/settings/backups/hashes") {
        return Response.json({ hashes: { "chat:x": { serverHash: "b", serverVersion: 1, }, }, },);
      }

      return Response.json({},);
    };

    const host = freshHost();
    await host.refreshBackupDashboard([{
      resourceId: "chat:x",
      resourceType: "chat",
      contentHash: "a",
      version: 1,
    },],);

    expect(host.backupReport.length,).toBe(1,);
    expect(host.backupReport[0]?.status,).toBe("drifted",);
    expect(host.backupNotice,).toBe("backupDrift",);
  });

  test("non-ok dashboard response fails safe (report untouched)", async () => {
    handler = async () => new Response("err", { status: 500, },);
    const host = freshHost();
    await host.refreshBackupDashboard([{
      resourceId: "chat:x",
      resourceType: "chat",
      contentHash: "a",
      version: 1,
    },],);

    expect(host.backupReport,).toEqual([],);
    expect(host.backupNotice,).toBe("",);
  });

  test("recovery refuses without explicit confirm", async () => {
    confirmResult = false;
    const host = freshHost();
    await host.recoverBackup("b1",);
    expect(host.backupNotice,).toBe("backupConfirmRequired",);
    expect(calls.length,).toBe(0,);
  });

  test("confirmed recovery calls the restore endpoint directly", async () => {
    handler = async () => Response.json({ ok: true, },);
    const host = freshHost();
    await host.recoverBackup("b1",);
    expect(calls.length,).toBe(1,);
    expect(calls[0]?.url,).toBe("/api/v1/settings/backups/b1/restore",);
    expect(host.backupNotice,).toBe("backupRestored",);
  });

  test("failed restore reports backupRecoverFailed", async () => {
    handler = async () => new Response("tampered", { status: 409, },);
    const host = freshHost();
    await host.recoverBackup("b1",);
    expect(host.backupNotice,).toBe("backupRecoverFailed",);
  });
});
