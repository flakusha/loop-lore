// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/services/server-external-manager/start-honkbox.test.ts — honkbox spawn
// path: binary missing → null; port busy → null; health timeout → kill + null;
// success pushes the instance with `serve --port --host` argv.

import { beforeEach, expect, mock, test, } from "bun:test";
import { readFileSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { startHonkbox, } from "./start-honkbox";
import type { HonkboxOptions, ServerExternalHost, } from "./types";

let noBinary = "";
let portFree = true;
let healthOk = true;

mock.module("../external-server-utils", () => ({
  BINARY_CANDIDATES: {
    "llama-cpp": ["llama-server",],
    "llama-swap": ["llama-swap",],
    "sd-cpp": ["sd-server",],
    honkbox: ["honkbox",],
  },
  findBinary: mock((type: string,) => type === noBinary ? null : join(tmpdir(), "honkbox-stub.mjs",)),
  isPortFree: mock(async (_port: number,) => portFree),
  waitForHealth: mock(async (_url: string, _opts: unknown,) => healthOk),
  waitForPort: mock(async (_port: number, _opts: unknown,) => true),
}),);

const warn = mock((..._args: unknown[]) => {},);

// Stub honkbox: records argv (JSON) and serves GET on the --port it received.
const argsOut = join(tmpdir(), "honkbox-stub-args.json",);
const stubSrc = `#!${process.execPath}\n` +
  `const fs=require("node:fs");\n` +
  `const a=process.argv.slice(2);const g=(f)=>{const i=a.indexOf(f);return i<0?null:a[i+1]};\n` +
  `fs.writeFileSync(${JSON.stringify(argsOut,)}, JSON.stringify(a,), "utf8",);\n` +
  `Bun.serve({port:Number(g("--port"),),hostname:g("--host",)||"127.0.0.1",fetch:()=>new Response("OK",)},);\n` +
  `await new Promise(()=>{});\n`;

writeFileSync(join(tmpdir(), "honkbox-stub.mjs",), stubSrc, { encoding: "utf8", mode: 0o755, },);

beforeEach(() => {
  noBinary = "";
  portFree = true;
  healthOk = true;
},);

function makeHost(): ServerExternalHost {
  const host = { log: { warn, info: warn, }, instances: [], probeTimer: null, PROBE_INTERVAL_MS: 30_000, };
  return host as unknown as ServerExternalHost;
}

/** A fresh high random port per test — parallel-safe (no fixed shared ports). */
function freshPort(): number {
  return 28000 + Math.floor(Math.random() * 10_000,);
}

async function waitForListen(port: number,): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const status = await fetch(`http://127.0.0.1:${port}/health`,).then((r,) => r.status, () => null,);
    if (status === 200) { return; }
    await Bun.sleep(10,);
  }

  throw new Error("stub never listened",);
}

test("startHonkbox returns null when the binary is missing", async () => {
  noBinary = "honkbox";
  await expect(startHonkbox(makeHost(), { enabled: true, port: freshPort(), },),).resolves.toBeNull();
  expect(warn.mock.calls.some((c,) => String(c[0],).includes("not found in PATH",)),).toBe(true,);
});

test("startHonkbox returns null when the port is busy", async () => {
  portFree = false;
  const port = freshPort();
  await expect(startHonkbox(makeHost(), { enabled: true, port, },),).resolves.toBeNull();
  expect(warn.mock.calls.some((c,) => String(c[0],).includes("Port in use",)),).toBe(true,);
});

test("startHonkbox kills the process and returns null on health timeout", async () => {
  healthOk = false;
  const port = freshPort();
  const host = makeHost();
  await expect(startHonkbox(host, { enabled: true, port, },),).resolves.toBeNull();
  expect(host.instances,).toHaveLength(0,);
  expect(warn.mock.calls.some((c,) => String(c[0],).includes("did not become ready",)),).toBe(true,);
});

test("startHonkbox pushes the instance and spawns serve --port --host on success", async () => {
  const port = freshPort();
  const host = makeHost();
  const opts: HonkboxOptions = {
    enabled: true,
    port,
    host: "127.0.0.1",
    configPath: "~/honkbox/config.toml",
    extraArgs: ["--log-level", "debug",],
  };

  const inst = await startHonkbox(host, opts,);
  expect(inst,).not.toBeNull();
  expect(inst?.type,).toBe("honkbox",);
  expect(inst?.port,).toBe(port,);
  expect(host.instances,).toHaveLength(1,);
  expect(inst?.launch,).toEqual({ kind: "honkbox", opts, },);
  expect(inst?.process.exitCode,).toBeNull();

  await waitForListen(port,);
  const argv = JSON.parse(readFileSync(argsOut, "utf8",),) as string[];
  expect(argv[0],).toBe("serve",);
  expect(argv,).toContain("--port",);
  expect(argv,).toContain(String(port,),);
  expect(argv,).toContain("--host",);
  expect(argv,).toContain("127.0.0.1",);
  // configPath resolves into --config (no shell, no ~ left unexpanded).
  const cfgIdx = argv.indexOf("--config",);
  expect(cfgIdx,).toBeGreaterThan(-1,);
  expect(argv[cfgIdx + 1],).not.toContain("~",);

  inst?.process.kill();
});
