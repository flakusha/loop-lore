// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * runtime.ts — the composition root for the outbound ACP stack
 * (TASK-acp-composition-root-wiring).
 *
 * Constructs the four-piece harness runtime exactly once, at server boot:
 * ProfileRegistry (one flavor-resolved adapter connection per profile),
 * ProfileSelector (ordered admission), UsageLedger (rolling rpm/token
 * windows) and ProfileBreaker (per-profile circuit state). Before this
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

import type { HarnessAcpConfig, } from "../../config/schema/harness";
import { type HarnessAdapterFactory, } from "./adapter-types";
import { resolveAdapterFactory, } from "./flavor-factories";
import { ProfileBreaker, } from "./profile-breaker";
import { ProfileRegistry, } from "./profile-registry";
import { ProfileSelector, } from "./profile-selector";
import { UsageLedger, } from "./usage-ledger";

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

/**
 * Compose the runtime: registry + ledger + breaker + selector sharing
 * instances — the selector holds THE registry/ledger/breaker, never copies,
 * and the breaker reads its thresholds through the registry's health config.
 * @param options - config snapshot + optional factory override
 * @returns the composed runtime.
 */
export function createHarnessRuntime(options: CreateHarnessRuntimeOptions,): HarnessRuntime {
  const factory = options.factory ?? harnessAdapterFactoryFor(options.acp,);
  const registry = new ProfileRegistry({ acp: options.acp, factory, },);
  const ledger = new UsageLedger();
  const breaker = new ProfileBreaker((profile,) => registry.healthThresholds(profile,));
  const selector = new ProfileSelector({ registry, ledger, breaker, },);
  return { acp: options.acp, registry, selector, ledger, breaker, };
}

/** The boot-composed runtime; null while disabled/unconfigured or before boot. */
let runtime: HarnessRuntime | null = null;

/**
 * Compose the harness runtime for the process. Called once at boot, beside
 * initHarnessAdminSettings, from the same config snapshot. A disabled
 * `harness.acp` composes nothing — getHarnessRuntime() stays null,
 * preserving the disabled-by-default posture (no probes, no spawns).
 * @param acp - the loaded `harness.acp` config (empty section when unconfigured)
 */
export function initHarnessRuntime(acp: HarnessAcpConfig,): void {
  runtime = acp.enabled ? createHarnessRuntime({ acp, },) : null;
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
