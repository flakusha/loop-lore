// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { afterEach, beforeEach, expect, test, } from "bun:test";
import type { ApiFetchMock, } from "../tests/test-types";
import { type AdminDbBackupState, createAdminDbBackup, type DbBackupEntry, } from "./admin-db-backup";
import { t, } from "./i18n";

const g = globalThis as unknown as { apiFetch?: ApiFetchMock; showToast?: (...args: unknown[]) => void };
const originalFetch = g.apiFetch;
const originalToast = g.showToast;

const BACKUP: DbBackupEntry = { name: "llm-2026.sqlite", sizeBytes: 2048, modifiedAt: "2026-11-18T00:00:00Z", };

let calls: { url: string; opts?: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);
let state: AdminDbBackupState;

beforeEach(() => {
  calls = [];
  handler = async () => Response.json({},);
  g.apiFetch = (url, opts,) => {
    calls.push({ url, opts, },);
    return handler(url, opts,);
  };

  g.showToast = () => {};
  state = createAdminDbBackup();
},);

afterEach(() => {
  g.apiFetch = originalFetch;
  g.showToast = originalToast;
},);

test("loadBackups lists snapshots and clears the in-flight flag", async () => {
  handler = async () => Response.json({ backups: [BACKUP,], dir: "/data/backups", },);

  await state.loadBackups();

  expect(state.backups,).toEqual([BACKUP,],);
  expect(state.dir,).toBe("/data/backups",);
  expect(state.loading,).toBe(false,);
  expect(state.error,).toBe("",);
});

test("loadBackups surfaces the server error message", async () => {
  handler = async () => Response.json({ message: "backup dir missing", }, { status: 500, },);

  await state.loadBackups();

  expect(state.error,).toBe("backup dir missing",);
  expect(state.backups,).toEqual([],);
  expect(state.loading,).toBe(false,);
});

test("createBackup POSTs, reloads the list and reports success", async () => {
  handler = async (_url, opts,) => {
    if (opts?.method === "POST") {
      return Response.json({ backup: { name: "new", sizeBytes: 10, }, }, { status: 201, },);
    }

    return Response.json({ backups: [BACKUP,], dir: "/d", },);
  };

  await state.createBackup();

  expect(calls[0]?.url,).toBe("/api/admin/db/backup",);
  expect(calls[0]?.opts?.method,).toBe("POST",);
  expect(calls[1]?.opts?.method,).toBeUndefined();
  expect(state.backups,).toEqual([BACKUP,],);
  expect(state.message,).toBe(t("admin.dbBackup.createDone",),);
  expect(state.creating,).toBe(false,);
});

test("createBackup surfaces a failed POST instead of a silent catch", async () => {
  handler = async () => Response.json({ message: "disk full", }, { status: 500, },);

  await state.createBackup();

  expect(state.error,).toBe("disk full",);
  expect(state.message,).toBe("",);
  expect(state.creating,).toBe(false,);
});

test("restore requires the typed confirmation before any request", async () => {
  state.beginRestore(BACKUP.name,);
  expect(state.restoreTarget,).toBe(BACKUP.name,);
  state.confirmation = "RESTORE-ME";

  await state.confirmRestore();

  expect(calls,).toHaveLength(0,);
});

test("confirmed restore names the restart consequence and reloads", async () => {
  state.beginRestore(BACKUP.name,);
  state.confirmation = "RESTORE";
  handler = async (url,) =>
    url === "/api/admin/db/restore"
      ? Response.json({ restored: true, restartRequired: true, preRestoreBackup: "pre", },)
      : Response.json({ backups: [], dir: "/d", },);

  await state.confirmRestore();

  expect(calls[0]?.url,).toBe("/api/admin/db/restore",);
  expect(JSON.parse(String(calls[0]?.opts?.body,),),).toEqual({ name: BACKUP.name, confirmation: "RESTORE", },);
  expect(state.message,).toContain(t("admin.dbBackup.restartRequired",),);
  expect(state.restoreTarget,).toBeNull();
  expect(state.confirmation,).toBe("",);
  expect(state.restoring,).toBe(false,);
});

test("failed restore keeps the confirm step open and surfaces the message", async () => {
  state.beginRestore(BACKUP.name,);
  state.confirmation = "RESTORE";
  handler = async () => Response.json({ message: "checksum mismatch", }, { status: 400, },);

  await state.confirmRestore();

  expect(state.error,).toBe("checksum mismatch",);
  expect(state.restoreTarget,).toBe(BACKUP.name,);
  expect(state.restoring,).toBe(false,);
});

test("cancelRestore abandons the pending destructive action", () => {
  state.beginRestore(BACKUP.name,);
  state.confirmation = "RESTORE";

  state.cancelRestore();

  expect(state.restoreTarget,).toBeNull();
  expect(state.confirmation,).toBe("",);
});
