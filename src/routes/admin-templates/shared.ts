import type { Kysely, } from "kysely";
import { getConfig, setConfig, } from "../../admin/config";
import type { DB, } from "../../db/schema";
import type { ImageModelProfile, } from "../../generation/prompt-templates";
import { getLogger, type Logger, } from "../../logger";
import { jsonStringifyOr, safeJsonParse, } from "../../utils";

export function log(): Logger {
  return getLogger().child({ module: "admin-templates", },);
}

/** JSON key for storing custom templates in system_config */
export const TEMPLATES_KEY = "prompt_templates";

/** Stored custom profiles (JSON in system_config) */
export interface StoredTemplates {
  profiles: Record<string, ImageModelProfile>;
  defaultProfileId: string;
}

export async function loadStoredTemplates(db: Kysely<DB>,): Promise<StoredTemplates> {
  const raw = await getConfig(db, TEMPLATES_KEY,);
  if (!raw) {
    return { profiles: {}, defaultProfileId: "sdxl", };
  }
  const result = safeJsonParse<StoredTemplates>(raw.value,);
  if (!result.ok) {
    log().warn("Failed to parse stored templates, resetting",);
    return { profiles: {}, defaultProfileId: "sdxl", };
  }
  return result.value;
}

export async function saveStoredTemplates(db: Kysely<DB>, data: StoredTemplates,): Promise<void> {
  await setConfig(db, TEMPLATES_KEY, jsonStringifyOr(data,), "Custom prompt template profiles",);
}

export function mergeProfiles(
  builtin: Record<string, ImageModelProfile>,
  custom: Record<string, ImageModelProfile>,
): Record<string, ImageModelProfile> {
  return { ...builtin, ...custom, };
}

/** Count total templates across all detail levels and modes */
export function countTemplates(templates: ImageModelProfile["templates"],): number {
  let count = 0;
  const templateValues = Object.values(templates ?? {},);
  for (const detail of templateValues) {
    for (const t of Object.values(detail,)) {
      if (t.length > 0) { count += 1; }
    }
  }
  return count;
}
