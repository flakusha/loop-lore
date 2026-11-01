// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * driver.ts — the HarnessDriver seam between loop-lore and an external ACP
 * harness (TASK-acp-driver-module). A driver binds one profile: model
 * discovery, moderation-ready prompt turns, cancel, and permission
 * approval, over the flavor-resolved {@link HarnessAcpAdapter}.
 *
 * Outbound moderation is NOT re-implemented here: hosts either call
 * `runPrompt` after their own gate, or register the driver through
 * driver-bridge.ts so `createMessageBridge`'s `moderationGate` applies
 * before the prompt ever reaches the harness.
 */

import {
  HarnessAcpError,
  type HarnessAcpErrorKind,
  type HarnessAdapterCommandOptions,
  type HarnessTurnResult,
  type PendingPermission,
  type PermissionOutcome,
} from "./adapter-types";
import { resolveAdapterFactory, } from "./flavor-factories";

/** What `runPrompt` resolves with — failures are values, never throws. */
export type DriverRunResult =
  | { ok: true; turn: HarnessTurnResult }
  | { ok: false; kind: HarnessAcpErrorKind; message: string };

/** Driver options; `flavor` omitted picks the default harness flavor. */
export interface HarnessDriverOptions extends HarnessAdapterCommandOptions {
  /** Profile name the driver attributes work to. */
  profile: string;
  /** Spawn argv for the harness's ACP server. */
  command: string[];
  /** Harness flavor key (omp, opencode, codex, claude-code). */
  flavor?: string;
}

/** One bound harness profile the rest of loop-lore talks to. */
export interface HarnessDriver {
  /** Model ids the connected profile currently advertises. */
  discoverModels(): Promise<string[]>;
  /**
   * Run one prompt turn.
   * @param input - the prompt text
   */
  runPrompt(input: { prompt: string },): Promise<DriverRunResult>;
  /**
   * Cancel the in-flight turn.
   * @throws {HarnessAcpError} kind `session` when no live session exists
   */
  cancel(): Promise<void>;
  /** The open server-originated permission request, when one awaits an outcome. */
  pendingPermission(): PendingPermission | null;
  /**
   * Answer the open permission request.
   * @param outcome - the client's choice among the harness's options
   * @throws {HarnessAcpError} kind `session` when nothing is pending
   */
  approvePermission(outcome: PermissionOutcome,): void;
  /** Terminate the underlying harness process. Idempotent. */
  close(): void;
}

/**
 * Bind a driver to one profile over its flavor's adapter.
 * @param options - profile, command, and connection knobs
 * @returns the driver, once the flavor factory resolved.
 * @throws {Error} when no adapter ships for the flavor.
 */
export async function createHarnessDriver(options: HarnessDriverOptions,): Promise<HarnessDriver> {
  const adapter = await resolveAdapterFactory(options.flavor,)(options.profile, options.command, options,);

  return {
    discoverModels: () => adapter.enumerateModels(),
    async runPrompt(input,) {
      try {
        return { ok: true, turn: await adapter.prompt(input.prompt,), };
      } catch (error) {
        const kind: HarnessAcpErrorKind = error instanceof HarnessAcpError ? error.kind : "prompt";
        const message = error instanceof Error ? error.message : "unknown";
        return { ok: false, kind, message, };
      }
    },
    cancel: () => adapter.cancel(),
    pendingPermission: () => adapter.pendingPermission(),
    approvePermission: (outcome,) => adapter.respondPermission(outcome,),
    close: () => adapter.close(),
  };
}
