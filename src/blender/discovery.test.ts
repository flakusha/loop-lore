// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** No Blender binary is executed; every probe here is injected. */

import { afterEach, expect, test, } from "bun:test";
import { findBinary, } from "../services/external-server-utils";
import type { BlenderProbe, } from "./bridge";
import {
  type BlenderProbeFn,
  discoverBlender,
  refreshBlenderDiscovery,
  resetBlenderDiscovery,
} from "./discovery";

afterEach(() => {
  resetBlenderDiscovery();
},);

const OK_PROBE: BlenderProbe = {
  ok: true,
  info: { version: "4.5.15", stages: ["bake", "export-glb",], supported: true, },
  provenance: {
    binary: "/opt/blender",
    version: "4.5.15",
    scriptDigest: "a".repeat(64,),
    startedAt: "2026-11-19T00:00:00.000Z",
    durationMs: 12,
    exitCode: 0,
    timedOut: false,
  },
};

function probeFn(calls: string[],): BlenderProbeFn {
  return async (options,) => {
    calls.push(options.binary,);
    return OK_PROBE;
  };
}

test("findBinary resolves blender through the injectable PATH seam", () => {
  expect(findBinary("blender", { which: (name,) => name === "blender" ? "/opt/blender" : null, },),).toBe(
    "/opt/blender",
  );
});

test("missing binary yields a structured unavailable verdict", async () => {
  const snapshot = await refreshBlenderDiscovery({ findBinary: () => null, },);
  expect(snapshot.ok,).toBe(false,);
  expect(snapshot.status,).toBe("unavailable",);
  expect(snapshot.binary,).toBeNull();
  expect(snapshot.message,).toContain("not found",);
});

test("probe verdict is cached, refreshed and reset through distinct seams", async () => {
  const calls: string[] = [];
  const options = { findBinary: () => "/opt/blender", probe: probeFn(calls,), };

  const first = await discoverBlender(options,);
  expect(first.ok,).toBe(true,);
  expect(first.version,).toBe("4.5.15",);
  expect(first.stages,).toEqual(["bake", "export-glb",],);
  expect(await discoverBlender(options,),).toBe(first,);
  expect(calls,).toEqual(["/opt/blender",],);

  const refreshed = await refreshBlenderDiscovery(options,);
  expect(refreshed,).not.toBe(first,);
  expect(calls,).toEqual(["/opt/blender", "/opt/blender",],);

  resetBlenderDiscovery();
  await discoverBlender(options,);
  expect(calls,).toHaveLength(3,);
});
