// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * runtime.ts — the composition root for the outbound ACP stack
 * (TASK-acp-composition-root-wiring).
 *
 * Constructs the harness runtime exactly once, at server boot:
 * ProfileRegistry (one flavor-resolved adapter connection per profile),
 * ProfileSelector (ordered admission), UsageLedger (rolling rpm/token
 * windows), ProfileBreaker (per-profile circuit state) and PermissionQueue
 * (the approval-flow surface; asks the policy engine cannot auto-allow park
 * there for a human decision through the admin routes). Before this
 * module the whole outbound client layer was constructed only in tests
 * (review G1) — dead code at runtime.
 *
 * Posture: `harness.acp.enabled` gates composition (file config; the
 * default is disabled — nothing is composed and getHarnessRuntime() reads
 * null). After boot the EFFECTIVE admin-settings view governs: the
 * selector's master-switch + acknowledgement checks and the isolation
 * gate's spawn gate read getHarnessAdminSettings()
 * (BUG-admin-settings-overrides-never-reach-the-harness-dispatch-gu), so a
 * UI toggle suppresses selection and spawn without a restart. The runtime
 * composes from the boot-time config snapshot, the same object
 * initHarnessAdminSettings() seeds the admin settings store's file layer
 * from; file-config edits still take effect on restart.
 *
 * Consumers (dispatch paths, future route surfaces) obtain the stack via
 * getHarnessRuntime() and MUST null-check: null means the stack was never
 * composed. Spawn paths still pass through assertHarnessExecution with
 * HarnessRuntime.acp as the config input.
 */

import { open, } from "node:fs/promises";
import { resolve, } from "node:path";
import type { HarnessAcpConfig, } from "../../config/schema/harness";
import { PathOutsideScopeError, resolveWithinScope, } from "../../harness/worktree-scope";
import { getChildLogger, } from "../../logger";
import { type HarnessAdapterFactory, } from "./adapter-types";
import { resolveAdapterFactory, } from "./flavor-factories";
import { JsonRpcRequestError, } from "./jsonrpc-process";
import { PermissionQueue, } from "./permission-queue";
import { ProfileBreaker, } from "./profile-breaker";
import { ProfileRegistry, } from "./profile-registry";
import { ProfileSelector, } from "./profile-selector";
import { UsageLedger, } from "./usage-ledger";

/** Logger; null-safe — composition happens beside boot. */
const log = (): ReturnType<typeof getChildLogger> | null => getChildLogger("harness-acp",);

/** The composed outbound ACP stack, shared by every consumer of the process. */
export interface HarnessRuntime {
  /** The `harness.acp` snapshot the runtime was composed from (spawn-gate input). */
  readonly acp: HarnessAcpConfig;
  /** Probed profile registry (one adapter connection per profile). */
  readonly registry: ProfileRegistry;
  /** Ordered admission over the probed profiles. */
  readonly selector: ProfileSelector;
  /** Rolling rpm/token usage windows. */
  readonly ledger: UsageLedger;
  /** Per-profile circuit breakers. */
  readonly breaker: ProfileBreaker;
  /** Permission asks awaiting a human decision (the approval-flow surface). */
  readonly permissions: PermissionQueue;
  /**
   * The composed adapter factory — the queue-wrapped one, so a connection it
   * opens still reports its permission asks into {@link permissions}. A caller
   * that runs a turn outside the registry's own connections passes this, never
   * a bare factory (that would route asks around the queue).
   */
  readonly factory: HarnessAdapterFactory;
}

/** Options for createHarnessRuntime. */
export interface CreateHarnessRuntimeOptions {
  /** The `harness.acp` sub-config; callers gate on `enabled` (init does). */
  acp: HarnessAcpConfig;
  /** Adapter factory override; tests inject fakes, production resolves per-profile flavor. */
  factory?: HarnessAdapterFactory;
}

/**
 * Build the production adapter factory: resolves each profile's own
 * `harness` flavor through resolveAdapterFactory, so a mixed profile list
 * gets the right adapter per profile. Exported for tests (adapter
 * constructors are lazy — no spawn until the first adapter call).
 * @param acp - the profiles to resolve flavors against
 * @returns the flavor-dispatching factory.
 */
export function harnessAdapterFactoryFor(acp: HarnessAcpConfig,): HarnessAdapterFactory {
  return (profile, command, options,) => {
    const configured = acp.profiles.find((p,) => p.name === profile);
    if (!configured) {
      throw new Error(`no harness profile named "${profile}" — adapter factory cannot resolve its flavor`,);
    }

    return resolveAdapterFactory(configured.harness,)(profile, command, options,);
  };
}

/** The most bytes one `fs/read_text_file` answer carries. */
const MAX_READ_BYTES = 1024 * 1024;

/**
 * Read a file for an agent's `fs/read_text_file` ask, confined to the
 * profile's sandbox root. The path is resolved against that root and checked
 * with the scope guard the repo-access tier delegates to
 * (`worktree-scope.ts`), so a traversal or an escaping symlink is refused.
 * A raw filesystem error never reaches the agent — the refusal is a typed
 * JSON-RPC error.
 *
 * The read is NOT routed through the permission queue: ACP models the fs
 * bridge as a CLIENT capability — `fs/read_text_file` exists only when the
 * client advertises `fs.readTextFile` (vendored v1 schema,
 * `ReadTextFileRequest`) and its request carries no permission payload —
 * while `session/request_permission` is the permission surface for TOOL
 * CALLS (its request carries a required `toolCall` and an option list). The
 * spec gives a file read no ask, so the bridge answers it directly and
 * confines it to the very root the asks are judged against.
 * @param root - the sandbox root the read is confined to
 * @param path - the path the agent asked for
 * @returns the file's text
 * @throws {JsonRpcRequestError} when the path escapes the root or the read fails
 */
async function readSandboxedText(root: string, path: string,): Promise<string> {
  let resolved: string;
  try {
    resolved = await resolveWithinScope(root, path,);
  } catch (error) {
    const outside = error instanceof PathOutsideScopeError;
    log()?.warn(
      outside
        ? "harness fs read refused — path outside the sandbox root"
        : "harness fs read refused — sandbox root unusable",
      { root, path, },
    );

    throw new JsonRpcRequestError(
      outside ? "path is outside the sandbox root" : "the sandbox root could not be resolved",
      -32000,
    );
  }

  try {
    // ponytail: the reader answers the whole file, capped at 1 MiB (the
    // outer bound); the adapter slices the requested line range out of it.
    const handle = await open(resolved, "r",);
    try {
      const buffer = Buffer.alloc(MAX_READ_BYTES,);
      const { bytesRead, } = await handle.read(buffer, 0, MAX_READ_BYTES, 0,);
      return buffer.toString("utf8", 0, bytesRead,);
    } finally {
      await handle.close();
    }
  } catch {
    log()?.warn("harness fs read failed", { root, path, },);
    throw new JsonRpcRequestError("the requested file could not be read", -32000,);
  }
}

/**
 * The configured sandbox root for one profile, resolved absolute. Absent =
 * undefined, so the caller keeps its own default (the connection cwd, then
 * the process cwd) — the knob only overrides the root when set.
 * @param acp - the `harness.acp` snapshot
 * @param profile - the profile name
 * @returns the resolved root, or undefined when the profile configures none.
 */
function sandboxRootFor(acp: HarnessAcpConfig, profile: string,): string | undefined {
  const configured = acp.profiles.find((p,) => p.name === profile)?.sandboxRoot;
  return configured === undefined ? undefined : resolve(configured,);
}

/**
 * Compose the runtime: registry + ledger + breaker + selector sharing
 * instances — the selector holds THE registry/ledger/breaker, never copies,
 * and the breaker reads its thresholds through the registry's health config.
 * The permission queue rides the same registry: the composed factory wraps
 * the caller's (or the production flavor-resolving one) so every adapter
 * connection reports asks into the queue and withdrawals out of it. The
 * sandbox root an ask is judged against is the profile's configured
 * `sandboxRoot` when it has one (resolved absolute), else the connection's
 * own cwd (session/new cwd); production profiles pass none, so that is
 * `process.cwd()` — the same default the adapter hands to session/new.
 * A configured root also becomes the adapter's cwd, so the agent works in
 * the very directory its asks are judged against, and it confines the
 * `fs/read_text_file` bridge — the advertised capability is backed by a real
 * reader, not by a bridge that answers "unsupported". With no configured
 * root the bridge therefore serves the PROCESS cwd: the very directory the
 * permission asks are judged against, so the bridge never reaches further
 * than the permission surface does.
 * @param options - config snapshot + optional factory override
 * @returns the composed runtime.
 */
export function createHarnessRuntime(options: CreateHarnessRuntimeOptions,): HarnessRuntime {
  const baseFactory = options.factory ?? harnessAdapterFactoryFor(options.acp,);
  // Late-bound: the queue resolves decisions through the registry while the
  // registry is constructed with a factory that reports into the queue.
  let registry: ProfileRegistry | undefined;
  const permissions = new PermissionQueue({ connection: (profile,) => registry?.connection(profile,), },);
  const queueFactory: HarnessAdapterFactory = (profile, command, opts,) => {
    const configured = sandboxRootFor(options.acp, profile,);
    // The read bridge is confined to the SAME root the asks are judged
    // against, so the advertised `fs.readTextFile` capability is backed. ACP
    // routes no permission ask through a file read (see readSandboxedText).
    const root = configured ?? opts?.cwd ?? process.cwd();
    return baseFactory(profile, command, {
      ...opts,
      cwd: configured ?? opts?.cwd,
      readTextFile: (path,) => readSandboxedText(root, path,),
      onPermissionRequest: (pending,) => {
        void permissions
          .submit({
            profile,
            pending,
            sandboxRoot: root,
          },)
          .catch((error: unknown,) => {
            log()?.warn("harness permission evaluation failed", { profile, error: String(error,), },);
          },);
      },
      onPermissionWithdrawn: () => {
        permissions.withdrawProfile(profile,);
      },
    },);
  };

  const composed = new ProfileRegistry({ acp: options.acp, factory: queueFactory, },);
  registry = composed;
  const ledger = new UsageLedger();
  const breaker = new ProfileBreaker((profile,) => composed.healthThresholds(profile,));
  const selector = new ProfileSelector({ registry: composed, ledger, breaker, },);
  return { acp: options.acp, registry: composed, selector, ledger, breaker, permissions, factory: queueFactory, };
}

/** The boot-composed runtime; null while disabled/unconfigured or before boot. */
let runtime: HarnessRuntime | null = null;

/**
 * Compose the harness runtime for the process. Called once at boot, beside
 * initHarnessAdminSettings, from the same config snapshot. A disabled
 * `harness.acp` composes nothing — getHarnessRuntime() stays null,
 * preserving the disabled-by-default posture (no probes, no spawns).
 * @param acp - the loaded `harness.acp` config (empty section when unconfigured)
 * @param factory - adapter factory override; a dev/test seam, exactly like
 *   {@link createHarnessRuntime}'s. Production omits it.
 */
export function initHarnessRuntime(acp: HarnessAcpConfig, factory?: HarnessAdapterFactory,): void {
  runtime = acp.enabled ? createHarnessRuntime({ acp, factory, },) : null;
}

/**
 * The process's harness runtime, or null when the ACP integration is
 * disabled/unconfigured.
 * @returns the shared runtime instance.
 */
export function getHarnessRuntime(): HarnessRuntime | null {
  return runtime;
}

/** Reset the composition. Dev/test only. */
export function resetHarnessRuntime(): void {
  runtime = null;
}
