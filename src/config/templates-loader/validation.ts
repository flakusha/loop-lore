import { jsonStringifyOr, } from "../../utils";
import type { ChatFormatTemplate, MergeStrategy, } from "../sections/templates";

// ── Validation ────────────────────────────────────────────────

const LEGAL_MERGE_STRATEGIES: readonly MergeStrategy[] = [
  "replace",
  "extend",
  "override",
];

/**
 * Runtime-validate a raw template config (from YAML/TOML) before merging,
 * so malformed files fail fast with an actionable error instead of silently
 * casting into a half-shaped config. Currently scoped to the `llm` domain.
 *
 * @param raw - Parsed top-level object from the template file
 * @returns The llm sub-object, or null when the file is a different domain
 * @throws When the file declares `merge` legally but `systemPrompts` /
 *   `chatFormats` shapes are malformed
 */
export function validateLlmConfig(
  raw: Record<string, unknown>,
): Record<string, unknown> | null {
  const llm = raw;
  if (!("systemPrompts" in llm) && !("chatFormats" in llm) && !("merge" in llm)) {
    return null;
  }

  if (
    llm.merge !== undefined && (
      typeof llm.merge !== "string" ||
      !LEGAL_MERGE_STRATEGIES.includes(llm.merge as MergeStrategy,)
    )
  ) {
    throw new Error(
      `merge must be one of ${LEGAL_MERGE_STRATEGIES.join("|",)}, got ${jsonStringifyOr(llm.merge, "undefined",)}`,
    );
  }

  if (llm.systemPrompts !== undefined) {
    if (typeof llm.systemPrompts !== "object" || llm.systemPrompts === null) {
      throw new Error("systemPrompts must be an object mapping purpose -> string",);
    }
    for (
      const [purpose, value,] of Object.entries(
        llm.systemPrompts as Record<string, unknown>,
      )
    ) {
      if (typeof value !== "string") {
        throw new TypeError(
          `systemPrompts.${purpose} must be a string, got ${typeof value}`,
        );
      }
    }
  }

  if (llm.chatFormats !== undefined) {
    if (typeof llm.chatFormats !== "object" || llm.chatFormats === null) {
      throw new Error("chatFormats must be an object mapping name -> {system,user,assistant}",);
    }
    for (
      const [name, value,] of Object.entries(
        llm.chatFormats as Record<string, unknown>,
      )
    ) {
      if (typeof value !== "object" || value === null) {
        throw new Error(`chatFormats.${name} must be an object`,);
      }
      const fmt = value as Partial<ChatFormatTemplate>;
      for (const role of ["system", "user", "assistant",] as const) {
        if (typeof fmt[role] !== "string") {
          throw new TypeError(`chatFormats.${name}.${role} must be a string`,);
        }
      }
    }
  }

  return llm;
}
