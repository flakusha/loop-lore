// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Backup lifecycle: export/verify round-trip, drift classification,
// user-confirmed recovery, rotation bound.
import { describe, expect, test, } from "bun:test";
import {
  backupKey,
  createBackup,
  exportBackup,
  hashPayload,
  importBackup,
  type KeyValueStore,
  verifyBackup,
} from "./browser-backup";
import { reconcileAll, reconcileRecord, } from "./reconciliation";
import { recoverRecord, rehashForServer, rotateBackups, } from "./recovery";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string,) => data.get(key,) ?? null,
    setItem: (key: string, value: string,) => {
      data.set(key, value,);
    },
  };
}

const CHAT = { messages: [{ role: "user", text: "hello", },], };

describe("browser-backup lifecycle", () => {
  test("export -> import round-trip verifies consistent", async () => {
    const store = memoryStore();
    const record = createBackup({ ownerId: "u1", resourceId: "chat-1", resourceType: "chat", data: CHAT, },);
    expect(record.id.startsWith("ll-backup::u1::chat-1::1::",),).toBe(true,);
    const key = await exportBackup(store, record,);
    const loaded = await importBackup(store, key,);
    expect(verifyBackup(loaded,),).toBe(true,);
    expect(reconcileRecord(loaded, { serverHash: loaded.contentHash, serverVersion: 1, },),).toBe("consistent",);
  });

  test("1-byte tamper reports drifted and import refuses", async () => {
    const store = memoryStore();
    const record = createBackup({ ownerId: "u1", resourceId: "chat-1", resourceType: "chat", data: CHAT, },);
    const key = await exportBackup(store, record,);
    const raw = JSON.parse(store.data.get(key,)!,);
    raw.payload = raw.payload.length > 1 ? `X${raw.payload.slice(1,)}` : "X";
    store.data.set(key, JSON.stringify(raw,),);
    await expect(importBackup(store, key,),).rejects.toThrow(/integrity check/,);
    expect(reconcileRecord(raw, { serverHash: record.contentHash, },),).toBe("drifted",);
  });

  test("orphaned and stale classify correctly", () => {
    const local = createBackup({ ownerId: "u1", resourceId: "world-9", resourceType: "world", data: { seed: 7, }, },);
    expect(reconcileRecord(local, {},),).toBe("orphaned",);
    expect(reconcileRecord({ ...local, version: 1, }, { serverHash: "other", serverVersion: 3, },),).toBe("stale",);
    const report = reconcileAll([local,], {},);
    expect(report[0]!.status,).toBe("orphaned",);
    expect(report[0]!.action,).toContain("push",);
  });

  test("recovery without confirmation refuses and never touches target", async () => {
    const record = createBackup({ ownerId: "u1", resourceId: "chat-1", resourceType: "chat", data: CHAT, },);
    let applied = 0;
    const target = {
      applyPayload: () => {
        applied += 1;
      },
    };

    const refused = await recoverRecord(record, target, () => false,);
    expect(refused.restored,).toBe(false,);
    expect(applied,).toBe(0,);
    const allowed = await recoverRecord(record, target, () => true,);
    expect(allowed.restored,).toBe(true,);
    expect(applied,).toBe(1,);
  });

  test("rotation keeps N newest per resource", () => {
    const mk = (resourceId: string, version: number,) =>
      createBackup({
        ownerId: "u1",
        resourceId,
        resourceType: "chat",
        data: { v: version, },
        version,
        createdAt: `2026-10-${String(version,).padStart(2, "0",)}T00:00:00.000Z`,
      },);

    const records = [mk("a", 1,), mk("a", 2,), mk("a", 3,), mk("b", 1,), mk("b", 2,),];
    const kept = rotateBackups(records, 2,);
    expect(kept.filter((r,) => r.resourceId === "a"),).toHaveLength(2,);
    expect(kept.filter((r,) => r.resourceId === "b"),).toHaveLength(2,);
    expect(kept.some((r,) => r.resourceId === "a" && r.version === 1),).toBe(false,);
    expect(rotateBackups(records, 0,),).toHaveLength(0,);
  });

  test("backupKey segments and hashPayload determinism", () => {
    const key = backupKey("u1", "chat-1", 2, "abc123",);
    expect(key,).toBe("ll-backup::u1::chat-1::2::abc123",);
    expect(key.split("::",),).toHaveLength(5,);
    const a = hashPayload('{"hello":1}',);
    expect(a,).toBe(hashPayload('{"hello":1}',),);
    expect(a,).toMatch(/^[0-9a-f]{64}$/,);
    expect(hashPayload('{"hello":2}',),).not.toBe(a,);
  });

  test("rehashForServer equals hashPayload of the stored blob", () => {
    const record = createBackup({ ownerId: "u1", resourceId: "chat-1", resourceType: "chat", data: CHAT, },);
    expect(rehashForServer(record,),).toBe(hashPayload(record.payload,),);
  });
});
