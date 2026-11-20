// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fake-command coverage for the python3 bridge. No python interpreter is
 * ever executed; each test writes a shell stub that prints a fixed document.
 */
import { afterEach, beforeEach, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { join, resolve, } from "node:path";
import {
  __resetPythonLocks,
  parsePythonCapabilities,
  probePython,
  runPythonJob,
} from "./bridge";

const TMP_ROOT = ".tmp/python-bridge";
mkdirSync(TMP_ROOT, { recursive: true, },);
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(TMP_ROOT, "fixture-",),);
  __resetPythonLocks();
},);

afterEach(() => {
  rmSync(dir, { recursive: true, force: true, },);
  __resetPythonLocks();
},);

function writeStub(name: string, body: string,): string {
  const path = join(dir, name,);
  writeFileSync(path, `#!/bin/sh\n${body}\n`, { encoding: "utf8", mode: 0o755, },);
  return path;
}

function writeRecipe(name = "job.py",): string {
  const path = join(dir, name,);
  writeFileSync(path, "# operator recipe (never executed by these tests)\n",);
  return path;
}

function readLines(path: string,): string[] {
  return readFileSync(path, "utf8",).split("\n",).filter((line,) => line.length > 0);
}

test("probe reports the interpreter version from a fake python", async () => {
  const argvPath = join(dir, "argv",);
  const stub = writeStub(
    "probe.sh",
    `printf '%s\\n' "$@" > ${argvPath}\necho 'PY_CAP={"version":"3.12.1"}'`,
  );

  const result = await probePython({ binary: stub, timeoutMs: 2_000, },);
  expect(result.ok,).toBe(true,);
  if (!result.ok) { return; }
  expect(result.info.version,).toBe("3.12.1",);
  expect(result.info.supported,).toBe(true,);
  expect(result.provenance.scriptDigest,).toHaveLength(64,);
  expect(result.provenance.exitCode,).toBe(0,);
  expect(readLines(argvPath,).slice(0, 1,),).toEqual(["-c",],);
});

test("probe is malformed without a capabilities document", async () => {
  const stub = writeStub("quiet.sh", `echo 'no marker here'`,);

  const result = await probePython({ binary: stub, timeoutMs: 2_000, },);
  expect(result,).toEqual({
    ok: false,
    status: "malformed",
    message: "Python probe emitted no capabilities document",
    provenance: expect.objectContaining({ exitCode: 0, timedOut: false, },),
  },);
});

test("probe is unavailable when the binary exits nonzero", async () => {
  const stub = writeStub("missing.sh", `exit 7`,);

  const result = await probePython({ binary: stub, timeoutMs: 2_000, },);
  expect(result.ok,).toBe(false,);
  if (result.ok) { return; }
  expect(result.status,).toBe("unavailable",);
});

test("probe times out on a hanging binary", async () => {
  const stub = writeStub("slow.sh", `exec sleep 5`,);

  const result = await probePython({ binary: stub, timeoutMs: 60, },);
  expect(result.ok,).toBe(false,);
  if (result.ok) { return; }
  expect(result.status,).toBe("timeout",);
  expect(result.provenance?.timedOut,).toBe(true,);
});

test("run passes the recipe, separator, and JSON payload", async () => {
  const argvPath = join(dir, "argv",);
  const stub = writeStub("run.sh", `printf '%s\\n' "$@" > ${argvPath}\necho done`,);
  const recipe = writeRecipe();

  const result = await runPythonJob({ scriptPath: recipe, params: { a: 1, }, binary: stub, },);
  expect(result.ok,).toBe(true,);
  if (!result.ok) { return; }
  expect(result.stdout.trim(),).toBe("done",);
  expect(readLines(argvPath,),).toEqual([recipe, "--", '{"a":1}',],);
});

test("run executes in the workdir under its root", async () => {
  const stub = resolve(writeStub("pwd.sh", `pwd`,),);
  const recipe = resolve(writeRecipe(),);
  const root = resolve(TMP_ROOT,);
  const workdir = resolve(dir,);

  const result = await runPythonJob({ scriptPath: recipe, workdir, root, binary: stub, },);
  expect(result.ok,).toBe(true,);
  if (!result.ok) { return; }
  expect(result.stdout.trim(),).toBe(workdir,);
});

test("run refuses a non-python recipe without spawning", async () => {
  const result = await runPythonJob({ scriptPath: join(dir, "job.txt",), binary: join(dir, "never.sh",), },);
  expect(result,).toEqual({ ok: false, status: "invalid", message: "recipe must be a .py file", },);
});

test("run refuses a workdir outside its root", async () => {
  const recipe = writeRecipe();
  const result = await runPythonJob({
    scriptPath: recipe,
    workdir: resolve(dir, "..", "escape",),
    root: resolve(dir,),
    binary: join(dir, "never.sh",),
  },);

  expect(result,).toEqual({ ok: false, status: "invalid", message: "workdir is outside the configured root", },);
});

test("run refuses a workdir without a root", async () => {
  const recipe = writeRecipe();
  const result = await runPythonJob({
    scriptPath: recipe,
    workdir: resolve(dir,),
    binary: join(dir, "never.sh",),
  },);

  expect(result,).toEqual({ ok: false, status: "invalid", message: "workdir requires an operator-configured root", },);
});

test("run reports the stderr tail on failure", async () => {
  const stub = writeStub("fail.sh", `echo 'traceback boom' >&2\nexit 3`,);
  const recipe = writeRecipe();

  const result = await runPythonJob({ scriptPath: recipe, binary: stub, },);
  expect(result.ok,).toBe(false,);
  if (result.ok) { return; }
  expect(result.status,).toBe("failed",);
  expect(result.message,).toContain("traceback boom",);
});

test("jobs for one instance serialize FIFO", async () => {
  const log = join(dir, "order",);
  const stub = writeStub("slow-run.sh", `echo "start $3" >> ${log}\nsleep 0.3\necho "end $3" >> ${log}`,);
  const recipe = writeRecipe();

  const [first, second,] = await Promise.all([
    runPythonJob({ scriptPath: recipe, params: { n: "A", }, binary: stub, instanceId: "i", },),
    runPythonJob({ scriptPath: recipe, params: { n: "B", }, binary: stub, instanceId: "i", },),
  ],);

  expect(first.ok && second.ok,).toBe(true,);
  expect(readLines(log,),).toEqual([
    'start {"n":"A"}',
    'end {"n":"A"}',
    'start {"n":"B"}',
    'end {"n":"B"}',
  ],);
});

test("parse drops lines without the marker", () => {
  expect(parsePythonCapabilities("nothing\n",),).toBeNull();
  expect(parsePythonCapabilities("PY_CAP=not json\n",),).toBeNull();
  expect(parsePythonCapabilities('PY_CAP={"version":""}\n',),).toBeNull();
  expect(parsePythonCapabilities('PY_CAP={"version":"3.11.9"}\nnoise\n',),).toEqual({
    version: "3.11.9",
    supported: true,
  },);
});
