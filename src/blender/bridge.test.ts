// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fake-command coverage for the headless bridge. No Blender binary is ever
 * executed; each test writes a shell stub that prints a fixed document.
 *
 * Resource contract: each test owns a unique `mkdtemp` fixture directory
 * under `.tmp/blender-bridge`, removed in `afterEach`. Nothing is shared
 * between tests, so the file is order-independent and parallel-safe.
 */
import { afterEach, beforeEach, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { join, resolve, } from "node:path";
import {
  __resetBlenderLocks,
  BLENDER_STAGES,
  parseBlenderCapabilities,
  PROBE_EXPR,
  probeBlender,
  REQUIRED_BLENDER_VERSION,
  runBlenderJob,
} from "./bridge";

const TMP_ROOT = ".tmp/blender-bridge";
mkdirSync(TMP_ROOT, { recursive: true, },);
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(TMP_ROOT, "fixture-",),);
  __resetBlenderLocks();
},);

afterEach(() => {
  rmSync(dir, { recursive: true, force: true, },);
  __resetBlenderLocks();
},);

function writeStub(name: string, body: string,): string {
  const path = join(dir, name,);
  writeFileSync(path, `#!/bin/sh\n${body}\n`, { encoding: "utf8", mode: 0o755, },);
  return path;
}

function readLines(path: string,): string[] {
  return readFileSync(path, "utf8",).split("\n",).filter((line,) => line.length > 0);
}

test("probe reports pinned version and stage set from a fake Blender", async () => {
  const argvPath = join(dir, "argv",);
  const stub = writeStub(
    "probe.sh",
    `printf '%s\\n' "$@" > ${argvPath}\necho 'BLENDER_CAP={"version":"4.5.15 LTS","stages":["bake","export-glb","bogus"]}'`,
  );

  const result = await probeBlender({ binary: stub, timeoutMs: 2_000, },);
  expect(result.ok,).toBe(true,);
  if (!result.ok) { return; }
  expect(result.info.version,).toBe("4.5.15",);
  expect(result.info.stages,).toEqual(["bake", "export-glb",],);
  expect(result.provenance.scriptDigest,).toHaveLength(64,);
  expect(result.provenance.exitCode,).toBe(0,);
  expect(readLines(argvPath,),).toEqual([
    "--background",
    "--factory-startup",
    "-noaudio",
    "--python-exit-code",
    "1",
    "--python-expr",
    expect.any(String,),
  ],);
});

test("probe marks an unpinned version unsupported with its info", async () => {
  const stub = writeStub("old.sh", `echo 'BLENDER_CAP={"version":"4.4.0","stages":[]}'`,);
  const result = await probeBlender({ binary: stub, timeoutMs: 2_000, },);
  expect(result.ok,).toBe(false,);
  if (result.ok) { return; }
  expect(result.status,).toBe("unsupported",);
  expect(result.info?.version,).toBe("4.4.0",);
});

test("probe maps timeout and malformed output to structured statuses", async () => {
  const slow = writeStub("slow.sh", "exec sleep 5",);
  const timed = await probeBlender({ binary: slow, timeoutMs: 60, },);
  expect(timed.ok,).toBe(false,);
  if (!timed.ok) {
    expect(timed.status,).toBe("timeout",);
    expect(timed.provenance?.timedOut,).toBe(true,);
  }

  const noisy = writeStub("noisy.sh", "echo noise",);
  const bad = await probeBlender({ binary: noisy, timeoutMs: 2_000, },);
  expect(bad.ok,).toBe(false,);
  if (!bad.ok) { expect(bad.status,).toBe("malformed",); }
});

test("parser ignores unrelated lines and non-object payloads", () => {
  expect(parseBlenderCapabilities("noise\nBLENDER_CAP=not-json",),).toBeNull();
  expect(parseBlenderCapabilities("BLENDER_CAP=null",),).toBeNull();
  expect(parseBlenderCapabilities('BLENDER_CAP={"stages":[]}',),).toBeNull();
});

test("parser strips the official LTS suffix before checking the pin", () => {
  const info = parseBlenderCapabilities(
    'BLENDER_CAP={"version":"4.5.15 LTS","stages":["bake"]}',
  );

  expect(info?.version,).toBe("4.5.15",);
  expect(info?.supported,).toBe(true,);
});

test("job checks exit codes and stamps provenance even on failure", async () => {
  const recipe = join(dir, "recipe.py",);
  writeFileSync(recipe, "# operator recipe\n",);
  const stub = writeStub("fail.sh", "echo boom >&2; exit 7",);
  const result = await runBlenderJob({ binary: stub, scriptPath: recipe, stage: "bake", timeoutMs: 2_000, },);
  expect(result.ok,).toBe(false,);
  if (result.ok) { return; }
  expect(result.status,).toBe("failed",);
  expect(result.provenance?.exitCode,).toBe(7,);
  expect(result.provenance?.scriptDigest,).toHaveLength(64,);
});

test("job passes strict Python exit codes and an opaque payload", async () => {
  const recipe = join(dir, "recipe.py",);
  writeFileSync(recipe, "# operator recipe\n",);
  const argvPath = join(dir, "job-argv",);
  const stub = writeStub("argv.sh", `printf '%s\\n' "$@" > ${argvPath}`,);

  const result = await runBlenderJob({
    binary: stub,
    scriptPath: recipe,
    stage: "bake",
    params: { id: 7, },
    timeoutMs: 2_000,
  },);

  expect(result.ok,).toBe(true,);
  const argv = readLines(argvPath,);
  expect(argv.slice(0, 8,),).toEqual([
    "--background",
    "--factory-startup",
    "-noaudio",
    "--python-exit-code",
    "1",
    "--python",
    recipe,
    "--",
  ],);

  expect(JSON.parse(argv[8] ?? "",),).toEqual({ stage: "bake", params: { id: 7, }, },);
});

test("job rejects non-recipes and unknown stages before spawning", async () => {
  const badPath = await runBlenderJob({ scriptPath: join(dir, "recipe.txt",), stage: "bake", },);
  expect(badPath.ok,).toBe(false,);
  if (!badPath.ok) { expect(badPath.status,).toBe("invalid",); }
  const recipe = join(dir, "recipe.py",);
  writeFileSync(recipe, "# recipe\n",);
  const badStage = await runBlenderJob({ scriptPath: recipe, stage: "unknown" as "bake", },);
  expect(badStage.ok,).toBe(false,);
  if (!badStage.ok) { expect(badStage.status,).toBe("invalid",); }
});

test("provenance digest tracks recipe bytes at the same path", async () => {
  const recipe = join(dir, "recipe.py",);
  const stub = writeStub("noop.sh", "exit 0",);
  writeFileSync(recipe, "# recipe A\n",);
  const first = await runBlenderJob({ binary: stub, scriptPath: recipe, stage: "bake", timeoutMs: 2_000, },);
  const repeated = await runBlenderJob({ binary: stub, scriptPath: recipe, stage: "bake", timeoutMs: 2_000, },);
  writeFileSync(recipe, "# recipe B\n",);
  const changed = await runBlenderJob({ binary: stub, scriptPath: recipe, stage: "bake", timeoutMs: 2_000, },);

  expect(first.ok,).toBe(true,);
  expect(repeated.ok,).toBe(true,);
  expect(changed.ok,).toBe(true,);
  if (!first.ok || !repeated.ok || !changed.ok) { return; }
  expect(repeated.provenance.scriptDigest,).toBe(first.provenance.scriptDigest,);
  expect(changed.provenance.scriptDigest,).not.toBe(first.provenance.scriptDigest,);
});

test("job rejects an unreadable recipe without spawning", async () => {
  const result = await runBlenderJob({ scriptPath: join(dir, "missing.py",), stage: "bake", },);
  expect(result.ok,).toBe(false,);
  if (result.ok) { return; }
  expect(result.status,).toBe("invalid",);
  expect(result.message,).toContain("Cannot read recipe",);
  expect(result.provenance,).toBeUndefined();
});

test("jobs on one instance run FIFO without overlap", async () => {
  const logPath = join(dir, "events",);
  const recipe = join(dir, "recipe.py",);
  writeFileSync(recipe, "# recipe\n",);
  const stub = writeStub(
    "job.sh",
    `echo "start $9" >> ${logPath}; sleep 0.1; echo "end $9" >> ${logPath}; echo BLENDER_JOB=ok`,
  );

  const [first, second,] = await Promise.all([
    runBlenderJob({
      binary: stub,
      scriptPath: recipe,
      stage: "bake",
      params: { id: 1, },
      instanceId: "box-a",
      timeoutMs: 2_000,
    },),
    runBlenderJob({
      binary: stub,
      scriptPath: recipe,
      stage: "export-glb",
      params: { id: 2, },
      instanceId: "box-a",
      timeoutMs: 2_000,
    },),
  ],);

  expect(first.ok,).toBe(true,);
  expect(second.ok,).toBe(true,);
  const events = readLines(logPath,);
  const starts = events.map((line,) => line.startsWith("start",));
  expect(starts,).toEqual([true, false, true, false,],);
  expect(events[0],).toContain('"id":1',);
  expect(events[2],).toContain('"id":2',);
});

test("separate instances are not serialized together", async () => {
  const logPath = join(dir, "parallel",);
  const recipe = join(dir, "recipe.py",);
  writeFileSync(recipe, "# recipe\n",);
  const stub = writeStub("parallel.sh", `echo start >> ${logPath}; sleep 0.3; echo end >> ${logPath}`,);
  const results = await Promise.all([
    runBlenderJob({ binary: stub, scriptPath: recipe, stage: "bake", instanceId: "box-a", timeoutMs: 2_000, },),
    runBlenderJob({ binary: stub, scriptPath: recipe, stage: "bake", instanceId: "box-b", timeoutMs: 2_000, },),
  ],);

  expect(results.every((result,) => result.ok),).toBe(true,);
  expect(readLines(logPath,),).toEqual(["start", "start", "end", "end",],);
});

test("pinned version and stage set stay in sync with the parser", () => {
  expect(REQUIRED_BLENDER_VERSION,).toBe("4.5.15",);
  expect([...BLENDER_STAGES,],).toEqual(["voxel-remesh", "quadriflow", "smart-uv", "bake", "export-glb",],);
  const caps = parseBlenderCapabilities('BLENDER_CAP={"version":"4.5.15 LTS","stages":["bake"]}',);
  expect(caps?.supported,).toBe(true,);
  expect(caps?.stages,).toEqual(["bake",],);
});

const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";

/**
 * `Bun.spawnSync` throws when the binary is absent, so a missing python3 must
 * be caught - otherwise the whole file dies instead of skipping.
 */
function pythonAvailable(): boolean {
  try {
    const result = Bun.spawnSync([PYTHON_BIN, "--version",], { stdout: "pipe", stderr: "pipe", },);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

const HAS_PYTHON = pythonAvailable();

/**
 * Fake `bpy` whose operator namespaces answer `hasattr` for every name but
 * expose only the listed operators through `dir()` - exactly how Blender's
 * dynamic `bpy.ops` namespaces behave.
 */
const FAKE_BPY = `class _Ops:
    def __init__(self, names):
        self._names = list(names)

    def __getattr__(self, name):
        return object()

    def __dir__(self):
        return list(self._names)


class _OpsRoot:
    def __init__(self):
        self.object = _Ops(["voxel_remesh", "bake"])
        self.uv = _Ops(["smart_project"])
        self.export_scene = _Ops(["gltf"])


class _App:
    version_string = "4.5.15 LTS"


ops = _OpsRoot()
app = _App()
`;

/**
 * Proves the fake is adversarial (`hasattr` lies, only `dir()` tells the truth)
 * and that the fake module is the one actually imported - a real `bpy` pip
 * package would otherwise shadow it and silently weaken the assertion.
 */
const HASATTR_PROBE = `import bpy
print(hasattr(bpy.ops.object, "quadriflow_remesh"), hasattr(bpy.ops.object, "totally_bogus"))
print(bpy.__file__)
`;

test.skipIf(!HAS_PYTHON,)(
  "probe advertises only operators the fake bpy namespace exposes via dir()",
  () => {
    const fakeDir = join(dir, "fake-bpy",);
    mkdirSync(fakeDir, { recursive: true, },);
    writeFileSync(join(fakeDir, "bpy.py",), FAKE_BPY, { encoding: "utf8", },);

    // The probe expression is a python one-liner; run it as a script file so
    // the fake `bpy` package on the search path is the one it imports. Python
    // puts the script's own directory first on sys.path, so the fake wins over
    // any real `bpy` install. Paths must be absolute: the fixture dir is
    // relative to the repo root, and the child runs with `cwd` set to it.
    const probePath = resolve(fakeDir, "probe.py",);
    writeFileSync(probePath, `${PROBE_EXPR}\n`, { encoding: "utf8", },);

    const run = Bun.spawnSync([PYTHON_BIN, probePath,], {
      cwd: fakeDir,
      stdout: "pipe",
      stderr: "pipe",
    },);

    expect(run.exitCode,).toBe(0,);

    const caps = parseBlenderCapabilities(run.stdout.toString(),);
    expect(caps?.supported,).toBe(true,);
    expect(caps?.stages,).toEqual(["voxel-remesh", "smart-uv", "bake", "export-glb",],);
    expect(caps?.stages,).not.toContain("quadriflow",);

    // The fake makes `hasattr` true for everything, so an hasattr-based probe
    // would have advertised the missing operator too.
    const hasattrPath = resolve(fakeDir, "hasattr_probe.py",);
    writeFileSync(hasattrPath, HASATTR_PROBE, { encoding: "utf8", },);

    const hasattrRun = Bun.spawnSync([PYTHON_BIN, hasattrPath,], {
      cwd: fakeDir,
      stdout: "pipe",
      stderr: "pipe",
    },);

    const hasattrOut = hasattrRun.stdout.toString().trim().split("\n",);
    expect(hasattrOut[0],).toBe("True True",);
    // The fake must be the imported module, not a real `bpy` install.
    expect(hasattrOut[1],).toBe(resolve(fakeDir, "bpy.py",),);
  },
);
