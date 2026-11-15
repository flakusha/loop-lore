// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeEach, expect, mock, test, } from "bun:test";
import { writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { startLlamaCpp, startLlamaSwap, } from "./start-llama";
import type { LlamaCppOptions, LlamaSwapOptions, ServerExternalHost, } from "./types";

let noBinary = "";
mock.module("../external-server-utils", () => ({
  BINARY_CANDIDATES: { "llama-cpp": ["llama-server",], "llama-swap": ["llama-swap",], "sd-cpp": ["sd-server",], },
  findBinary: mock((type: string,) => type === noBinary ? null : join(tmpdir(), "swap-llama-stub.mjs",)),
  isHuggingFaceRef: mock((_path: string,) => false),
  isPortFree: mock(async (_port: number,) => true),
  waitForHealth: mock(async (_url: string, _opts: unknown,) => true),
  waitForPort: mock(async (_port: number, _opts: unknown,) => true),
}),);

const warn = mock((..._args: unknown[]) => {},);
const stubSrc =
  `#!${process.execPath}\nconst a=process.argv.slice(2);const g=(f)=>{const i=a.indexOf(f);return i<0?null:a[i+1]};const l=g("--listen");const p=Number(l?l.split(":")[1]:g("--port"));Bun.serve({port:p,hostname:"127.0.0.1",fetch:()=>new Response("OK")});await new Promise(()=>{});\n`;

writeFileSync(join(tmpdir(), "swap-llama-stub.mjs",), stubSrc, { encoding: "utf8", mode: 0o755, },);

beforeEach(() => {
  noBinary = "";
},);

function makeHost(): ServerExternalHost {
  const host = { log: { warn, info: warn, }, instances: [], probeTimer: null, PROBE_INTERVAL_MS: 30_000, };
  return host as unknown as ServerExternalHost;
}

async function getOk(port: number,): Promise<number> {
  for (let i = 0; i < 200; i++) {
    const status = await fetch(`http://127.0.0.1:${port}/`,).then((r,) => r.status, () => null,);
    if (status === null) { await Bun.sleep(10,); }
    else { return status; }
  }

  throw new Error("stub never listened",);
}

const cfgA = join(tmpdir(), "swap-llama-a.yaml",);
writeFileSync(cfgA, "startPort: 5800\n", "utf8",);

test("startLlamaSwap resolves default 8080 and explicit listenPort", async () => {
  const def = await startLlamaSwap(makeHost(), { configPath: cfgA, } as LlamaSwapOptions,);
  expect(def?.port,).toBe(8080,);
  const exp = await startLlamaSwap(makeHost(), { configPath: cfgA, listenPort: 9199, } as LlamaSwapOptions,);
  expect(await getOk(9199,),).toBe(200,);
  def?.process.kill();
  exp?.process.kill();
});

test("startLlamaSwap warns when listenPort equals YAML startPort", async () => {
  await startLlamaSwap(makeHost(), { configPath: cfgA, listenPort: 5800, },);
  expect(warn.mock.calls.some((c,) => String(c[0],).includes("collides",)),).toBe(true,);
});

test("startLlamaCpp starts and pushes the instance on success", async () => {
  const inst = await startLlamaCpp(makeHost(), { port: 9321, modelPath: "/tmp/model.gguf", } as LlamaCppOptions,);
  expect(await getOk(9321,),).toBe(200,);
  inst?.process.kill();
});

test("startLlamaCpp/Swap return null when the binary is missing", async () => {
  noBinary = "llama-swap";
  await expect(startLlamaSwap(makeHost(), { configPath: cfgA, } as LlamaSwapOptions,),).resolves.toBeNull();
  noBinary = "llama-cpp";
  await expect(startLlamaCpp(makeHost(), { port: 1, modelPath: "m", } as LlamaCppOptions,),).resolves.toBeNull();
});
