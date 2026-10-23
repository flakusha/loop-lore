// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Classifier tag vocabulary card (admin panel, System tab).
 *
 * Admin-curated tag vocabulary stored in system_config under
 * `classifier_tag_vocabulary` (JSON string[]). Persists through the generic
 * `PATCH /api/v1/admin/system-config`; server-side validation rejects
 * non-empty/uniqueness/length violations, mirrored client-side here.
 */
import {
  MAX_TAG_LENGTH,
  MAX_VOCABULARY_TAGS,
} from "../../aux-pipeline/class-tag-vocab";
import { CLASSIFIER_TAG_VOCABULARY_KEY, } from "../../aux-pipeline/class-template-resolver";
import { jsonStringifyOr, } from "../../utils";
import { showToast, } from "../ui";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, jsonParseOr, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "admin-classifier-vocab", },);

/** Host state the vocabulary card reads — subset of the merged admin page scope. */
interface ClassifierVocabHost {
  systemConfig: { key: string; value: string }[];
  loadSystemConfig(): Promise<void>;
}

/**
 * Parse the current vocabulary out of the loaded system-config entries.
 * @param entries - loaded system-config rows
 * @returns the tag list; empty when unset or malformed
 */
export function classifierVocabFromConfig(entries: { key: string; value: string }[],): string[] {
  const row = entries.find((c,) => c.key === CLASSIFIER_TAG_VOCABULARY_KEY);
  if (!row) { return []; }
  const parsed = jsonParseOr<unknown>(row.value, null,);
  if (
    Array.isArray(parsed,) && parsed.every((tg,) => typeof tg === "string") &&
    parsed.length <= MAX_VOCABULARY_TAGS
  ) {
    return parsed as string[];
  }

  log.warn("malformed classifier_tag_vocabulary config value",);
  return [];
}

/**
 * Client-side mirror of the server vocabulary validation: trims, requires
 * non-empty/unique entries within the shared caps.
 * @param tags - candidate tags
 * @returns an error message, or empty string when valid
 */
export function classifierVocabValidationError(tags: string[],): string {
  if (tags.length > MAX_VOCABULARY_TAGS) {
    return t("admin.classifierVocab.errorTooMany",).replace("{max}", String(MAX_VOCABULARY_TAGS,),);
  }

  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag) { return t("admin.classifierVocab.errorEmpty",); }
    if (tag.length > MAX_TAG_LENGTH) {
      return t("admin.classifierVocab.errorTooLong",).replace("{max}", String(MAX_TAG_LENGTH,),);
    }

    if (seen.has(tag,)) {
      return t("admin.classifierVocab.errorDuplicate",).replace("{tag}", tag,);
    }

    seen.add(tag,);
  }

  return "";
}

/**
 * Vocabulary card slice — spread into the admin page Alpine scope.
 * @returns state + add/remove/rename/persist methods for the card
 */
export const adminClassifierVocab = {
  classifierVocab: [] as string[],
  classifierVocabInput: "",
  classifierVocabBusy: false,
  classifierVocabError: "",
  classifierVocabEditIdx: -1,
  classifierVocabEditValue: "",

  /** Load the system config rows, then parse the vocabulary out of them. */
  async loadClassifierVocab(): Promise<void> {
    // Cross-slice host members, following the admin-system cast pattern.
    const host = this as unknown as ClassifierVocabHost;
    await host.loadSystemConfig();
    this.classifierVocab = classifierVocabFromConfig(host.systemConfig,);
  },

  /**
   * Persist the current tag list via the generic system-config PATCH.
   * @param tags - validated tag list to store
   */
  async saveClassifierVocab(tags: string[],): Promise<void> {
    this.classifierVocabBusy = true;
    try {
      // apiFetch/feFetch throws on non-2xx; the 400 validation error arrives
      // as an Error with a `status` property attached.
      await apiFetch("/api/v1/admin/system-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ key: CLASSIFIER_TAG_VOCABULARY_KEY, value: jsonStringifyOr(tags,), },),
      },);

      this.classifierVocab = tags;
      this.classifierVocabError = "";
      showToast("success", t("toasts.classifierVocabSaved",),);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 400) {
        this.classifierVocabError = (err as Error).message || t("toasts.failed",);
      } else {
        this.classifierVocabError = "";
        showToast("error", t("toasts.networkError",),);
      }
    } finally {
      this.classifierVocabBusy = false;
    }
  },

  /** Add the tag typed into the input, then persist. */
  async addClassifierTag(): Promise<void> {
    const tag = this.classifierVocabInput.trim();
    if (!tag) {
      this.classifierVocabError = t("admin.classifierVocab.errorEmpty",);
      return;
    }

    const candidate = [...this.classifierVocab, tag,];
    const error = classifierVocabValidationError(candidate,);
    if (error) {
      this.classifierVocabError = error;
      return;
    }

    this.classifierVocabInput = "";
    await this.saveClassifierVocab(candidate,);
  },

  /**
   * Remove a tag by index, then persist.
   * @param idx - index into the current vocabulary list
   */
  async removeClassifierTag(idx: number,): Promise<void> {
    const candidate = this.classifierVocab.filter((_, i,) => i !== idx);
    await this.saveClassifierVocab(candidate,);
  },

  /**
   * Begin an inline rename of a tag.
   * @param idx - index into the current vocabulary list
   */
  startRenameClassifierTag(idx: number,): void {
    this.classifierVocabEditIdx = idx;
    this.classifierVocabEditValue = this.classifierVocab[idx] ?? "";
    this.classifierVocabError = "";
  },

  /** Commit the inline rename (validates, then persists). */
  async commitRenameClassifierTag(): Promise<void> {
    const idx = this.classifierVocabEditIdx;
    if (idx < 0) { return; }
    const tag = this.classifierVocabEditValue.trim();
    const candidate = this.classifierVocab.map((existing, i,) => (i === idx ? tag : existing));
    const error = classifierVocabValidationError(candidate,);
    if (error) {
      this.classifierVocabError = error;
      return;
    }

    this.classifierVocabEditIdx = -1;
    await this.saveClassifierVocab(candidate,);
  },

  /** Cancel the inline rename. */
  cancelRenameClassifierTag(): void {
    this.classifierVocabEditIdx = -1;
    this.classifierVocabEditValue = "";
  },
};
