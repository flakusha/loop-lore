// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Matting — job lifecycle service.
 *
 * Enqueues background-removal jobs for opaque image assets. On success the
 * matted RGBA PNG is stored as a new asset linked to the raw asset via
 * `asset_links` (`entity_type: "asset"`, label `matting-source`), and the
 * raw asset's `alpha_status` transitions to `matted`. Failures keep the raw
 * asset usable (`matting_failed`).
 */
import type { Kysely, } from "kysely";
import { canTransitionAlphaStatus, } from "../../assets/service/alpha-status";
import { createAsset, } from "../../assets/service/create";
import { getAssetFilePath, } from "../../assets/service/file-system";
import { linkAsset, } from "../../assets/service/links";
import type { AssetRecord, } from "../../assets/service/types";
import { AssetAlphaStatus, AssetLinkEntity, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { uid, } from "../../utils";
import { getJob, listJobs, storeJob, } from "./job-store";
import type {
  MattingJob,
  MattingJobId,
  MattingProvider,
  StartMattingOpts,
  StartMattingResult,
} from "./types";

/** Label used on the derivative → source asset link. */
export const MATTING_SOURCE_LABEL = "matting-source";

/** Options for constructing a MattingService. */
export interface MattingServiceOpts {
  database: Kysely<DB>;
  /** Upload directory used for storing matted derivatives. */
  uploadDir: string;
  /** Resolves the configured provider; null → matting unavailable. */
  resolveProvider: () => MattingProvider | null;
}

/**
 * Run a matting job for an asset.
 */
export class MattingService {
  readonly #database: Kysely<DB>;
  readonly #uploadDir: string;
  readonly #resolveProvider: () => MattingProvider | null;

  constructor(opts: MattingServiceOpts,) {
    this.#database = opts.database;
    this.#uploadDir = opts.uploadDir;
    this.#resolveProvider = opts.resolveProvider;
  }

  /**
   * Enqueue a background-removal job for a raw/matted/failed asset.
   * @param root0
   * @param root0.assetId
   * @param root0.ownerId
   */
  async startMatting({ assetId, ownerId, }: StartMattingOpts,): Promise<StartMattingResult> {
    const asset = await this.#loadAsset(assetId,);
    if (!asset) { return { ok: false, error: "asset_not_found", }; }
    if (asset.owner_id !== ownerId) { return { ok: false, error: "forbidden", }; }
    if (!canTransitionAlphaStatus(asset.alpha_status, AssetAlphaStatus.MattingPending,)) {
      return { ok: false, error: "not_eligible", };
    }

    const provider = this.#resolveProvider();
    if (!provider) { return { ok: false, error: "not_eligible", }; }

    const jobId = uid() as MattingJobId;
    const job: MattingJob = {
      id: jobId,
      assetId,
      ownerId,
      providerName: provider.name,
      status: "pending",
      previousStatus: asset.alpha_status,
      startedAt: new Date().toISOString(),
    };
    storeJob(job,);
    await this.#setAlphaStatus(assetId, AssetAlphaStatus.MattingPending,);

    // Fire-and-forget; `done` lets callers await terminal state. The runner
    // handles its own errors — the catch only guards the guard.
    const done = this.#run(job, provider,);
    done.catch((error: unknown,) => {
      getLogger().error({ event: "matting.job_unhandled_error", jobId, error: String(error,), },);
    },);

    return { ok: true, jobId, done, };
  }

  /**
   * Get a job by id.
   * @param jobId
   */
  getJob(jobId: MattingJobId,): MattingJob | undefined {
    return getJob(jobId,);
  }

  /** List this owner's matting jobs, newest first. */
  listJobs(ownerId: string,): MattingJob[] {
    return listJobs(ownerId,);
  }

  /**
   * Execute the job: provider call → derivative asset + link → status update.
   * @param job
   * @param provider
   */
  async #run(job: MattingJob, provider: MattingProvider,): Promise<void> {
    job.status = "running";
    try {
      const source = await this.#readSourceFile(job.assetId,);
      const matted = await provider.removeBackground(source,);
      const mattedAsset = await this.#storeDerivative(job, matted,);
      await this.#setAlphaStatus(job.assetId, AssetAlphaStatus.Matted,);
      job.status = "completed";
      job.mattedAssetId = mattedAsset.id;
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error,);
      // Raw stays usable; a previously matted asset falls back to raw.
      const fallback = job.previousStatus === AssetAlphaStatus.Matted
        ? AssetAlphaStatus.Raw
        : AssetAlphaStatus.MattingFailed;
      await this.#setAlphaStatus(job.assetId, fallback,).catch(() => undefined);
      getLogger().warn({ event: "matting.job_failed", jobId: job.id, error: job.error, },);
    } finally {
      job.completedAt = new Date().toISOString();
    }
  }

  /**
   * Load an asset row.
   * @param assetId
   */
  async #loadAsset(assetId: string,): Promise<AssetRecord | null> {
    const row = await this.#database
      .selectFrom("assets",)
      .selectAll()
      .where("id", "=", assetId,)
      .executeTakeFirst();
    return row ?? null;
  }

  /**
   * Read the raw source bytes; encrypted assets are not supported yet.
   * @param assetId
   */
  async #readSourceFile(assetId: string,): Promise<Buffer> {
    const asset = await this.#loadAsset(assetId,);
    if (!asset) { throw new Error("Source asset vanished during matting",); }
    if (asset.encryption_tier !== "public") {
      throw new Error("Matting of encrypted assets is not supported",);
    }
    const path = getAssetFilePath(this.#uploadDir, asset.storage_path,);
    return Buffer.from(await Bun.file(path,).arrayBuffer(),);
  }

  /**
   * Store the matted PNG as a new asset and link it to the raw asset.
   * @param job
   * @param matted
   */
  async #storeDerivative(job: MattingJob, matted: Buffer,): Promise<AssetRecord> {
    const source = await this.#loadAsset(job.assetId,);
    if (!source) { throw new Error("Source asset vanished during matting",); }

    const { asset, } = await createAsset({
      database: this.#database,
      uploadDir: this.#uploadDir,
      input: {
        ownerId: job.ownerId,
        filename: derivativeFilename(source.filename,),
        mimeType: "image/png",
        assetType: source.asset_type,
        sizeBytes: matted.length,
        buffer: matted,
        altText: source.alt_text ?? undefined,
      },
    },);

    await linkAsset({
      database: this.#database,
      assetId: asset.id,
      link: {
        entityType: AssetLinkEntity.Asset,
        entityId: job.assetId,
        label: MATTING_SOURCE_LABEL,
      },
    },);
    return asset;
  }

  /**
   * Transition an asset's alpha_status.
   * @param assetId
   * @param status
   */
  async #setAlphaStatus(assetId: string, status: AssetAlphaStatus,): Promise<void> {
    await this.#database
      .updateTable("assets",)
      .set({ alpha_status: status, },)
      .where("id", "=", assetId,)
      .execute();
  }
}

/**
 * Build the derivative filename: `name-matted.png`.
 * @param filename
 */
function derivativeFilename(filename: string,): string {
  const dot = filename.lastIndexOf(".",);
  const base = dot > 0 ? filename.slice(0, dot,) : filename;
  return `${base}-matted.png`;
}
