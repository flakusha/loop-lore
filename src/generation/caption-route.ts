import { getAsset } from "../assets/service";
import { loadConfig } from "../config/load";
import { getDatabase } from "../db/index";
import { resolveProvider } from "./providers/registry";
import type { GenerateRequest } from "./providers/types";

interface CaptionBody {
  chatId?: string;
  messageId?: string;
  assetIds: string[];
}

export async function handleImageCaption(body: unknown): Promise<Response> {
  const req = body as CaptionBody;

  if (!req.assetIds || req.assetIds.length === 0) {
    return Response.json({ error: "Missing required field: assetIds", status: 400 }, { status: 400 });
  }

  const config = loadConfig();
  const db = getDatabase();

  const captions: { assetId: string; caption: string }[] = [];

  for (const assetId of req.assetIds.slice(0, 5)) {
    const asset = await getAsset(db, assetId);
    if (!asset) {
      captions.push({ assetId, caption: "" });
      continue;
    }

    const systemPrompt =
      "Generate a concise one-sentence description of this image. Focus on the main subject and visual elements.";
    const userPrompt = `Describe this image briefly for accessibility purposes. The image filename is "${asset.filename}".`;

    try {
      const resolved = await resolveProvider({ config });

      const genReq: GenerateRequest = {
        model: resolved.resolvedModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        params: { maxTokens: 128, temperature: 0.3 },
      };

      const result = await resolved.provider.complete(genReq);
      const caption = result.content.replaceAll(/^["']|["']$/g, "").trim();

      await db.updateTable("assets").set({ alt_text: caption }).where("id", "=", assetId).execute();

      captions.push({ assetId, caption });
    } catch {
      captions.push({ assetId, caption: "" });
    }
  }

  return Response.json({ data: captions });
}
