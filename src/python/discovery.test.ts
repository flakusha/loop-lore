// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Discovery coverage with injected seams: no python interpreter is ever
 * launched and no PATH is read.
 */
import { afterEach, expect, test, } from "bun:test";
import {
  discoverPython,
  refreshPythonDiscovery,
  resetPythonDiscovery,
} from "./discovery";

afterEach(() => {
  resetPythonDiscovery();
},);

test("missing binary yields unavailable without probing", async () => {
  let probed = 0;
  const snapshot = await discoverPython({
    findBinary: () => null,
    probe: async () => {
      probed += 1;
      throw new Error("must not probe",);
    },
  },);

  expect(probed,).toBe(0,);
  expect(snapshot,).toEqual({
    probedAt: expect.any(String,),
    binary: null,
    ok: false,
    status: "unavailable",
    message: "Python binary not found on PATH",
    version: null,
    supported: false,
    provenance: null,
  },);
});

test("successful probe snapshots the version", async () => {
  const snapshot = await discoverPython({
    findBinary: () => "/usr/bin/python3",
    probe: async (options,) => ({
      ok: true,
      info: { version: "3.12.1", supported: true, },
      provenance: {
        binary: options.binary,
        version: "3.12.1",
        scriptDigest: "abc",
        startedAt: "t",
        durationMs: 1,
        exitCode: 0,
        timedOut: false,
      },
    }),
  },);

  expect(snapshot.ok,).toBe(true,);
  expect(snapshot.binary,).toBe("/usr/bin/python3",);
  expect(snapshot.version,).toBe("3.12.1",);
  expect(snapshot.supported,).toBe(true,);
  expect(snapshot.status,).toBeNull();
});

test("failed probe keeps the bridge status vocabulary", async () => {
  const snapshot = await discoverPython({
    findBinary: () => "/usr/bin/python3",
    probe: async () => ({
      ok: false,
      status: "timeout",
      message: "Python capability probe timed out",
    }),
  },);

  expect(snapshot.ok,).toBe(false,);
  expect(snapshot.status,).toBe("timeout",);
  expect(snapshot.message,).toContain("timed out",);
  expect(snapshot.version,).toBeNull();
});

test("discovery caches; refresh probes again", async () => {
  let probed = 0;
  const options = {
    findBinary: () => "/usr/bin/python3",
    probe: async (options,) => {
      probed += 1;
      return {
        ok: true as const,
        info: { version: "3.12.1", supported: true, },
        provenance: {
          binary: options.binary,
          version: "3.12.1",
          scriptDigest: "abc",
          startedAt: "t",
          durationMs: 1,
          exitCode: 0,
          timedOut: false,
        },
      };
    },
  };

  await discoverPython(options,);
  await discoverPython(options,);
  expect(probed,).toBe(1,);
  await refreshPythonDiscovery(options,);
  expect(probed,).toBe(2,);
});
