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

/** Rows per request — matches the list endpoint's default page size. */
const MEMORY_PAGE_SIZE = 50;

/** Raw memory row as returned by the memories CRUD API. */
interface JournalMemoryRow {
  id: string;
  content: string;
  keywords?: unknown;
}

/** `jsonPaginated` envelope: `{ data, pagination: { total, page, totalPages } }`. */
interface JournalMemoryPage {
  data?: JournalMemoryRow[];
  pagination?: { total?: number; page?: number; pageSize?: number; totalPages?: number };
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

/**
 * Fetch one page of actor memories.
 * @param characterId - actor id
 * @param page - 1-based page number
 * @returns the jsonPaginated envelope
 */
async function fetchMemoryPage(characterId: string, page: number,): Promise<JournalMemoryPage> {
  const res = await feFetch(
    `/api/v1/actors/${characterId}/memories?page=${page}&pageSize=${MEMORY_PAGE_SIZE}`,
  );

  if (!res.ok) { throw new Error(`status ${res.status}`,); }
  return await res.json() as JournalMemoryPage;
}

/**
 * Render one editable row per memory. Split out so load-more appends the same
 * markup the first page produced.
 * @param items - page rows
 * @returns row HTML
 */
function renderRows(items: JournalMemoryRow[],): string {
  return items.map((memory,) => {
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
}

/**
 * Journal keyphrases UI — character edit form (TASK-KEYPHRASE-RECALL).
 *
 * Renders page 1 and exposes the remainder: the count line reports
 * `shown of total` and a load-more button appends the next page. Pages are
 * never auto-chained — `saveJournalKeyphrases` PUTs every on-screen row, so
 * what is on screen is exactly what a save touches.
 * @param characterId - actor id
 */
globalThis.initJournalKeyphrases = async function(characterId: string,) {
  const el = document.querySelector<HTMLElement>("#journal-keyphrase-list",);
  if (!el) { return; }
  try {
    const body = await fetchMemoryPage(characterId, 1,);
    const items = body.data ?? [];
    if (items.length === 0) {
      el.innerHTML = `<p style="color:var(--text-secondary)">${escapeHtml(t("journalKeyphrases.empty",),)}</p>`;
      return;
    }

    let page = body.pagination?.page ?? 1;
    const totalPages = body.pagination?.totalPages ?? 1;
    const total = body.pagination?.total ?? items.length;
    let loaded = items.length;

    // Rows live in their own container so load-more can append without
    // re-rendering (and wiping) keyphrase inputs the user has already typed.
    // Shell is static markup; the rows go in as one whole-value assignment
    // because `renderRows` already escapes every value it interpolates —
    // re-escaping here would double-encode the keyphrase text.
    el.innerHTML = `<div data-testid="journal-keyphrase-rows"></div>` +
      `<div data-testid="journal-keyphrase-controls"></div>`;

    const rowsEl = el.querySelector<HTMLElement>("[data-testid='journal-keyphrase-rows']",);
    const controlsEl = el.querySelector<HTMLElement>("[data-testid='journal-keyphrase-controls']",);
    if (!rowsEl || !controlsEl) { return; }

    rowsEl.innerHTML = renderRows(items,);

    const renderControls = (hasMore: boolean,) => {
      controlsEl.innerHTML =
        `<p data-testid="journal-keyphrase-count" style="color:var(--text-secondary);font-size:var(--text-sm)">${
          escapeHtml(t("journalKeyphrases.showing", {
            shown: String(loaded,),
            total: String(total,),
          },),)
        }</p>` +
        (hasMore
          ? `<button type="button" class="btn btn-sm" data-testid="load-more-keyphrases">${
            escapeHtml(t("journalKeyphrases.loadMore",),)
          }</button>`
          : "") +
        `<button type="button" class="btn btn-primary btn-sm" data-testid="save-keyphrases">${
          escapeHtml(t("journalKeyphrases.save",),)
        }</button>`;

      controlsEl.querySelector<HTMLButtonElement>("[data-testid='save-keyphrases']",)?.addEventListener(
        "click",
        () => {
          void globalThis.saveJournalKeyphrases(characterId,);
        },
      );

      // Async listener (not `void loadMore()`): `loadMore` never rejects, and
      // returning the promise lets a caller await the append.
      controlsEl.querySelector<HTMLButtonElement>("[data-testid='load-more-keyphrases']",)?.addEventListener(
        "click",
        async () => {
          await loadMore();
        },
      );
    };

    const loadMore = async () => {
      try {
        const next = await fetchMemoryPage(characterId, page + 1,);
        const nextItems = next.data ?? [];
        if (nextItems.length > 0) {
          rowsEl.insertAdjacentHTML("beforeend", renderRows(nextItems,),);
          loaded += nextItems.length;
        }

        page = next.pagination?.page ?? page + 1;
        const nextTotalPages = next.pagination?.totalPages ?? page;
        renderControls(page < nextTotalPages,);
      } catch {
        showToast("error", t("journalKeyphrases.loadMoreFailed",),);
      }
    };

    renderControls(page < totalPages,);
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
