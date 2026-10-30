// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * llmfit Fit Service — process-level integration with the `llmfit` CLI.
 *
 * Shells out to `llmfit fit --json` / `llmfit system --json` and caches
 * the verdict per (hardware fingerprint, model, context) as a
 * `model_rankings` row (`scope='instance'`, `basis='formula'`).
 * When the binary is absent the service degrades to *no fit data* —
 * never to a guess.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonParseOr, jsonStringifyOr, } from "../utils";
import { toDate, } from "../utils/date";
import { recordRanking, } from "./rankings";

/** Subset of `llmfit system --json` used for the fingerprint. */
export interface LlmfitSystem {
  cpu_name?: string;
  cpu_cores?: number;
  total_ram_gb?: number;
  gpu_name?: string;
  gpu_vram_gb?: number;
  backend?: string;
  unified_memory?: boolean;
}

/** Subset of one `llmfit fit --json` model row. */
export interface LlmfitFitRow {
  name: string;
  fit_level?: string;
  score?: number;
  estimated_tps?: number | null;
  best_quant?: string;
  estimate_basis?: unknown;
  estimate_confidence?: string;
  memory_required_gb?: number;
  runnable?: boolean;
}

/**
 * Hardware fingerprint: `hw_` + 16 hex chars over the fields that
 * change the answer (CPU, RAM, GPU, backend). A box that gains a GPU
 * is a different fingerprint, so old `formula` rows never contaminate
 * the new box.
 * @param system - the `system` block from `llmfit system --json`
 */
export function hardwareFingerprint(system: LlmfitSystem,): string {
  const canonical = jsonStringifyOr({
    cpu: system.cpu_name ?? "",
    cores: system.cpu_cores ?? 0,
    ram: system.total_ram_gb ?? 0,
    gpu: system.gpu_name ?? "",
    vram: system.gpu_vram_gb ?? 0,
    backend: system.backend ?? "",
    unified: system.unified_memory ?? false,
  },);

  const hex = new Bun.CryptoHasher("sha256",).update(canonical,).digest("hex",);
  return `hw_${hex.slice(0, 16,)}`;
}

function runLlmfit(args: string[],): { ok: boolean; stdout: string } {
  try {
    const result = Bun.spawnSync(["llmfit", ...args,], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    },);

    if (!result.success) { return { ok: false, stdout: "", }; }
    return { ok: true, stdout: result.stdout.toString(), };
  } catch {
    return { ok: false, stdout: "", };
  }
}

function safeJsonParse(text: string,): Record<string, unknown> | null {
  const parsed = jsonParseOr<unknown>(text, null,);
  if (typeof parsed === "object" && parsed !== null) { return parsed as Record<string, unknown>; }
  return null;
}

/**
 * Detect the box via `llmfit system --json`. Null when the binary is
 * absent or detection fails — callers treat null as "no fit data".
 */
export function detectSystem(): LlmfitSystem | null {
  const { ok, stdout, } = runLlmfit(["system", "--json",],);
  if (!ok) { return null; }
  const parsed = safeJsonParse(stdout,);
  const system = parsed?.["system"];
  if (typeof system !== "object" || system === null) { return null; }
  return system as LlmfitSystem;
}

/**
 * Fit table via `llmfit fit --json`. Null when the binary is absent
 * or the run fails — never a guess.
 * @param limit - forwarded as `-n` to bound output size
 */
export function fitTable(limit = 50,): { system: LlmfitSystem; models: LlmfitFitRow[] } | null {
  const { ok, stdout, } = runLlmfit(["fit", "--json", "-n", String(limit,),],);
  if (!ok) { return null; }
  const parsed = safeJsonParse(stdout,);
  if (!parsed || !Array.isArray(parsed["models"],)) { return null; }
  return {
    system: (parsed["system"] ?? {}) as LlmfitSystem,
    models: parsed["models"] as LlmfitFitRow[],
  };
}

interface CacheFitOptions {
  context?: number;
  limit?: number;
}

/**
 * Run the fit table and persist each row as a `model_rankings` row
 * (`scope='instance'`, `basis='formula'`, `expires_at` = observed + 7 d).
 * No-op (returns 0) when llmfit is absent.
 * @param db
 * @param options - context window tag + row limit
 * @returns number of new rows written
 * @throws never — spawn/parse failures degrade to 0 with a warning
 */
export async function cacheFitVerdicts(db: Kysely<DB>, options: CacheFitOptions = {},): Promise<number> {
  const table = fitTable(options.limit ?? 50,);
  if (!table) {
    getLogger().child({ module: "llmfit-fit", },).warn("llmfit unavailable — no fit data cached",);
    return 0;
  }

  const fingerprint = hardwareFingerprint(table.system,);
  const context = options.context ?? 8192;
  const observedAt = toDate().toISOString();
  const expiresAt = toDate(Date.now() + 7 * 86_400_000,).toISOString();
  let written = 0;
  for (const model of table.models) {
    const subjectKey = `llmfit:${model.name}|ctx${context}`;
    const recorded = await recordRanking(db, {
      scope: "instance",
      scopeKey: fingerprint,
      subjectKey,
      metric: "fit_score",
      value: model.score ?? 0,
      unit: "score",
      basis: "formula",
      source: "llmfit",
      observedAt,
      expiresAt,
      meta: {
        fit_level: model.fit_level ?? null,
        best_quant: model.best_quant ?? null,
        estimated_tps: model.estimated_tps ?? null,
        estimate_basis: model.estimate_basis ?? null,
        estimate_confidence: model.estimate_confidence ?? null,
        memory_required_gb: model.memory_required_gb ?? null,
        runnable: model.runnable ?? null,
        context,
      },
    },);

    if (recorded) { written++; }
    if (model.estimated_tps != null) {
      const tpsRecorded = await recordRanking(db, {
        scope: "instance",
        scopeKey: fingerprint,
        subjectKey,
        metric: "tps",
        value: model.estimated_tps,
        unit: "tok/s",
        basis: "formula",
        source: "llmfit",
        observedAt,
        expiresAt,
        meta: { estimate_confidence: model.estimate_confidence ?? null, context, },
      },);

      if (tpsRecorded) { written++; }
    }
  }

  getLogger().child({ module: "llmfit-fit", },).info("fit verdicts cached", {
    fingerprint,
    models: table.models.length,
    written,
  },);

  return written;
}
