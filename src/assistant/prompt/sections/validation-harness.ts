// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Validation-harness section — surfaces the `gm_config.validation.harness`
 * seed declared by the `llm_only` / `llm_only_group` chat variants into the
 * validation subject's prompt. Both variants ship an empty harness, so the
 * section is inert until a harness is configured; every other variant stays
 * byte-identical.
 */
import { safeJsonParse, } from "../../../utils";
import type { SectionBuilder, } from "../types";
import { wrapUntrusted, } from "./system";

/**
 * Read a configured harness name from a raw `chats.gm_config` blob.
 * @param gmConfig - raw JSON column (nullable)
 * @returns trimmed harness name, or null when absent/empty/malformed
 */
export function readValidationHarness(gmConfig: string | null | undefined,): string | null {
  if (!gmConfig) { return null; }
  const parsed = safeJsonParse<{ validation?: { harness?: unknown } }>(gmConfig,);
  if (!parsed.ok || !parsed.value) { return null; }
  const harness = parsed.value.validation?.harness;
  return typeof harness === "string" && harness.trim() ? harness.trim() : null;
}

export const validationHarnessSection: SectionBuilder = {
  name: "validationHarness",
  enabled: () => true,
  build: (ctx,) => {
    const harness = readValidationHarness(ctx.chat.gm_config,);
    if (!harness) { return []; }
    return [{
      role: "system",
      content: "This chat is an automated validation run scored by the harness named below.\n" +
        wrapUntrusted("gm_config.validation.harness", harness,) +
        "\nFollow the incoming instruction exactly and reply with only the requested output.",
    },];
  },
};
