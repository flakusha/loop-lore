// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Model discovery + capability enrichment
 * (TASK-model-discovery-capability-enrichment, epic-external-harness-acp).
 *
 * Answers "which models does each configured harness profile offer?"
 * without ever spawning a binary: live answers come only from EXISTING
 * adapter connections (`ProfileRegistry.connection()`, present once a
 * probe or dispatch succeeded); every other profile degrades to what
 * static config knows (its tier models + flavor). Live vs static is a
 * discriminated union, so consumers can tell harness-verified ids from
 * configured-only guesses.
 *
 * Enrichment merges the static capability table
 * (`src/admin/model-capabilities.ts`) onto each id — context window,
 * max output, modalities, tool/vision/thinking — read-only, never written
 * back. Model ids are `provider/id` strings, so the prefix is the table's
 * provider key and the remainder its model key (a prefix-less id keys on
 * the profile's flavor).
 *
 * Epic guardrails honored here: no credential reads, no permission-queue
 * interaction, no spawn-for-listing, fail-soft per profile (one profile's
 * failure never throws and never affects the others).
 */

import type { Kysely, } from "kysely";
import { resolveModelCapabilities, } from "../../admin/model-capabilities";
import { type AcpProfileConfig, HARNESS_TIERS, type HarnessFlavor, } from "../../config/schema/harness";
import type { DB, } from "../../db/schema";
import type { RoutableModel, } from "../../generation/routing/router";
import type { TaskCapability, } from "../../generation/routing/task-signal";
import { getChildLogger, } from "../../logger";
import type { HarnessAcpAdapter, } from "./adapter-types";
import type { HarnessRuntime, } from "./runtime";

/** Logger; null-safe — discovery may run beside boot. */
const log = (): ReturnType<typeof getChildLogger> => getChildLogger("harness-acp",);

/** Reason recorded on static entries when the profile has no live connection. */
export const NO_LIVE_CONNECTION_REASON = "no live connection — reported from static profile config";

/** Capability facts merged onto a model id from the static capability table. */
export interface HarnessModelCapabilities {
  contextWindow: number | null;
  maxOutput: number | null;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsThinking: boolean;
  modalities: string[];
}

/** One model id a live harness listing reported. */
export interface HarnessReportedModel {
  source: "harness";
  /** Profile that reported the id. */
  profile: string;
  /** The profile's harness flavor (adapter family). */
  harness: HarnessFlavor;
  /** Core-facing `provider/id` id, as the adapter advertised it. */
  model: string;
  capabilities: HarnessModelCapabilities | null;
}

/** One model id known only from static profile config (no live listing). */
export interface StaticFallbackModel {
  source: "static";
  /** Profile the id is configured under. */
  profile: string;
  /** The profile's harness flavor (adapter family). */
  harness: HarnessFlavor;
  /** Configured `provider/id` tier model. */
  model: string;
  /** Why the harness listing was unavailable (no connection / listing failure). */
  reason: string;
  capabilities: HarnessModelCapabilities | null;
}

/** Discriminated union: harness-verified vs configured-only model ids. */
export type HarnessModelEntry = HarnessReportedModel | StaticFallbackModel;

/** One profile's discovery outcome. */
export interface ProfileModels {
  profile: string;
  harness: HarnessFlavor;
  models: HarnessModelEntry[];
}

/** Options for {@link discoverHarnessModels}. */
export interface DiscoverHarnessModelsOptions {
  /** The composed runtime (existing registry connections + config snapshot). */
  runtime: HarnessRuntime;
  /** Kysely handle for the static capability table. */
  db: Kysely<DB>;
}

/**
 * Split a `provider/id` model id into the capability table's keys. A
 * prefix-less (or malformed) id keys on the profile's flavor instead.
 * @param options - the model id and the profile's flavor
 * @returns provider + model keys for the capability table.
 */
function capabilityKeys(options: { model: string; harness: HarnessFlavor },): {
  providerId: string;
  modelId: string;
} {
  const slash = options.model.indexOf("/",);
  if (slash <= 0 || slash === options.model.length - 1) {
    return { providerId: options.harness, modelId: options.model, };
  }

  return {
    providerId: options.model.slice(0, slash,),
    modelId: options.model.slice(slash + 1,),
  };
}

/**
 * Merge one id's enrichment from the static capability table. Fail-soft:
 * a lookup error omits capabilities instead of failing the discovery.
 * @param options - db handle, model id, and the profile's flavor
 * @returns capability facts, or null when the table does not know the model.
 */
async function enrichModel(
  options: { db: Kysely<DB>; model: string; harness: HarnessFlavor },
): Promise<HarnessModelCapabilities | null> {
  const { providerId, modelId, } = capabilityKeys({ model: options.model, harness: options.harness, },);
  try {
    const caps = await resolveModelCapabilities(options.db, providerId, modelId,);
    if (!caps) { return null; }

    return {
      contextWindow: caps.contextWindow,
      maxOutput: caps.maxOutput,
      supportsTools: caps.supportsTools,
      supportsVision: caps.supportsVision,
      supportsThinking: caps.supportsThinking,
      modalities: caps.modalities,
    };
  } catch (error) {
    log()?.warn("harness model enrichment failed — capabilities omitted", {
      model: options.model,
      error: (error as Error).message,
    },);

    return null;
  }
}

/**
 * Static-config entries for one profile: its tier models in
 * `HARNESS_TIERS` order, deduplicated, capabilities left for enrichment.
 * An unknown profile (no config) yields no entries.
 * @param options - profile config (or undefined when unknown), its name,
 *   and the reason no live listing was available
 * @returns the static entries.
 */
export function staticHarnessModels(options: {
  profile: AcpProfileConfig | undefined;
  name: string;
  reason: string;
},): HarnessModelEntry[] {
  const cfg = options.profile;
  if (!cfg) { return []; }

  const harness: HarnessFlavor = cfg.harness ?? "omp";
  const seen = new Set<string>();
  const entries: HarnessModelEntry[] = [];
  for (const tier of HARNESS_TIERS) {
    const model = cfg.tiers[tier]?.model ?? "";
    if (model.length === 0 || seen.has(model,)) { continue; }

    seen.add(model,);
    entries.push({
      source: "static",
      profile: cfg.name,
      harness,
      model,
      reason: options.reason,
      capabilities: null,
    },);
  }

  return entries;
}

/**
 * Discover the models each configured profile offers, enriched from the
 * static capability table. Never spawns: live listings come only from
 * already-open connections; every other profile reports its static config.
 * Never throws for one profile's failure — that profile degrades to
 * static entries while the others are unaffected.
 * @param options - composed runtime + db handle
 * @returns one entry set per configured profile, in preference order.
 */
export async function discoverHarnessModels(options: DiscoverHarnessModelsOptions,): Promise<ProfileModels[]> {
  // Concurrent: each profile asks its OWN connection (separate process) and
  // its enrichment reads are independent; allSettled keeps preference order
  // and never lets one profile's harness failure sink the others. A
  // rejection here can only be a programming error (harness and enrichment
  // failures are caught inside discoverProfileModels) — surface it loudly.
  const settled = await Promise.allSettled(
    options.runtime.acp.profiles.map((profile,) =>
      discoverProfileModels({ runtime: options.runtime, db: options.db, profile, },)
    ),
  );

  return settled.map((outcome,) => {
    if (outcome.status === "fulfilled") { return outcome.value; }

    throw outcome.reason;
  },);
}

/**
 * Discover one profile's models: ask the existing connection when there is
 * one (degrading to static config on a listing failure), else static config
 * directly — then enrich every distinct id from the capability table.
 * @param options - runtime, db handle, and the profile's config
 * @returns the profile's enriched entry set.
 */
async function discoverProfileModels(options: {
  runtime: HarnessRuntime;
  db: Kysely<DB>;
  profile: AcpProfileConfig;
},): Promise<ProfileModels> {
  const cfg = options.profile;
  const harness: HarnessFlavor = cfg.harness ?? "omp";
  const adapter = options.runtime.registry.connection(cfg.name,);
  let entries: HarnessModelEntry[];
  if (!adapter) {
    entries = staticHarnessModels({ profile: cfg, name: cfg.name, reason: NO_LIVE_CONNECTION_REASON, },);
  } else {
    entries = await listedOrStaticEntries({ adapter, profile: cfg, harness, },);
  }

  // Enrichment reads are independent I/O (capability-table lookups) — run
  // them concurrently over the distinct ids, then map results back by id.
  // enrichModel is total (it catches its own lookup failures), so every
  // outcome arrives fulfilled; a rejected outcome degrades to null like a
  // lookup miss instead of sinking the profile.
  const distinct = [...new Set(entries.map((entry,) => entry.model),),];
  const settled = await Promise.allSettled(
    distinct.map((model,) => enrichModel({ db: options.db, model, harness, },)),
  );

  const enrichments = new Map<string, HarnessModelCapabilities | null>(
    distinct.map((model, index,) => {
      const outcome = settled[index];
      return [model, outcome?.status === "fulfilled" ? outcome.value : null,];
    },),
  );

  return {
    profile: cfg.name,
    harness,
    models: entries.map((entry,) => ({ ...entry, capabilities: enrichments.get(entry.model,) ?? null, })),
  };
}

/**
 * List one profile's models over its live connection, deduplicated, or —
 * when the listing rejects — fall back to that profile's static config
 * with the failure detail as the reason. The failure never propagates.
 * @param options - the live adapter, the profile's config, and its flavor
 * @returns harness-reported entries, or static fallback entries.
 */
async function listedOrStaticEntries(options: {
  adapter: HarnessAcpAdapter;
  profile: AcpProfileConfig;
  harness: HarnessFlavor;
},): Promise<HarnessModelEntry[]> {
  let ids: string[];
  try {
    ids = await options.adapter.enumerateModels();
  } catch (error) {
    const message = (error as Error).message;
    log()?.warn("harness model listing failed — profile degrades to static", {
      profile: options.profile.name,
      error: message,
    },);

    return staticHarnessModels({ profile: options.profile, name: options.profile.name, reason: message, },);
  }

  const seen = new Set<string>();
  const entries: HarnessModelEntry[] = [];
  for (const model of ids) {
    if (model.length === 0 || seen.has(model,)) { continue; }

    seen.add(model,);
    entries.push({
      source: "harness",
      profile: options.profile.name,
      harness: options.harness,
      model,
      capabilities: null,
    },);
  }

  return entries;
}

/**
 * Project discovered entries onto the shared router's candidate shape, so a
 * harness dispatch site can feed them to `ModelRouter.route` with an existing
 * `TaskSignal`. Input order is preserved (the router treats it as
 * preference).
 * @param entries - discovered (already enriched) entries
 * @returns `RoutableModel` candidates.
 */
export function toRoutableCandidates(entries: HarnessModelEntry[],): RoutableModel[] {
  return entries.map((entry,) => {
    const capabilities: Partial<Record<TaskCapability, boolean>> = {};
    const caps = entry.capabilities;
    if (caps) {
      capabilities.tools = caps.supportsTools;
      capabilities.thinking = caps.supportsThinking;
      if (caps.modalities.includes("text",)) { capabilities.text = true; }
      if (caps.modalities.includes("image",)) { capabilities.image = true; }
    }

    return {
      name: entry.profile,
      model: entry.model,
      capabilities,
      contextWindow: caps?.contextWindow ?? undefined,
      maxOutputTokens: caps?.maxOutput ?? undefined,
    };
  },);
}
