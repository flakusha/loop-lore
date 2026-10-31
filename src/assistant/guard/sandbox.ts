// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 300

/**
 * Layer 3 of the assistant tool guard — the per-call sandbox.
 *
 * The tool call runs in-process, scoped by an `AsyncLocalStorage` context
 * that carries the call's allowlists. One process-wide `globalThis.fetch`
 * wrapper and one `node:fs` / `node:fs/promises` wrapper are installed at
 * module load; each consults the active scope and enforces the allowlist.
 * With no scope active they behave exactly as before, so the rest of the app
 * is untouched.
 *
 * Why in-process and not a `Worker`: a `Kysely<DB>` handle cannot cross a
 * Worker boundary (it clones into an empty object and loses its session), and
 * Bun exposes no `ResourceLimits` equivalent, so neither the DB nor a memory
 * ceiling could live inside a worker.
 *
 * ponytail: `memoryMb` is declared but not enforced — Bun has no
 * ResourceLimits; enforce via a worker-side DB RPC layer if per-call memory
 * isolation ever matters. The timeout IS enforced.
 *
 * Both allowlists FAIL CLOSED: an empty network allowlist refuses every
 * outbound request, an empty filesystem allowlist refuses every read and
 * every write. A missing allowlist is a misconfiguration, not a permission.
 *
 * Interception coverage, verified on this runtime by executed probes:
 *
 * - The patch mutates the CJS module objects `require("node:fs")` and
 *   `require("node:fs/promises")` return. `fs.promises` IS that same
 *   promises object, so patching it also covers `fs.promises.readFile`.
 * - `import fs from "node:fs"` binds the module OBJECT; the member lookup
 *   happens when the call is made, so the patch applies regardless of the
 *   order the modules were linked in. `require("node:fs")` is the same
 *   object.
 * - A static named import (`import { readFileSync } from "node:fs"`) binds
 *   the FUNCTION when the importing module is linked — before any patch can
 *   land. Such a call is NEVER intercepted, whatever the import order.
 *   Every production module a command handler can reach therefore uses the
 *   default-import form (`fs.readFileSync(...)`) instead.
 * - A dynamic `import("node:fs")` namespace is a separate read-only object
 *   in Bun and cannot be patched.
 * - `Bun.fetch` is read-only too, so the network allowlist covers
 *   `globalThis.fetch` only; `node:http(s)` is not intercepted at all.
 *
 * The runtime-specific part of that story is isolated in ONE resolution
 * point, `resolveFsModules()`; everything else in this file is env-agnostic.
 */
import { AsyncLocalStorage, } from "node:async_hooks";
import { createRequire, } from "node:module";
import { basename, dirname, join, resolve, sep, } from "node:path";
import { fileURLToPath, } from "node:url";
import type { ToolLimits, } from "../capabilities";
import {
  FS_READ_MEMBERS,
  FS_TWO_PATH_MEMBERS,
  FS_WRITE_MEMBERS,
} from "./sandbox-members";
import type { FsModule, FsScope, } from "./sandbox-members";

/** The sandbox context of one tool call. */
export interface SandboxContext {
  /** Tool the call belongs to. */
  tool: string;
  /** Hosts the call may reach. An empty list refuses every outbound request. */
  allowedNetworkHosts: string[];
  /** Directories the call may read from. An empty list refuses every read. */
  allowedFsReadPaths: string[];
  /** Directories the call may write to. An empty list refuses every write. */
  allowedFsWritePaths: string[];
  /** Resource ceilings for the call. */
  limits: ToolLimits;
}

/** The scope carried through the async context. */
interface SandboxStore {
  tool: string;
  allowedNetworkHosts: string[];
  allowedFsReadPaths: string[];
  allowedFsWritePaths: string[];
  limits: ToolLimits;
  /** Aborted when the call exceeds its timeout. */
  controller: AbortController;
}

/** Active scope, or undefined outside a sandboxed call. */
const sandboxScope = new AsyncLocalStorage<SandboxStore>();

/**
 * Normalize a host or URL to a bare lowercase hostname.
 * @param value - Host name or URL
 * @returns The hostname, or an empty string when it cannot be parsed
 */
function normalizeHost(value: string,): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) { return ""; }
  try {
    return new URL(trimmed.includes("://",) ? trimmed : `https://${trimmed}`,).hostname.toLowerCase();
  } catch {
    return trimmed;
  }
}

/**
 * Whether a host is covered by the allowlist (exact match or subdomain).
 *
 * An empty allowlist allows nothing: a call with no permitted host reaches
 * no host at all.
 * @param host - Hostname of the request
 * @param allowed - Allowed hosts
 * @returns true when the request may proceed
 */
function hostAllowed(host: string, allowed: string[],): boolean {
  if (allowed.length === 0) { return false; }
  return allowed.some((entry,) => host === entry || host.endsWith(`.${entry}`,));
}

/**
 * Resolve a path to its real (symlink-free) absolute form.
 *
 * Returns null when the path (or any existing ancestor) cannot be resolved,
 * so callers can treat resolution failure as DENY.
 * @param input - Path to resolve
 * @returns The real absolute path, or null on failure
 */
function resolveReal(input: string,): string | null {
  const absolute = resolve(input,);
  try {
    return nativeRealpathSync(absolute,);
  } catch {
    // Walk up to the nearest existing ancestor, realpath it, then re-append
    // the (still-missing) tail. Any resolution error denies.
    let current = absolute;
    const tail: string[] = [];
    while (true) {
      const parent = dirname(current,);
      if (parent === current) {
        try {
          return nativeRealpathSync(current,);
        } catch {
          return null;
        }
      }

      tail.unshift(basename(current,),);
      current = parent;
      try {
        const realParent = nativeRealpathSync(current,);
        return tail.length === 0 ? realParent : join(realParent, ...tail,);
      } catch {
        // keep walking up
      }
    }
  }
}

/**
 * Whether a path lies inside one of the allowed directories.
 *
 * An empty allowlist allows nothing: a call with no permitted directory
 * touches no file at all.
 * @param path - Path to check
 * @param allowed - Allowed directories (already resolved)
 * @returns true when the path may be touched
 */
function pathAllowed(path: string, allowed: string[],): boolean {
  if (allowed.length === 0) { return false; }
  const targetReal = resolveReal(path,);
  if (targetReal === null) { return false; }
  return allowed.some((dir,) => {
    const dirReal = resolveReal(dir,);
    if (dirReal === null) { return false; }
    return targetReal === dirReal || targetReal.startsWith(`${dirReal}${sep}`,);
  },);
}

/**
 * Extract the hostname of a fetch target.
 * @param input - The fetch input
 * @returns The hostname, or an empty string when it cannot be determined
 */
function hostOf(input: Parameters<typeof globalThis.fetch>[0],): string {
  const raw = typeof input === "string"
    ? input
    : input instanceof URL
    ? input.href
    : (input as { url?: string }).url ?? "";

  try {
    return new URL(raw,).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Resolve a path argument to an absolute path.
 *
 * A file descriptor (a number) is not a path and has no location to police,
 * so it yields null and the caller skips the check.
 * @param path - The path argument
 * @returns The absolute path, or null when the argument is not a path
 */
function absolutePath(path: unknown,): string | null {
  if (path instanceof URL) {
    try {
      return resolve(fileURLToPath(path,),);
    } catch {
      return null;
    }
  }

  if (typeof path === "string") { return resolve(path,); }
  return null;
}

/**
 * Throw when the path is outside the active scope's allowlist.
 * @throws {Error} When the path is not allowed
 * @param path - The path argument
 * @param scope - Whether the call reads or writes
 * @param store - The active scope
 * @returns {void}
 */
function assertPathAllowed(path: unknown, scope: FsScope, store: SandboxStore,): void {
  const absolute = absolutePath(path,);
  if (absolute === null) { return; }
  const allowed = scope === "read" ? store.allowedFsReadPaths : store.allowedFsWritePaths;
  if (!pathAllowed(absolute, allowed,)) {
    const reason = allowed.length === 0 ? " — no path is allowed" : "";
    throw new Error(
      `403 Forbidden in sandbox: tool "${store.tool}" may not ${scope} "${absolute}" (outside the allowed paths${reason})`,
    );
  }
}

/**
 * Wrap one fs member so it consults the active scope before running.
 * @param original - The member to wrap
 * @param scope - Whether the member reads or writes
 * @param pathArgs - How many leading arguments are paths
 * @returns The wrapped member
 */
function wrapFsMember(
  original: (...args: unknown[]) => unknown,
  scope: FsScope,
  pathArgs: number,
): (...args: unknown[]) => unknown {
  return function(this: unknown, ...args: unknown[]): unknown {
    const store = sandboxScope.getStore();
    if (store) {
      for (let index = 0; index < pathArgs; index += 1) {
        assertPathAllowed(args[index], scope, store,);
      }
    }

    return original.apply(this, args,);
  };
}

/**
 * Patch the members of one fs module object.
 * @param moduleObject - The module object to patch in place
 * @returns {void}
 */
function installFsInterceptors(moduleObject: FsModule,): void {
  for (const member of FS_READ_MEMBERS) {
    const original = moduleObject[member];
    if (!original) { continue; }
    moduleObject[member] = wrapFsMember(original, "read", 1,);
  }

  for (const member of FS_WRITE_MEMBERS) {
    const original = moduleObject[member];
    if (!original) { continue; }
    moduleObject[member] = wrapFsMember(original, "write", FS_TWO_PATH_MEMBERS.has(member,) ? 2 : 1,);
  }
}

/**
 * Resolve the fs module objects the sandbox patches.
 *
 * ENV BOUNDARY (bun-only): the patch only bites because, in this runtime, the
 * CJS module object `require("node:fs")` returns is the SAME object a
 * default ESM import binds (`import fs from "node:fs"`), and
 * `require("node:fs").promises` is the object `import fsp from
 * "node:fs/promises"` binds. Verified by executed probe on Bun, this repo's
 * only JS runtime.
 * TODO(env): bun-only — add one resolution per runtime here when a second
 * server target lands. A runtime whose `node:fs` compatibility layer returns a
 * distinct namespace object would silently stop intercepting, and that
 * failure is invisible: the guard would just allow the call.
 * @returns The `node:fs` and `node:fs/promises` module objects
 */
function resolveFsModules(): FsModule[] {
  const require_ = createRequire(import.meta.url,);
  return [require_("node:fs",) as FsModule, require_("node:fs/promises",) as FsModule,];
}

/**
 * Install the process-wide fetch and fs interceptors.
 *
 * Called once at module load. Both wrappers are inert without an active
 * sandbox scope.
 * @returns {void}
 */
function installInterceptors(): void {
  const originalFetch = globalThis.fetch;
  const wrappedFetch =
    ((input: Parameters<typeof globalThis.fetch>[0], init?: Parameters<typeof globalThis.fetch>[1],) => {
      const store = sandboxScope.getStore();
      if (!store) { return originalFetch(input, init,); }
      const host = hostOf(input,);
      if (!hostAllowed(host, store.allowedNetworkHosts,)) {
        const reason = store.allowedNetworkHosts.length === 0 ? " — no host is allowed" : "";
        return Promise.reject(
          new Error(
            `403 Forbidden in sandbox: tool "${store.tool}" may not reach "${host}" (not an allowed host${reason})`,
          ),
        );
      }

      const callerSignal = init?.signal;
      const signal = callerSignal
        ? AbortSignal.any([callerSignal, store.controller.signal,],)
        : store.controller.signal;

      return originalFetch(input, { ...init, signal, },);
    }) as typeof globalThis.fetch;

  globalThis.fetch = wrappedFetch;

  for (const moduleObject of resolveFsModules()) {
    installFsInterceptors(moduleObject,);
  }
}

/** Unpatched realpathSync, captured before the fs interceptors are installed. */
const nativeRealpathSync =
  (createRequire(import.meta.url,)("node:fs",) as { realpathSync: (p: string,) => string }).realpathSync;

installInterceptors();

/**
 * Run a tool call inside the sandbox.
 *
 * The scope applies to the callback and everything it awaits. The timeout is
 * enforced; on expiry the call is aborted and rejected, and the scope does
 * not leak into the caller.
 * @throws {Error} When the call exceeds its timeout
 * @param ctx - Tool, allowlists, and limits
 * @param fn - The call to run
 * @returns Whatever the callback returns
 */
export async function runInSandbox<T,>(ctx: SandboxContext, fn: () => Promise<T>,): Promise<T> {
  const store: SandboxStore = {
    tool: ctx.tool,
    allowedNetworkHosts: ctx.allowedNetworkHosts.map(normalizeHost,).filter((host,) => host.length > 0),
    allowedFsReadPaths: ctx.allowedFsReadPaths.map((path,) => resolve(path,)),
    allowedFsWritePaths: ctx.allowedFsWritePaths.map((path,) => resolve(path,)),
    limits: ctx.limits,
    controller: new AbortController(),
  };

  const { promise: timeout, reject: rejectTimeout, } = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    store.controller.abort();
    rejectTimeout(
      new Error(`sandbox: tool "${ctx.tool}" exceeded its ${ctx.limits.timeoutMs}ms limit`,),
    );
  }, ctx.limits.timeoutMs,);

  timer.unref?.();

  try {
    return await Promise.race([sandboxScope.run(store, fn,), timeout,],);
  } finally {
    clearTimeout(timer,);
  }
}
