import { Elysia, t, } from "elysia";
import { extractAuth, jsonResponse, } from "../../../routes/http-utils";
import { ErrorResponse, SuccessResponse, } from "../../../validation/schemas";
import { validateLoRAConfig, } from "../validation";

// ── Validation Schema ─────────────────────────────────

const ValidateBody = t.Object({
  name: t.String({ minLength: 1, },),
  strength: t.Number({ minimum: 0.1, maximum: 1, },),
  backend: t.UnionEnum(["comfyui", "sd-server",],),
},);

/** POST /api/lora/validate — Validate a LoRA configuration. */
export function loraValidateRoutes() {
  return new Elysia({ name: "lora-validate", },)
    .post("/api/lora/validate", (ctx,) => {
      const { userId, } = extractAuth(ctx,);
      if (!userId) {
        return jsonResponse({ error: "Unauthorized", code: "UNAUTHORIZED", }, 401,);
      }

      const error = validateLoRAConfig(ctx.body,);

      if (error) {
        return jsonResponse({
          ok: false,
          error,
        },);
      }

      return jsonResponse({
        ok: true,
        config: ctx.body,
      },);
    }, {
      body: ValidateBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Validate LoRA configuration",
        description: "Validates a LoRA configuration object and returns any validation errors.",
        tags: ["LoRA",],
      },
    },);
}
