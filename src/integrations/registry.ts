// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/registry.ts — the adapter directory behind the bridge (spec §2.4).
//
// Target-resolution strategy (of the two the ticket allows): adapters declare
// an optional `ownsTarget(target)` on ProtocolAdapter; the registry resolves a
// target to the FIRST registered adapter claiming it, in registration order.
// No central address-scheme table — targets stay opaque to the core.

import type { AdapterCapability, ProtocolAdapter, } from "./adapter";

/** Failure of `BridgeRegistry.register` — the name is already taken. */
export interface RegisterError {
  ok: false;
  code: "duplicate_name";
  message: string;
  /** Adapter currently registered under the name. */
  readonly existing: ProtocolAdapter;
}

/** Result of `register`. */
export type RegisterResult = { ok: true } | RegisterError;

/**
 * Capability-negotiation outcome: the owning adapter, or a typed miss so
 * callers can degrade (e.g. delete+resend when `message-edit` is missing).
 */
export type NegotiateResult =
  | { ok: true; adapter: ProtocolAdapter }
  | { ok: false; code: "unknown_target"; message: string }
  | {
    ok: false;
    code: "capability_missing";
    message: string;
    /** Owning adapter — the caller degrades on it rather than failing. */
    readonly adapter: ProtocolAdapter;
  };

/** Registered-adapter directory the MessageBridge routes through (spec §2.4). */
export interface BridgeRegistry {
  /** Register `adapter` under its `name`.
   * @throws never — a taken name returns `{ ok: false, code: "duplicate_name" }`. */
  register(adapter: ProtocolAdapter,): RegisterResult;
  /** Remove the adapter registered as `name`; true when one was removed. */
  unregister(name: string,): boolean;
  /** Look up an adapter by name. */
  get(name: string,): ProtocolAdapter | undefined;
  /** All registered adapters in registration order. */
  list(): ProtocolAdapter[];
  /** Adapters advertising `cap`, in registration order. */
  byCapability(cap: AdapterCapability,): ProtocolAdapter[];
  /** First registered adapter whose `ownsTarget` claims `target`. */
  resolve(target: string,): ProtocolAdapter | undefined;
  /** Resolve `target` and confirm `capability` on the owning adapter.
   * @throws never — misses return typed `{ ok: false }` results (degrade hint included). */
  negotiate(target: string, capability: AdapterCapability,): NegotiateResult;
}

/**
 * Shared unknown-target failure Result (bridge send + registry negotiate).
 * @param target Unresolved target string.
 * @returns The typed unknown-target failure.
 */
export function unknownTargetResult(target: string,): { ok: false; code: "unknown_target"; message: string } {
  return { ok: false, code: "unknown_target", message: `no adapter owns target: ${target}`, };
}

/** Build an empty {@link BridgeRegistry}.
 * @returns The registry.
 */
export function createBridgeRegistry(): BridgeRegistry {
  const adapters = new Map<string, ProtocolAdapter>();

  function resolveTarget(target: string,): ProtocolAdapter | undefined {
    for (const adapter of adapters.values()) {
      if (adapter.ownsTarget?.(target,)) { return adapter; }
    }

    return undefined;
  }

  return {
    register(adapter,) {
      const existing = adapters.get(adapter.name,);
      if (existing !== undefined) {
        return {
          ok: false,
          code: "duplicate_name",
          message: `adapter already registered: ${adapter.name}`,
          existing,
        };
      }

      adapters.set(adapter.name, adapter,);
      return { ok: true, };
    },
    unregister(name,) {
      return adapters.delete(name,);
    },
    get(name,) {
      return adapters.get(name,);
    },
    list() {
      return [...adapters.values(),];
    },
    byCapability(cap,) {
      return [...adapters.values(),].filter((adapter,) => adapter.capabilities().includes(cap,));
    },
    resolve: resolveTarget,
    negotiate(target, capability,) {
      const adapter = resolveTarget(target,);
      if (adapter === undefined) { return unknownTargetResult(target,); }
      if (!adapter.capabilities().includes(capability,)) {
        return {
          ok: false,
          code: "capability_missing",
          message: `adapter ${adapter.name} lacks capability: ${capability}`,
          adapter,
        };
      }

      return { ok: true, adapter, };
    },
  };
}
