// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 400

/**
 * scripts/dev/two-instance-harness.ts — local multi-instance layout harness.
 *
 * Layout mode (default) resolves every per-instance path with the repo's own
 * resolvers (packages/core/src/config/state-dir.ts, the file src/config/state-dir.ts
 * re-exports), prints one row per instance and asserts the isolation
 * invariants: the state dir, DB path, uploads dir and exec-log path are
 * pairwise distinct, and the DB path sits inside the instance state dir.
 *
 * Boot mode (--boot) additionally starts the instances on distinct ports and
 * proves that a second instance on an already-bound port fails loudly
 * (EADDRINUSE / port-conflict message) instead of silently taking another
 * address of the same host name.
 *
 * Usage:
 *   bun scripts/dev/two-instance-harness.ts --slug alpha --slug beta
 *   bun scripts/dev/two-instance-harness.ts --slug a --slug b --slug c
 *   bun scripts/dev/two-instance-harness.ts --boot --port 4310
 */

import { type ChildProcess, spawn, } from "node:child_process";
import { mkdirSync, readFileSync, } from "node:fs";
import { connect, } from "node:net";
import { join, sep, } from "node:path";
import { resolveDbPath, resolveInstanceDir, resolveInstanceSlug, } from "../../packages/core/src/config/state-dir";
import { resolveUploadDir, } from "../../src/assets/service/file-system";
import { getExecLogPath, } from "../../src/harness/exec-log";

/** Repo root — this file lives at <root>/scripts/dev/. */
const REPO_ROOT = join(import.meta.dir, "..", "..",);

/** One instance's resolved layout. */
interface InstanceLayout {
  /** Requested slug. */
  slug: string;
  /** Slug after the resolver's sanitizing. */
  resolvedSlug: string;
  /** Port the instance would bind. */
  port: number;
  /** Per-instance state dir. */
  stateDir: string;
  /** SQLite file of the instance. */
  dbPath: string;
  /** Uploads dir of the instance. */
  uploadsDir: string;
  /** Harness exec log of the instance. */
  execLogPath: string;
}

/** Parsed CLI options. */
interface Options {
  /** Instance slugs, in order. */
  slugs: string[];
  /** First port; the n-th instance uses port + n. */
  port: number;
  /** Boot the instances and probe the port conflict. */
  boot: boolean;
}

/**
 * Parse the CLI args. `--slug` may repeat; without it two default slugs are used.
 * @param argv - args without the node/bun prefix
 * @returns the parsed options
 */
function parseArgs(argv: readonly string[],): Options {
  const slugs: string[] = [];
  let port = 3000;
  let boot = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--slug") {
      const value = argv[i + 1];
      if (value === undefined) { throw new Error("--slug requires a value",); }
      slugs.push(value,);
      i++;
    } else if (arg === "--port") {
      const value = Number(argv[i + 1],);
      if (!Number.isInteger(value,) || value <= 0) { throw new Error("--port requires a positive integer",); }
      port = value;
      i++;
    } else if (arg === "--boot") {
      boot = true;
    } else {
      throw new Error(`unknown argument: ${arg}`,);
    }
  }

  if (slugs.length === 0) { slugs.push("alpha", "beta",); }

  return { slugs, port, boot, };
}

/**
 * Resolve one instance's layout with the repo's own resolvers.
 * @param slug - requested instance slug
 * @param port - port the instance would bind
 * @returns the resolved layout
 */
function resolveLayout(slug: string, port: number,): InstanceLayout {
  const env: Record<string, string | undefined> = {
    ...process.env,
    LOOP_LORE_INSTANCE: slug,
    PORT: String(port,),
  };

  const stateDir = resolveInstanceDir(env,);
  const dbPath = resolveDbPath(env,);
  // The shipped default upload dir is `${DATA_DIR}/uploads`, i.e. uploads live
  // inside the instance dir. resolveUploadDir() resolves a relative upload dir
  // against the instance dir, so it yields the same per-instance path.
  const uploadsDir = resolveUploadDir("uploads", { instanceDir: stateDir, },);

  // The exec log path is owned by src/harness/exec-log.ts (getExecLogPath():
  // <instance dir>/harness/executions.jsonl). It reads process.env, so the
  // instance slug is applied around the call and restored afterwards.
  const savedInstance = process.env.LOOP_LORE_INSTANCE;
  process.env.LOOP_LORE_INSTANCE = slug;
  const execLogPath = getExecLogPath() ?? join(stateDir, "harness", "executions.jsonl",);
  if (savedInstance === undefined) { delete process.env.LOOP_LORE_INSTANCE; }
  else {
    process.env.LOOP_LORE_INSTANCE = savedInstance;
  }

  return {
    slug,
    resolvedSlug: resolveInstanceSlug(env,),
    port,
    stateDir,
    dbPath,
    uploadsDir,
    execLogPath,
  };
}

/**
 * Print the layout table.
 * @param layouts - one entry per instance
 */
function printTable(layouts: readonly InstanceLayout[],): void {
  const headers = ["slug", "port", "instance state dir", "db path", "uploads dir", "exec log path",];
  const rows = layouts.map((layout,) => [
    layout.slug,
    String(layout.port,),
    layout.stateDir,
    layout.dbPath,
    layout.uploadsDir,
    layout.execLogPath,
  ]);
  const widths = headers.map((header, index,) => {
    return Math.max(header.length, ...rows.map((row,) => (row[index] ?? "").length),);
  },);
  const line = (cells: readonly string[],): string => {
    return cells.map((cell, index,) => cell.padEnd(widths[index] ?? 0,)).join("  ",).trimEnd();
  };

  console.log(line(headers,),);
  console.log(widths.map((width,) => "-".repeat(width,)).join("  ",),);
  for (const row of rows) { console.log(line(row,),); }
}

/**
 * Check the isolation invariants.
 * @param layouts - one entry per instance
 * @returns the failure messages (empty when every invariant holds)
 */
function checkInvariants(layouts: readonly InstanceLayout[],): string[] {
  const failures: string[] = [];
  const distinct: [keyof InstanceLayout, string,][] = [
    ["stateDir", "instance state dir",],
    ["dbPath", "db path",],
    ["uploadsDir", "uploads dir",],
    ["execLogPath", "exec log path",],
  ];

  for (const [key, label,] of distinct) {
    const seen = new Map<string, string>();
    for (const layout of layouts) {
      const value = String(layout[key],);
      const other = seen.get(value,);
      if (other !== undefined) {
        failures.push(`${label} collides: "${layout.slug}" and "${other}" both resolve to ${value}`,);
      } else {
        seen.set(value, layout.slug,);
      }
    }
  }

  for (const layout of layouts) {
    if (!layout.dbPath.startsWith(layout.stateDir + sep,)) {
      failures.push(`db path of "${layout.slug}" is not inside its instance state dir (${layout.dbPath})`,);
    }
    if (!layout.uploadsDir.startsWith(layout.stateDir + sep,)) {
      failures.push(`uploads dir of "${layout.slug}" is not inside its instance state dir (${layout.uploadsDir})`,);
    }
    if (!layout.execLogPath.startsWith(layout.stateDir + sep,)) {
      failures.push(`exec log path of "${layout.slug}" is not inside its instance state dir (${layout.execLogPath})`,);
    }
    if (layout.resolvedSlug !== layout.slug) {
      failures.push(`slug "${layout.slug}" was rewritten to "${layout.resolvedSlug}" by the resolver`,);
    }
  }

  return failures;
}

/**
 * Read the runnable entry out of package.json's dev script.
 * @returns the entry path, relative to the repo root
 */
function devEntry(): string {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json",), "utf8",),) as {
    scripts?: Record<string, string>;
  };
  const dev = pkg.scripts?.dev ?? "";
  const match = /(src\/server\/index\.ts)/.exec(dev,);
  if (match?.[1] === undefined) {
    throw new Error(`cannot find the runnable entry in the dev script: "${dev}"`,);
  }
  return match[1];
}

/** A spawned server plus its captured output. */
interface Booted {
  /** The child process. */
  child: ChildProcess;
  /** Captured stdout/stderr. */
  output: string[];
}

/**
 * Spawn the server for one instance. No shell is involved: argv is passed as a
 * list, so no string interpolation can leak into a shell.
 * @param entry - entry path relative to the repo root
 * @param slug - instance slug
 * @param port - port to bind
 * @param stateRoot - state root for the instance
 * @param cwd - working directory (per instance, so first-boot config does not contend)
 * @returns the spawned process handle
 */
function spawnServer(entry: string, slug: string, port: number, stateRoot: string, cwd: string,): Booted {
  const env: Record<string, string | undefined> = {
    ...process.env,
    PORT: String(port,),
    HOST: "localhost",
    LOOP_LORE_INSTANCE: slug,
    LOOP_LORE_STATE_DIR: stateRoot,
  };
  delete env.LOOP_LORE_DB_PATH;

  const output: string[] = [];
  const child = spawn("bun", [join(REPO_ROOT, entry,), "--instance", slug,], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe",],
  },);

  child.stdout?.on("data", (chunk: Buffer,) => {
    output.push(chunk.toString(),);
  },);
  child.stderr?.on("data", (chunk: Buffer,) => {
    output.push(chunk.toString(),);
  },);

  return { child, output, };
}

/**
 * Wait until a TCP port accepts a connection.
 * @param port - port to probe
 * @param timeoutMs - how long to wait
 * @returns true when the port accepted a connection
 */
async function waitForListen(port: number, timeoutMs: number,): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { promise, resolve, } = Promise.withResolvers<boolean>();
    const socket = connect({ port, host: "127.0.0.1", }, () => {
      socket.destroy();
      resolve(true,);
    },);
    socket.once("error", () => {
      socket.destroy();
      resolve(false,);
    },);
    if (await promise) { return true; }
    await new Promise((resolve,) => setTimeout(resolve, 250,));
  }

  return false;
}

/**
 * Boot the instances and probe the port conflict.
 * @param layouts - resolved layouts (the first two are booted)
 * @param scratch - scratch state root under .tmp/
 * @returns the exit code
 */
async function bootMode(layouts: readonly InstanceLayout[], scratch: string,): Promise<number> {
  const entry = devEntry();
  const booted: Booted[] = [];

  try {
    const count = Math.min(layouts.length, 2,);
    for (let index = 0; index < count; index++) {
      const layout = layouts[index];
      if (layout === undefined) { continue; }
      const cwd = join(scratch, layout.slug,);
      mkdirSync(join(cwd, "config",), { recursive: true, },);
      const bootedOne = spawnServer(entry, layout.slug, layout.port, scratch, cwd,);
      booted.push(bootedOne,);
      const listening = await waitForListen(layout.port, 60_000,);
      if (!listening) {
        console.error(`instance "${layout.slug}" did not start listening on port ${layout.port}`,);
        console.error(bootedOne.output.join("",).slice(-4000,),);
        return 2;
      }
      console.log(
        `instance "${layout.slug}" is listening on 127.0.0.1:${layout.port} (state ${join(scratch, layout.slug,)})`,
      );
    }

    const first = layouts[0];
    if (first === undefined) { return 2; }

    // A second instance on the already-bound port must fail loudly.
    const clashSlug = `${first.slug}-clash`;
    const clashCwd = join(scratch, clashSlug,);
    mkdirSync(join(clashCwd, "config",), { recursive: true, },);
    const clash = spawnServer(entry, clashSlug, first.port, scratch, clashCwd,);
    const { promise, resolve, } = Promise.withResolvers<number | null>();
    const timer = setTimeout(() => {
      clash.child.kill("SIGKILL",);
      resolve(null,);
    }, 60_000,);
    clash.child.once("exit", (code,) => {
      clearTimeout(timer,);
      resolve(code,);
    },);
    const exitCode = await promise;
    const output = clash.output.join("",).trimEnd();
    console.log(`--- second instance on port ${first.port} exited with code ${exitCode} ---`,);
    console.log(output.length > 0 ? output.slice(-4000,) : "(no output)",);

    const loud = /EADDRINUSE|already in use|port \d+/i.test(output,);
    if (!loud || exitCode === 0) {
      console.error("FAIL: the second instance on the bound port did not fail loudly with a port-conflict error",);
      return 1;
    }
    console.log("OK: the second instance failed loudly on the bound port (port-conflict / EADDRINUSE).",);
    return 0;
  } finally {
    for (const one of booted) { one.child.kill("SIGKILL",); }
  }
}

/**
 * Entry point.
 * @returns the exit code
 */
async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2,),);
  // Boot mode writes into a scratch state root under .tmp/, so the printed
  // table and the booted instances describe the same paths.
  const scratch = join(REPO_ROOT, ".tmp", "two-instance-harness", String(Date.now(),),);
  if (options.boot) { process.env.LOOP_LORE_STATE_DIR = scratch; }

  const layouts = options.slugs.map((slug, index,) => {
    return resolveLayout(slug, options.port + index,);
  },);

  printTable(layouts,);

  const failures = checkInvariants(layouts,);
  for (const failure of failures) { console.error(`FAIL: ${failure}`,); }
  if (failures.length > 0) { return 1; }

  console.log(
    `OK: ${layouts.length} instances — state dirs, db paths, uploads dirs and exec logs are pairwise distinct; every db path sits inside its instance state dir.`,
  );

  if (options.boot) { return bootMode(layouts, scratch,); }

  return 0;
}

process.exit(await main(),);
