// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { afterEach, beforeEach, expect, test, } from "bun:test";
import type { ApiFetchMock, } from "../tests/test-types";
import { adminWorlds, } from "./admin-worlds";

const g = globalThis as unknown as { apiFetch?: ApiFetchMock; showToast?: (...args: unknown[]) => void };
const originalFetch = g.apiFetch;
const originalToast = g.showToast;

const WORLD = {
  id: "w-1",
  name: "Eldoria",
  description: "A test world",
  owner_id: "u-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  locationCount: 7,
};

let calls: { url: string; opts?: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

beforeEach(() => {
  calls = [];
  handler = async () => Response.json({},);
  g.apiFetch = (url, opts,) => {
    calls.push({ url, opts, },);
    return handler(url, opts,);
  };

  g.showToast = () => {};

  adminWorlds.worldDetail = null;
  adminWorlds.powerAudit = [];
  adminWorlds.powerAuditWorldId = "";
},);

afterEach(() => {
  g.apiFetch = originalFetch;
  g.showToast = originalToast;
},);

test("viewWorld loads a single world into worldDetail", async () => {
  handler = async () => Response.json(WORLD,);

  await adminWorlds.viewWorld("w-1",);

  expect(calls[0]?.url,).toBe("/api/v1/admin/worlds/w-1",);
  expect(adminWorlds.worldDetail,).toEqual(WORLD,);
  expect(adminWorlds.loadingWorldDetail,).toBe(false,);
});

test("viewWorld surfaces a 404 without clobbering the previous detail", async () => {
  adminWorlds.worldDetail = WORLD;
  handler = async () => Response.json({ message: "World not found", }, { status: 404, },);

  await adminWorlds.viewWorld("missing",);

  expect(adminWorlds.worldDetail,).toEqual(WORLD,);
});

test("closeWorldDetail resets the detail and audit state", () => {
  adminWorlds.worldDetail = WORLD;
  adminWorlds.powerAudit = [{ worldItemId: "x", } as never,];
  adminWorlds.powerAuditWorldId = "w-1";

  adminWorlds.closeWorldDetail();

  expect(adminWorlds.worldDetail,).toBeNull();
  expect(adminWorlds.powerAudit,).toEqual([],);
  expect(adminWorlds.powerAuditWorldId,).toBe("",);
});

test("loadPowerAudit stores the ranked rows for the requested world", async () => {
  const items = [
    {
      worldItemId: "wi-1",
      itemId: "i-1",
      name: "Sword",
      category: "weapon",
      rarity: "rare",
      maxStatDelta: 10,
      drift: 0,
      maxDurability: 20,
      score: 30,
    },
  ];

  handler = async (url,) =>
    url === "/api/v1/admin/worlds/w-1/items/power-audit"
      ? Response.json({ worldId: "w-1", limit: 20, items, },)
      : Response.json({},);

  await adminWorlds.loadPowerAudit("w-1",);

  expect(calls[0]?.url,).toBe("/api/v1/admin/worlds/w-1/items/power-audit",);
  expect(adminWorlds.powerAudit,).toEqual(items,);
  expect(adminWorlds.powerAuditWorldId,).toBe("w-1",);
  expect(adminWorlds.loadingPowerAudit,).toBe(false,);
});

test("loadPowerAudit tolerates a non-array items payload", async () => {
  handler = async () => Response.json({ worldId: "w-1", items: null, },);

  await adminWorlds.loadPowerAudit("w-1",);

  expect(adminWorlds.powerAudit,).toEqual([],);
});
