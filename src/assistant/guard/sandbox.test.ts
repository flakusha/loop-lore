// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Layer 3 — the per-call sandbox.
 *
 * The sandbox is in-process and scoped by `AsyncLocalStorage`: one
 * process-wide fetch wrapper and one `node:fs` / `node:fs/promises` wrapper
 * consult the active scope. Inside a scope the allowlists apply; outside one
 * nothing changes.
 *
 * The fs assertions go through the default `node:fs` import, which is the
 * mutable CJS module object the sandbox patches — an ESM named import binds
 * the original function and cannot be intercepted. The production-path tests
 * go through the REAL `storeFile` of the asset service, so they prove the
 * guard blocks production code, not a mock.
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { storeFile, } from "../../assets/service/file-system";
import { runInSandbox, } from "./sandbox";

/** The directory the sandbox is allowed to touch. */
let allowedDir = "";
/** A directory outside the allowlist. */
let blockedDir = "";
/** A file inside the allowlist. */
let allowedFile = "";
/** A file outside the allowlist. */
let blockedFile = "";
/** The local server the allowlisted fetch reaches. */
let server: ReturnType<typeof Bun.serve> | undefined;
/** The local server's port. */
let port = 0;

beforeAll(() => {
  allowedDir = fs.mkdtempSync(join(tmpdir(), "guard-allowed-",),);
  blockedDir = fs.mkdtempSync(join(tmpdir(), "guard-blocked-",),);
  allowedFile = join(allowedDir, "allowed.txt",);
  blockedFile = join(blockedDir, "blocked.txt",);
  fs.writeFileSync(allowedFile, "inside",);
  fs.writeFileSync(blockedFile, "outside",);

  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("pong",),
  },);

  port = server.port ?? 0;
},);

afterAll(() => {
  server?.stop(true,);
  fs.rmSync(allowedDir, { recursive: true, force: true, },);
  fs.rmSync(blockedDir, { recursive: true, force: true, },);
},);

/**
 * Build a sandbox context for one call.
 * @param overrides - Context fields to override
 * @returns The sandbox context
 */
function context(overrides: {
  allowedNetworkHosts?: string[];
  allowedFsReadPaths?: string[];
  allowedFsWritePaths?: string[];
  timeoutMs?: number;
} = {},) {
  return {
    tool: "guard-test",
    allowedNetworkHosts: overrides.allowedNetworkHosts ?? [],
    allowedFsReadPaths: overrides.allowedFsReadPaths ?? [],
    allowedFsWritePaths: overrides.allowedFsWritePaths ?? [],
    limits: { timeoutMs: overrides.timeoutMs ?? 1_000, memoryMb: 256, },
  };
}

/**
 * Run a call and return the message of the error it rejected with.
 * @param promise - The call to run
 * @returns The rejection message, or an empty string when it resolved
 */
async function rejectionMessage(promise: Promise<unknown>,): Promise<string> {
  try {
    await promise;
    return "";
  } catch (error) {
    return (error as Error).message;
  }
}

describe("runInSandbox — network", () => {
  it("rejects a fetch to a host outside the allowlist", async () => {
    const promise = runInSandbox(
      context({ allowedNetworkHosts: ["allowed.test",], },),
      async () => await fetch("https://blocked.test/",),
    );

    await expect(promise,).rejects.toThrow(/not an allowed host/,);
  });

  it("names the refusal as a 403 Forbidden in sandbox", async () => {
    const message = await rejectionMessage(runInSandbox(
      context({ allowedNetworkHosts: ["allowed.test",], },),
      async () => await fetch("https://blocked.test/",),
    ),);

    expect(message,).toContain("403 Forbidden in sandbox",);
    expect(message,).toContain("guard-test",);
    expect(message,).toContain("blocked.test",);
  });

  it("refuses every fetch when the effective allowlist is empty", async () => {
    const message = await rejectionMessage(runInSandbox(
      context({ allowedNetworkHosts: [], },),
      async () => await fetch("https://allowed.test/",),
    ),);

    expect(message,).toContain("403 Forbidden in sandbox",);
    expect(message,).toContain("no host is allowed",);
  });

  it("allows a fetch to an allowlisted host", async () => {
    const response = await runInSandbox(
      context({ allowedNetworkHosts: ["127.0.0.1",], },),
      async () => await fetch(`http://127.0.0.1:${port}/`,),
    );

    expect(response.status,).toBe(200,);
    expect(await response.text(),).toBe("pong",);
  });

  it("leaves fetches outside a sandbox scope untouched", async () => {
    const response = await fetch(`http://127.0.0.1:${port}/`,);

    expect(response.status,).toBe(200,);
  });
});

describe("runInSandbox — filesystem", () => {
  it("rejects a read outside the allowed paths", async () => {
    const promise = runInSandbox(
      context({ allowedFsReadPaths: [allowedDir,], allowedFsWritePaths: [allowedDir,], },),
      async () => fs.readFileSync(blockedFile, "utf8",),
    );

    await expect(promise,).rejects.toThrow(/outside the allowed paths/,);
  });

  it("names the refusal as a 403 Forbidden in sandbox", async () => {
    const message = await rejectionMessage(runInSandbox(
      context({ allowedFsReadPaths: [allowedDir,], allowedFsWritePaths: [allowedDir,], },),
      async () => fs.readFileSync(blockedFile, "utf8",),
    ),);

    expect(message,).toContain("403 Forbidden in sandbox",);
    expect(message,).toContain("guard-test",);
    expect(message,).toContain(blockedFile,);
  });

  it("allows a read inside the allowed paths", async () => {
    const content = await runInSandbox(
      context({ allowedFsReadPaths: [allowedDir,], allowedFsWritePaths: [allowedDir,], },),
      async () => fs.readFileSync(allowedFile, "utf8",),
    );

    expect(content,).toBe("inside",);
  });

  it("refuses a read through a symlink escaping the allowed dir", async () => {
    const dir = fs.mkdtempSync(join(tmpdir(), "guard-symlink-",),);
    try {
      const link = join(dir, "escape.txt",);
      fs.symlinkSync(blockedFile, link,);
      const message = await rejectionMessage(runInSandbox(
        context({ allowedFsReadPaths: [dir,], allowedFsWritePaths: [dir,], },),
        async () => fs.readFileSync(link, "utf8",),
      ),);

      expect(message,).toContain("403 Forbidden in sandbox",);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true, },);
    }
  });

  it("rejects a write outside the allowed paths", async () => {
    const promise = runInSandbox(
      context({ allowedFsReadPaths: [allowedDir,], allowedFsWritePaths: [allowedDir,], },),
      async () => fs.writeFileSync(blockedFile, "tampered",),
    );

    await expect(promise,).rejects.toThrow(/outside the allowed paths/,);
    expect(fs.readFileSync(blockedFile, "utf8",),).toBe("outside",);
  });

  it("refuses every read and write when the effective allowlist is empty", async () => {
    const read = await rejectionMessage(runInSandbox(
      context({ allowedFsReadPaths: [], allowedFsWritePaths: [], },),
      async () => fs.readFileSync(allowedFile, "utf8",),
    ),);

    const write = await rejectionMessage(runInSandbox(
      context({ allowedFsReadPaths: [], allowedFsWritePaths: [], },),
      async () => fs.writeFileSync(allowedFile, "tampered",),
    ),);

    expect(read,).toContain("403 Forbidden in sandbox",);
    expect(read,).toContain("no path is allowed",);
    expect(write,).toContain("403 Forbidden in sandbox",);
    expect(write,).toContain("no path is allowed",);
    expect(fs.readFileSync(allowedFile, "utf8",),).toBe("inside",);
  });

  it("rejects a node:fs/promises read outside the allowed paths", async () => {
    const promise = runInSandbox(
      context({ allowedFsReadPaths: [allowedDir,], allowedFsWritePaths: [allowedDir,], },),
      async () => await fsPromises.readFile(blockedFile, "utf8",),
    );

    await expect(promise,).rejects.toThrow(/403 Forbidden in sandbox/,);
  });

  it("refuses the real asset-service write path outside the allowlist", async () => {
    const assetId = "aabbccdd1122";
    const message = await rejectionMessage(runInSandbox(
      context({ allowedFsReadPaths: [allowedDir,], allowedFsWritePaths: [allowedDir,], },),
      async () => storeFile(blockedDir, assetId, "evil.txt", Buffer.from("pwned",),),
    ),);

    expect(message,).toContain("403 Forbidden in sandbox",);
    expect(message,).toContain("outside the allowed paths",);
    // Nothing landed on disk — not even the directory the asset service made.
    expect(fs.existsSync(join(blockedDir, "raw", "aa", "bb", `${assetId}.txt`,),),).toBe(false,);
  });

  it("allows the real asset-service write path inside the allowlist", async () => {
    const assetId = "1122aabbccdd";
    const stored = await runInSandbox(
      context({ allowedFsReadPaths: [allowedDir,], allowedFsWritePaths: [allowedDir,], },),
      async () => storeFile(allowedDir, assetId, "ok.txt", Buffer.from("fine",),),
    );

    expect(stored,).toBe(`raw/11/22/${assetId}.txt`,);

    const written = await runInSandbox(
      context({ allowedFsReadPaths: [allowedDir,], allowedFsWritePaths: [allowedDir,], },),
      async () => fs.readFileSync(join(allowedDir, stored,), "utf8",),
    );

    expect(written,).toBe("fine",);
  });

  it("leaves reads outside a sandbox scope untouched", () => {
    expect(fs.readFileSync(blockedFile, "utf8",),).toBe("outside",);
  });
});

describe("runInSandbox — timeout", () => {
  it("rejects a call that runs past its limit", async () => {
    const promise = runInSandbox(
      context({ timeoutMs: 20, },),
      async () => {
        await new Promise((resolve,) => setTimeout(resolve, 500,));
        return "too late";
      },
    );

    await expect(promise,).rejects.toThrow(/exceeded its 20ms limit/,);
  });

  it("does not leak the sandbox scope after a timeout", async () => {
    await expect(runInSandbox(
      context({ timeoutMs: 20, allowedFsReadPaths: [allowedDir,], allowedFsWritePaths: [allowedDir,], },),
      async () => {
        await new Promise((resolve,) => setTimeout(resolve, 500,));
        return "too late";
      },
    ),).rejects.toThrow(/exceeded its 20ms limit/,);

    // The scope is gone: a read outside the allowlist works again.
    expect(fs.readFileSync(blockedFile, "utf8",),).toBe("outside",);
  });
});
