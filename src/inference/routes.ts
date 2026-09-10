// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser-side inference routes — opt-in capability advertisement.
 *
 * - `GET /api/local-inference/manifest` — static manifest of offloadable
 *   tasks and browser model catalog (public, no secrets).
 * - `GET /api/local-inference/capability` — opt-in support flag plus the
 *   eligible task list so clients can gate UI without fetching the manifest.
 *
 * Both routes are unauthenticated by design (same posture as the i18n and
 * frontend-logs surfaces): they advertise shape, never user data.
 *
 * @module inference/routes
 */

import { Elysia, } from "elysia";
import { loadConfig, } from "../config/load";
import { jsonResponse, } from "../routes/http-utils";
import { buildLocalInferenceManifest, type LocalModelDownloadPolicy, } from "./manifest";

/**
 * Resolve the instance download policy from file config.
 * @returns Policy for manifest filtering; omitted fields mean allow.
 */
export function resolveDownloadPolicy(): LocalModelDownloadPolicy {
  const localModels = loadConfig().generation.localModels;
  return {
    allowDownloads: localModels?.allowDownloads,
    models: localModels?.models,
  };
}

/**
 * Mount browser-side inference capability routes.
 * The download policy is resolved once at mount time; config edits take effect on restart.
 * @param opts - Optional policy resolver override (tests inject a static policy).
 * @param opts.resolvePolicy
 * @returns Elysia plugin serving the manifest and capability endpoints.
 */
export function localInferenceRoutes(opts?: { resolvePolicy?: () => LocalModelDownloadPolicy },): Elysia {
  const policy = (opts?.resolvePolicy ?? resolveDownloadPolicy)();
  const app = new Elysia({ name: "local-inference", },);

  app.get("/api/local-inference/manifest", () => {
    return jsonResponse(buildLocalInferenceManifest(policy,),);
  }, {
    detail: {
      summary: "Browser inference manifest",
      description:
        "Lists auxiliary tasks eligible for opt-in browser-side inference and the browser model catalog. Public; no secrets.",
      tags: ["Inference",],
    },
  },);

  app.get("/api/local-inference/capability", () => {
    const manifest = buildLocalInferenceManifest(policy,);
    return jsonResponse({
      optInSupported: true,
      defaultOptIn: false,
      downloadsAllowed: policy?.allowDownloads ?? true,
      eligibleTasks: manifest.eligibleTasks,
      localOnlyLevels: manifest.localOnlyLevels,
    },);
  }, {
    detail: {
      summary: "Browser inference capability",
      description: "Opt-in support flag for browser-side inference (BYOK local-models slice). Public; no secrets.",
      tags: ["Inference",],
    },
  },);

  return app;
}
