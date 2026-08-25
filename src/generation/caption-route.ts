// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Image caption generation route handler.
 *
 * Resolves the configured `captioning` model role (DB override → config →
 * default provider) and calls it with BYO apiKey parity, mirroring the shared
 * AUX resolution path. The explicit `captioning` role takes precedence; absent
 * an explicit captioning assignment it falls back to an explicitly configured
 * `main` model (the typical multimodal-capable choice), then the default
 * provider so captioning remains available in minimal setups.
 *
 * Ownership: only assets owned by the calling user are captioned; foreign or
 * unknown asset ids yield empty captions instead of leaking or overwriting.
 */
import { resolveModelRole, } from "../admin/model-roles";
import { getAsset, } from "../assets/service";
import { loadConfig, } from "../config/load";
import { ModelRole, } from "../db/enums-core";
import { getDatabase, } from "../db/index";
import { getLogger, } from "../logger/index";
import { getProvider, resolveProvider, } from "./providers/registry";
import type { GenerateRequest, } from "./providers/types";

const MAX_CAPTION_BATCH = 5;
const MAX_CAPTION_LENGTH = 500;

interface CaptionBody {
  chatId?: string;
  messageId?: string;
  assetIds: string[];
}

export async function handleImageCaption(body: unknown, userId?: string,): Promise<Response> {
  const log = getLogger().child({ module: "generation/caption-route", },);
  const req = body as CaptionBody;

  if (!userId) {
    return Response.json({ error: "Authentication required", status: 401, }, { status: 401, },);
  }
  if (!req.assetIds || req.assetIds.length === 0) {
    return Response.json({ error: "Missing required field: assetIds", status: 400, }, { status: 400, },);
  }

  const config = loadConfig();
  const db = getDatabase();

  // Captioning model precedence: explicit captioning role → explicit main role → default.
  // Captioning takes precedence when configured (multimodal-capable intent). When no
  // explicit captioning assignment exists, fall back to an explicitly configured main
  // model (the typical multimodal-capable choice) before the generic default provider.
  let role = await resolveModelRole(ModelRole.Captioning, config, db,);
  if (role.provider && role.model && role.source === "default") {
    const main = await resolveModelRole(ModelRole.Main, config, db,);
    if (main.provider && main.model && main.source !== "default") {
      role = main;
    }
  }
  if (!role.provider || !role.model) {
    return Response.json({ error: "No captioning model configured", status: 503, }, { status: 503, },);
  }

  // BYO apiKey parity: user key → server default.
  let apiKey: string | undefined;
  try {
    const resolved = await resolveProvider({
      provider: role.provider,
      model: role.model,
      userId,
      config,
      db,
    },);
    apiKey = resolved.resolvedApiKey;
  } catch (error) {
    log.debug("BYO key resolution failed; falling back to provider key", { error, },);
  }

  const provider = getProvider(role.provider,);
  if (!provider) {
    return Response.json({ error: "Captioning provider unavailable", status: 503, }, { status: 503, },);
  }

  const captions: { assetId: string; caption: string }[] = [];

  for (const assetId of req.assetIds.slice(0, MAX_CAPTION_BATCH,)) {
    const asset = await getAsset(db, assetId,);
    if (!asset) {
      captions.push({ assetId, caption: "", },);
      continue;
    }
    // Foreign assets are treated as not found — never read or overwrite them.
    if (asset.owner_id !== userId) {
      captions.push({ assetId, caption: "", },);
      continue;
    }

    const systemPrompt =
      "Generate a concise one-sentence description of this image. Focus on the main subject and visual elements.";
    const userPrompt =
      `Describe this image briefly for accessibility purposes. The image filename is "${asset.filename}".`;

    try {
      const genReq: GenerateRequest = {
        model: role.model,
        messages: [
          { role: "system", content: systemPrompt, },
          { role: "user", content: userPrompt, },
        ],
        params: { maxTokens: 128, temperature: 0.3, },
      };

      const result = await provider.complete({ ...genReq, apiKey, },);
      const caption = result.content.replaceAll(/^["']|["']$/g, "",).trim().replaceAll(/<[^>]*>/g, "",).slice(
        0,
        MAX_CAPTION_LENGTH,
      );

      await db.updateTable("assets",).set({ alt_text: caption, },).where("id", "=", assetId,).execute();

      captions.push({ assetId, caption, },);
    } catch (error) {
      log.warn("caption generation failed", { assetId, error, },);
      captions.push({ assetId, caption: "", },);
    }
  }

  return Response.json({ data: captions, },);
}
