// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Open-document store: `textDocument/didOpen` replaces the whole tracked
 * text, `textDocument/didChange` applies full-sync updates (the last text
 * wins). Plain functions over a caller-owned map, so the handler keeps the
 * connection state and this module owns only the sync shapes.
 */

/** One tracked open document. */
export interface OpenDoc {
  languageId: string;
  version: number;
  text: string;
}

/**
 * Track `textDocument/didOpen`: the client's whole text becomes the doc.
 * @param docs - connection-owned open-document map
 * @param params - the notification's `params` object
 */
export function trackDidOpen(docs: Map<string, OpenDoc>, params: Record<string, unknown>,): void {
  const docRecord = params["textDocument"];
  if (typeof docRecord === "object" && docRecord !== null) {
    const record = docRecord as Record<string, unknown>;
    if (typeof record["uri"] === "string" && typeof record["text"] === "string") {
      docs.set(record["uri"], {
        languageId: typeof record["languageId"] === "string" ? record["languageId"] : "plaintext",
        version: typeof record["version"] === "number" ? record["version"] : 0,
        text: record["text"],
      },);
    }
  }
}

/**
 * Track `textDocument/didChange`: full sync, so the last text wins.
 * @param docs - connection-owned open-document map
 * @param params - the notification's `params` object
 */
export function trackDidChange(docs: Map<string, OpenDoc>, params: Record<string, unknown>,): void {
  const docRecord = params["textDocument"];
  const changes = params["contentChanges"];
  const uri = typeof docRecord === "object" && docRecord !== null
    ? (docRecord as Record<string, unknown>)["uri"]
    : undefined;

  if (typeof uri === "string" && Array.isArray(changes,)) {
    // Full sync: clients send the whole document; the last text wins.
    for (const change of changes) {
      if (typeof change !== "object" || change === null) { continue; }
      const changeText = (change as Record<string, unknown>)["text"];
      if (typeof changeText !== "string") { continue; }
      const current = docs.get(uri,) ?? { languageId: "plaintext", version: 0, text: "", };
      const versionRaw = (docRecord as Record<string, unknown>)["version"];
      docs.set(uri, {
        ...current,
        version: typeof versionRaw === "number" ? versionRaw : current.version,
        text: changeText,
      },);
    }
  }
}
