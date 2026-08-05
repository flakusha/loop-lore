/**
 * Image caption generation route handler.
 *
 * Resolves the configured `captioning` model role (DB override → config →
 * default provider) and calls it with BYO apiKey parity, mirroring the shared
 * AUX resolution path. Absent a captioning role, falls back to the default
 * provider so captioning remains available in minimal setups.
 */
import { resolveModelRole, } from "../admin/model-roles";
import { getAsset, } from "../assets/service";
import { loadConfig, } from "../config/load";
import { ModelRole, } from "../db/enums-core";
import { getDatabase, } from "../db/index";
import { getProvider, resolveProvider, } from "./providers/registry";
import type { GenerateRequest, } from "./providers/types";

interface CaptionBody {
  chatId?: string;
  messageId?: string;
  assetIds: string[];
}

export async function handleImageCaption(body: unknown, userId?: string,): Promise<Response> {
  const req = body as CaptionBody;

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
  } catch {
    // Non-fatal — fall back to the provider instance's configured key.
  }

  const provider = getProvider(role.provider,);
  if (!provider) {
    return Response.json({ error: "Captioning provider unavailable", status: 503, }, { status: 503, },);
  }

  const captions: { assetId: string; caption: string }[] = [];

  for (const assetId of req.assetIds.slice(0, 5,)) {
    const asset = await getAsset(db, assetId,);
    if (!asset) {
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
      const caption = result.content.replaceAll(/^["']|["']$/g, "",).trim().replaceAll(/<[^>]*>/g, "",).slice(0, 500,);

      await db.updateTable("assets",).set({ alt_text: caption, },).where("id", "=", assetId,).execute();

      captions.push({ assetId, caption, },);
    } catch {
      captions.push({ assetId, caption: "", },);
    }
  }

  return Response.json({ data: captions, },);
}
