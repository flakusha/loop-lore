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
import { jsonResponse, } from "../routes/http-utils";
import { buildLocalInferenceManifest, } from "./manifest";

/**
 * Mount browser-side inference capability routes.
 * @returns Elysia plugin serving the manifest and capability endpoints.
 */
export function localInferenceRoutes(): Elysia {
  const app = new Elysia({ name: "local-inference", },);

  app.get("/api/local-inference/manifest", () => {
    return jsonResponse(buildLocalInferenceManifest(),);
  }, {
    detail: {
      summary: "Browser inference manifest",
      description:
        "Lists auxiliary tasks eligible for opt-in browser-side inference and the browser model catalog. Public; no secrets.",
      tags: ["Inference",],
    },
  },);

  app.get("/api/local-inference/capability", () => {
    const manifest = buildLocalInferenceManifest();
    return jsonResponse({
      optInSupported: true,
      defaultOptIn: false,
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
