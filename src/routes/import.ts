/**
 * Import Route (standalone plugin)
 *
 * Handles actor import via multipart upload. Separate from characters
 * plugin to avoid Elysia body validator consuming the body for multipart
 * requests.
 */

import { Elysia } from "elysia";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { uid, safeJsonStringify, jsonParseOr } from "../utils";
import { jsonError, jsonCreated, HttpStatus } from "./http-utils";
import { load as yamlLoad } from "js-yaml";
import { parse as parseToml } from "smol-toml";
import { extractCharacterDataFromPng } from "../characters/steganography";

interface ImportActorOpts {
  data: Record<string, unknown>;
  spec?: string;
  database: Kysely<DB>;
  userId: string;
}

async function importActor(opts: ImportActorOpts): Promise<Response> {
  const { data, spec, database, userId } = opts;

  const displayName = (data.name ?? data.displayName ?? data.display_name) as string | undefined;
  if (!displayName) return jsonError({ message: "Actor name is required", status: HttpStatus.BadRequest });

  const id = uid();
  await database
    .insertInto("actors")
    .values({
      id,
      actor_type: "character",
      display_name: displayName,
      user_id: userId,
      owner_id: userId,
      agent_type: "ai",
      description: (data.description as string | undefined) ?? null,
      system_prompt: (data.system_prompt as string | undefined) ?? null,
      welcome_message: (data.first_mes as string | undefined) ?? null,
      personality: (data.personality as string | undefined) ?? null,
      scenario: (data.scenario as string | undefined) ?? null,
      mes_example: (data.mes_example as string | undefined) ?? null,
      post_history_instructions: (data.post_history_instructions as string | undefined) ?? null,
      creator_notes: (data.creator_notes as string | undefined) ?? null,
      creator: (data.creator as string | undefined) ?? null,
      character_version: (data.character_version as string | undefined) ?? null,
      import_spec: spec ?? "raw",
      alternate_greetings: data.alternate_greetings
        ? (() => {
            const r = safeJsonStringify(data.alternate_greetings);
            return r.ok ? r.value : null;
          })()
        : null,
      settings: "{}",
      data_version: 1,
    })
    .execute();

  return jsonCreated({ id });
}

export function importRoutes({ database }: { database: Kysely<DB> }): Elysia {
  return new Elysia({ name: "import" }).post(
    "/api/actors/import",
    async (ctx: any) => {
      const contentType = ctx.request.headers.get("content-type") ?? "";

      if (contentType.includes("multipart/form-data")) {
        let formData: FormData;
        try {
          formData = await ctx.request.formData();
        } catch {
          const raw = await new Response(ctx.request.body, {
            headers: { "Content-Type": contentType },
          }).arrayBuffer();
          const freshReq = new Request(ctx.request.url, {
            method: "POST",
            headers: { "Content-Type": contentType },
            body: raw,
          });
          formData = await (freshReq.formData() as Promise<FormData>);
        }
        const file = formData.get("file");
        if (!file || !(file instanceof File))
          return jsonError({ message: "file field is required", status: HttpStatus.BadRequest });

        const fileBytes = Buffer.from(await file.arrayBuffer());
        const filename = (file.name ?? "").toLowerCase();

        let data: Record<string, unknown>;
        let spec: string | undefined;

        if (filename.endsWith(".json")) {
          const parsed = jsonParseOr(await file.text(), null);
          if (!parsed || typeof parsed !== "object")
            return jsonError({ message: "Invalid JSON file", status: HttpStatus.BadRequest });
          data = parsed;
          spec = data.spec === "chara_card_v2" ? "chara_card_v2" : undefined;
        } else if (filename.endsWith(".png")) {
          const extracted = extractCharacterDataFromPng(fileBytes);
          if (!extracted)
            return jsonError({ message: "No character data found in PNG", status: HttpStatus.BadRequest });
          data = extracted.data;
          spec = extracted.spec;
        } else if (filename.endsWith(".yaml") || filename.endsWith(".yml")) {
          const parsed = yamlLoad(await file.text());
          if (!parsed || typeof parsed !== "object")
            return jsonError({ message: "Invalid YAML file", status: HttpStatus.BadRequest });
          data = parsed as Record<string, unknown>;
        } else if (filename.endsWith(".toml")) {
          const parsed = parseToml(await file.text());
          if (!parsed || typeof parsed !== "object")
            return jsonError({ message: "Invalid TOML file", status: HttpStatus.BadRequest });
          data = parsed;
        } else {
          return jsonError({
            message: "Unsupported file type. Use .json, .png, .yaml, or .toml",
            status: HttpStatus.BadRequest,
          });
        }

        return importActor({ data, spec, database, userId: ctx.userId as string });
      }

      // JSON body
      const body = ctx.body as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;
      const spec = body.spec === "chara_card_v2" ? "chara_card_v2" : undefined;
      return importActor({ data, spec, database, userId: ctx.userId as string });
    },
    { type: undefined },
  ) as unknown as Elysia;
}
