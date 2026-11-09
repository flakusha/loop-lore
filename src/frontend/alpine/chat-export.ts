// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat export helper — triggers a blob download of GET /api/v1/chats/:id/export
 * in the picked format. Global (not a chatState action) because the header
 * lives outside the chatState x-data scope — mirrors chat-side-channels.ts.
 */
import { showToast, } from "../ui";
import { chatStateData, } from "./chat-state-global";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";

type ExportFormat = "markdown" | "json" | "html" | "text";

const EXPORT_TYPES: Record<ExportFormat, string> = {
  markdown: "text/markdown",
  json: "application/json",
  html: "text/html",
  text: "text/plain",
};

/**
 * @param {ExportFormat} format - Route format value (plaintext is `text`).
 * @returns {Promise<void>}
 */
export async function exportChat(format: ExportFormat,): Promise<void> {
  const chat = chatStateData()?.currentChat as { id?: string; name?: string } | null | undefined;
  if (!chat?.id) { return; }

  try {
    // feFetch throws on any non-2xx (Response never surfaced for error
    // statuses), so there is no res.ok branch — failures land in catch.
    const res = await apiFetch(`/api/v1/chats/${chat.id}/export?format=${format}`,);

    const disposition = res.headers.get("Content-Disposition",) ?? "";
    const match = /filename="?([^";]+)"?/.exec(disposition,);
    const safeName = (chat.name ?? "chat").replaceAll(/[^a-z0-9]/gi, "_",);
    const filename = match?.[1] ?? `${safeName}.${format === "text" ? "txt" : format}`;
    const blob = new Blob([await res.blob(),], { type: EXPORT_TYPES[format], },);
    const url = URL.createObjectURL(blob,);
    const a = document.createElement("a",);
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url,);
  } catch {
    showToast("error", t("toasts.networkError",),);
  }
}

// Expose global helper for the chat-header export button. See chat-state-global.ts.
const g = globalThis as Record<string, unknown>;
g.exportChat = function(format: ExportFormat,) {
  void exportChat(format,);
};
