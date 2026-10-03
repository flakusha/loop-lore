// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Journal keyphrases UI — character edit form (TASK-KEYPHRASE-RECALL).
 *
 * Hydrates `#journal-keyphrase-list` with the character's journal entries
 * (actor memories) and saves edited keyphrase lists back via
 * `PUT /api/v1/actors/:actorId/memories/:memoryId` (keywords JSON column —
 * no dedicated keyphrase table exists or is needed).
 */
import { safeJsonParse, } from "../../utils";
import { jsonBody, } from "../alpine/json";
import { feFetch, } from "../fe-fetch";
import { showToast, t, } from "../ui";
import { escapeHtml, } from "./shared";

/** Ticket hard cap: up to 8 keyphrases per journal entry. */
const MAX_KEYPHRASES = 8;

/** Raw memory row as returned by the memories CRUD API. */
interface JournalMemoryRow {
  id: string;
  content: string;
  keywords?: unknown;
}

/**
 * Normalize the `keywords` column — stored as a JSON string, but some
 * responses deliver a parsed array.
 * @param raw
 * @returns keyphrase list
 */
function parseKeywords(raw: unknown,): string[] {
  if (Array.isArray(raw,)) {
    return raw.filter((entry,) => typeof entry === "string") as string[];
  }
  if (typeof raw === "string" && raw !== "") {
    const parsed = safeJsonParse<unknown>(raw,);
    if (parsed.ok) {
      if (Array.isArray(parsed.value,)) {
        return parsed.value.filter((entry,) => typeof entry === "string") as string[];
      }
      return [];
    }
    return [raw,];
  }
  return [];
}

/**
 * Split a comma-separated input into a keyphrase list (trimmed, non-empty,
 * capped at {@link MAX_KEYPHRASES}).
 * @param value - raw input value
 * @returns trimmed, non-empty keyphrase list
 */
function splitKeyphrases(value: string,): string[] {
  return value
    .split(",",)
    .map((phrase,) => phrase.trim())
    .filter((phrase,) => phrase !== "")
    .slice(0, MAX_KEYPHRASES,);
}

globalThis.initJournalKeyphrases = async function(characterId: string,) {
  const el = document.querySelector<HTMLElement>("#journal-keyphrase-list",);
  if (!el) { return; }
  try {
    const res = await feFetch(`/api/v1/actors/${characterId}/memories`,);
    if (!res.ok) { throw new Error(`status ${res.status}`,); }
    const data = await res.json() as { items?: JournalMemoryRow[] };
    const items = data.items ?? [];
    if (items.length === 0) {
      el.innerHTML = `<p style="color:var(--text-secondary)">${escapeHtml(t("journalKeyphrases.empty",),)}</p>`;
      return;
    }
    const rows = items.map((memory,) => {
      const phrases = parseKeywords(memory.keywords,).join(", ",);
      return `<div class="journal-keyphrase-row" data-memory-id="${
        escapeHtml(memory.id,)
      }" style="display:flex;gap:var(--space-2);align-items:center;margin-bottom:var(--space-2)">
        <span title="${
        escapeHtml(memory.content,)
      }" style="flex:0 0 40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--text-sm)">${
        escapeHtml(memory.content.slice(0, 60,),)
      }</span>
        <input type="text" class="form-input" data-testid="keyphrase-input" value="${
        escapeHtml(phrases,)
      }" placeholder="${escapeHtml(t("journalKeyphrases.placeholder",),)}" />
      </div>`;
    },).join("",);
    el.innerHTML = `${rows}<button type="button" class="btn btn-primary btn-sm" data-testid="save-keyphrases">${
      escapeHtml(t("journalKeyphrases.save",),)
    }</button>`;
    el.querySelector<HTMLButtonElement>("[data-testid='save-keyphrases']",)?.addEventListener(
      "click",
      () => {
        void globalThis.saveJournalKeyphrases(characterId,);
      },
    );
  } catch {
    el.innerHTML = `<p style="color:var(--accent-red)">${escapeHtml(t("journalKeyphrases.loadFailed",),)}</p>`;
  }
};

globalThis.saveJournalKeyphrases = async function(characterId: string,) {
  const rows = document.querySelectorAll<HTMLElement>(
    "#journal-keyphrase-list .journal-keyphrase-row",
  );
  let saved = 0;
  let failed = 0;
  for (const row of rows) {
    const memoryId = row.dataset.memoryId;
    const input = row.querySelector<HTMLInputElement>("input",);
    if (!memoryId || !input) { continue; }
    try {
      const res = await feFetch(`/api/v1/actors/${characterId}/memories/${memoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ keywords: splitKeyphrases(input.value,), },),
      },);
      if (res.ok) { saved++; }
      else { failed++; }
    } catch {
      failed++;
    }
  }
  if (failed === 0) {
    showToast("success", t("toasts.keyphrasesSaved", { count: String(saved,), },),);
  } else {
    showToast("error", t("toasts.keyphrasesSaveFailed", { failed: String(failed,), saved: String(saved,), },),);
  }
};
