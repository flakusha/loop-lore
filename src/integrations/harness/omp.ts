// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * omp.ts — the omp reference {@link HarnessAcpAdapter} (harness-specific;
 * registry/selector/ledger/breaker consume only the contract). Only omp's
 * wire mapping lives here: the `MODEL_CONFIG_ID` select and the `_omp/usage`
 * quota method. The shared ACP surface (handshake, prompt, chunk collection,
 * typed errors) comes from generic-acp.ts.
 */

import {
  type HarnessAcpAdapter,
  type HarnessAdapterCommandOptions,
  type HarnessUsageReport,
} from "./adapter-types";
import { GenericAcpAdapter, type GenericAcpOptions, } from "./generic-acp";

/** Config option id omp uses for its model select (acp-agent.ts #buildConfigOptions). */
const MODEL_CONFIG_ID = "MODEL_CONFIG_ID";

/** Ext method omp answers quota probes with (packages/ai/src/usage.ts). */
const USAGE_METHOD = "_omp/usage";

/** The omp reference adapter: `MODEL_CONFIG_ID` select + `_omp/usage` quota. */
export class OmpAcpAdapter extends GenericAcpAdapter {
  protected readonly modelConfigId = MODEL_CONFIG_ID;

  /**
   * @param options - spawn argv + cwd; the handshake happens lazily on the
   * first adapter call so a missing binary surfaces as a typed probe failure.
   */
  constructor(options: GenericAcpOptions,) {
    super(options,);
  }

  /**
   * Quota reports via the omp ext method `_omp/usage`.
   * @returns normalized reports; failures surface as null via the engine.
   * @throws {HarnessAcpError} when the `_omp/usage` request fails
   */
  protected override async fetchQuotaReports(): Promise<HarnessUsageReport[] | null> {
    const result = await this.rpc!.request(USAGE_METHOD, {},) as { reports?: unknown } | null;
    const reports = Array.isArray(result?.reports,) ? result!.reports : [];
    return (reports as Array<Record<string, unknown>>).map((r,) => ({
      providerId: typeof r.providerId === "string" ? r.providerId : "unknown",
      status: this.toStatus(r.status,),
      remainingFraction: typeof r.remainingFraction === "number" ? r.remainingFraction : null,
      resetsAt: typeof r.resetsAt === "string" ? r.resetsAt : null,
    }));
  }

  /**
   * Coerce a raw report status to the normalized union.
   * @param status - raw status value
   * @returns a known status; unknown values map to `"unknown"`.
   */
  private toStatus(status: unknown,): HarnessUsageReport["status"] {
    return status === "ok" || status === "warning" || status === "exhausted" || status === "unknown"
      ? status
      : "unknown";
  }
}

/**
 * Factory the ProfileRegistry uses in production.
 * @param _profile - profile name (unused; argv carries omp's --profile)
 * @param command - the profile's spawn argv
 * @returns the omp adapter.
 */
export function createOmpAdapter(
  _profile: string,
  command: string[],
  options?: HarnessAdapterCommandOptions,
): HarnessAcpAdapter {
  return new OmpAcpAdapter({ command, ...options, },);
}
