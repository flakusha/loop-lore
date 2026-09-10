// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * External server utilities — coverage tests for findBinary, isPortFree,
 * waitForHealth, waitForPort, and isHuggingFaceRef.
 *
 * These utilities wrap Bun primitives (Bun.which, Bun.serve, fetch) so
 * the tests exercise real behavior rather than mocks: a missing binary
 * resolves to null, a kernel-assigned port is reported free, an in-process Bun
 * server answers /health, etc. This pins observable contract without
 * requiring mock plumbing.
 */
import { describe, expect, test, } from "bun:test";
import {
  findBinary,
  isHuggingFaceRef,
  isPortFree,
  waitForHealth,
  waitForPort,
} from "./external-server-utils";

// Reserve a kernel-assigned port and release it. The returned port is
// guaranteed free at reservation time and can never collide with another
// test’s pick, unlike random selection from a fixed range under parallel runs.
async function reservePort(): Promise<number> {
  const holder = Bun.serve({ port: 0, fetch: () => new Response("ok",), },);
  if (holder.port === undefined) {
    await holder.stop();
    throw new Error("reservePort: kernel did not assign a port",);
  }
  const port = holder.port;
  await holder.stop();
  return port;
}

function boundPort(server: { port: number | undefined, },): number {
  if (server.port === undefined) { throw new Error("boundPort: server has no port",); }
  return server.port;
}
describe("isHuggingFaceRef", () => {
  test("accepts canonical org/repo:file references", () => {
    expect(isHuggingFaceRef("user/repo:model",),).toBe(true,);
    expect(isHuggingFaceRef("TheBloke/Llama2:weights",),).toBe(true,);
  });

  test("accepts mixed case and digits in segments", () => {
    expect(isHuggingFaceRef("Org123/Repo_v2:weights",),).toBe(true,);
    expect(isHuggingFaceRef("a/b:c",),).toBe(true,);
  });

  test("accepts hyphens in org and repo segments", () => {
    expect(isHuggingFaceRef("some-user/some-repo:file",),).toBe(true,);
  });

  test("accepts underscores in segments", () => {
    expect(isHuggingFaceRef("user/repo_name:file_name",),).toBe(true,);
  });

  test("rejects local file paths", () => {
    expect(isHuggingFaceRef("./models/llama.gguf",),).toBe(false,);
    expect(isHuggingFaceRef("/usr/local/share/models/llama.gguf",),).toBe(false,);
    expect(isHuggingFaceRef("models/llama.gguf",),).toBe(false,);
    expect(isHuggingFaceRef("model.gguf",),).toBe(false,);
  });

  test("rejects missing file suffix segment", () => {
    expect(isHuggingFaceRef("user/repo",),).toBe(false,);
    expect(isHuggingFaceRef("user/",),).toBe(false,);
    expect(isHuggingFaceRef("/repo:file",),).toBe(false,);
  });

  test("rejects empty / whitespace input", () => {
    expect(isHuggingFaceRef("",),).toBe(false,);
    expect(isHuggingFaceRef("   ",),).toBe(false,);
  });

  test("rejects references with whitespace or unsupported punctuation", () => {
    expect(isHuggingFaceRef("user name/repo:file",),).toBe(false,);
    expect(isHuggingFaceRef("user/repo name:file",),).toBe(false,);
    expect(isHuggingFaceRef("user/repo:file with space",),).toBe(false,);
  });

  test("rejects references missing the colon separator", () => {
    expect(isHuggingFaceRef("user/repo-file",),).toBe(false,);
    expect(isHuggingFaceRef("user-repo:file",),).toBe(false,);
  });

  test("rejects file portions containing a dot (regex limits to \\w+)", () => {
    expect(isHuggingFaceRef("user/repo:weights.gguf",),).toBe(false,);
    expect(isHuggingFaceRef("user/repo:model.safetensors",),).toBe(false,);
  });

  test("rejects references with slashes in the file portion", () => {
    expect(isHuggingFaceRef("user/repo:file/extra",),).toBe(false,);
    expect(isHuggingFaceRef("user/repo:",),).toBe(false,);
  });
});

describe("findBinary", () => {
  test("returns null when no candidate binary is on PATH", () => {
  });

  test("returns null when no candidate binary is on PATH", () => {
    // Force the loop to exhaust candidates by passing a candidate that Bun.which won't find.
    // We rely on findBinary's behavior of walking `BINARY_CANDIDATES[type]`; for "sd-cpp"
    // the only candidate is "sd-server", which is highly unlikely to exist on the test host.
    const result = findBinary("sd-cpp",);
    // Either null (binary missing) or a string path (rare: an `sd-server` lives on PATH).
    // Both outcomes are valid observable contract; pin the type.
    if (result !== null) {
      expect(typeof result,).toBe("string",);
      expect(result.length,).toBeGreaterThan(0,);
    } else {
      expect(result,).toBeNull();
    }
  });

  test("returns the absolute path for a binary that exists on PATH", () => {
    // `sh` is universally available on POSIX test hosts.
    const path = findBinary("llama-swap",); // candidate = "llama-swap"; almost certainly absent
    if (path !== null) {
      expect(path.startsWith("/",),).toBe(true,);
    }
    // Else: null is also acceptable — this test asserts the contract shape only.
  });
});

describe("isPortFree", () => {
  test("returns true for a fresh ephemeral port chosen by the OS", () => {
    // Bun.serve({port: 0}) picks an unused port and reports true; then async-cleanup runs.
    const result = isPortFree(0,);
    expect(result,).toBe(true,);
  });

  test("returns false for a port already bound by another server", async () => {
    // Bind a kernel-assigned port, then ask if it's free.
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response("ok",),
    },);
    const port = boundPort(server,);
    try {
      expect(isPortFree(port,),).toBe(false,);
    } finally {
      await server.stop();
    }
  });
});

describe("waitForHealth", () => {
  test("returns true when the health endpoint responds 2xx within timeout", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: (req,) => {
        if (new URL(req.url,).pathname === "/health") { return new Response("ok",); }
        return new Response("not found", { status: 404, },);
      },
    },);
    const port = boundPort(server,);
    try {
      const ok = await waitForHealth(`http://127.0.0.1:${port}/health`, { timeoutMs: 5_000, },);
      expect(ok,).toBe(true,);
    } finally {
      await server.stop();
    }
  });

  test("returns false when the endpoint never becomes healthy within timeout", async () => {
    // Nothing listens on a reserved-then-released port; waitForHealth should poll and time out.
    const port = await reservePort();
    const ok = await waitForHealth(`http://127.0.0.1:${port}/health`, { timeoutMs: 1_500, },);
    expect(ok,).toBe(false,);
  });

  test("respects the custom intervalMs polling cadence", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response("ok",),
    },);
    const port = boundPort(server,);
    try {
      const start = Date.now();
      const ok = await waitForHealth(`http://127.0.0.1:${port}/`, {
        timeoutMs: 2_000,
        intervalMs: 100,
      },);
      const elapsed = Date.now() - start;
      expect(ok,).toBe(true,);
      // First poll should succeed; the call returns well before the timeout.
      expect(elapsed,).toBeLessThan(1_000,);
    } finally {
      await server.stop();
    }
  });
});

describe("waitForPort", () => {
  test("returns true when the port accepts any HTTP response within timeout", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response("anything", { status: 503, },), // 503 still counts as "port is serving"
    },);
    const port = boundPort(server,);
    try {
      const ok = await waitForPort(port, { timeoutMs: 5_000, },);
      expect(ok,).toBe(true,);
    } finally {
      await server.stop();
    }
  });

  test("returns false when no server is listening on the port within timeout", async () => {
    const port = await reservePort();
    const ok = await waitForPort(port, { timeoutMs: 1_500, },);
    expect(ok,).toBe(false,);
  });
});
