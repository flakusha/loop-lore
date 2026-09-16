// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat export — multi-format serialization.
 *
 * Vertical slice for `TASK-chat-feature-share-links-export-formats`.
 *
 * Exports a chat transcript (chat metadata + ordered messages) as one
 * of four formats: `json`, `yaml`, `toml`, `md`. JSON uses
 * `safeJsonStringify` so a payload that contains a BigInt or circular
 * reference falls back to `{}` instead of throwing. YAML delegates to
 * `js-yaml` (already a dependency). TOML/Markdown are hand-rolled —
 * the payload is small and stable, and pulling in another dependency
 * for two short serializers isn't worth it.
 *
 * Reuses `MessageData` from `routes/chat-export/types.ts` so a route
 * caller can fetch + format in two steps without re-defining the row
 * shape.
 */

import { dump as yamlDump, } from "js-yaml";
import { MessageRole, } from "../../db/enums";
import type { MessageData, } from "../../routes/chat-export/types";
import { safeJsonStringify, } from "../../utils";

/** Supported export formats. */
export type ExportFormat = "json" | "yaml" | "toml" | "md";

const VALID_FORMATS: readonly ExportFormat[] = ["json", "yaml", "toml", "md",];

/** Minimal chat shape needed by every formatter. */
export interface ExportChatSummary {
  id: string;
  name: string;
  type: string;
  mode: string;
  createdAt: string;
}

export interface ExportPayload {
  chat: ExportChatSummary;
  messages: MessageData[];
}

const DEFAULT_AUTHOR_BY_ROLE: Record<string, string> = {
  [MessageRole.User]: "You",
};

/**
 * Author label for a message — display_name when present, otherwise
 * the role, with a User → "You" override (mirrors the markdown UX).
 */
function authorLabel(msg: MessageData,): string {
  if (msg.display_name) { return msg.display_name; }
  return DEFAULT_AUTHOR_BY_ROLE[msg.role] ?? msg.role;
}

/**
 * Serialize the chat as Markdown. Consecutive same-author messages
 * collapse under a single heading (matches the existing markdown
 * exporter in `routes/chat-export/format.ts`).
 */
function renderMarkdown(payload: ExportPayload,): string {
  const { chat, messages, } = payload;
  const lines: string[] = [
    `# ${chat.name}`,
    "",
    `> Exported from loop-lore on ${new Date().toISOString()}`,
    `> Chat type: ${chat.type} | Mode: ${chat.mode}`,
    "",
    "---",
    "",
  ];
  let lastAuthor = "";
  for (const msg of messages) {
    const author = authorLabel(msg,);
    if (author !== lastAuthor) {
      lines.push(`### ${author}`, "",);
    }
    lines.push(msg.content, "",);
    lastAuthor = author;
  }
  return lines.join("\n",);
}

/**
 * Quote-escape a TOML basic string. Newlines, tabs, backslashes, and
 * double quotes need escapes; everything else is literal.
 */
function tomlEscape(value: string,): string {
  return value
    .replaceAll("\\", "\\\\",)
    .replaceAll('"', '\\"',)
    .replaceAll("\n", "\\n",)
    .replaceAll("\r", "\\r",)
    .replaceAll("\t", "\\t",);
}

/**
 * Render the export as TOML. Flattened shape: `[[message]]` array of
 * inline tables. The chat header lives in a `[chat]` table. Comments
 * keep the file human-readable.
 */
function renderToml(payload: ExportPayload,): string {
  const { chat, messages, } = payload;
  const lines: string[] = [
    "# loop-lore chat export",
    "",
    "[chat]",
    `id = "${tomlEscape(chat.id,)}"`,
    `name = "${tomlEscape(chat.name,)}"`,
    `type = "${tomlEscape(chat.type,)}"`,
    `mode = "${tomlEscape(chat.mode,)}"`,
    `createdAt = "${tomlEscape(chat.createdAt,)}"`,
    "",
  ];
  for (const [i, msg,] of messages.entries()) {
    lines.push(`[[message]]`,);
    lines.push(`index = ${i}`,);
    lines.push(`id = "${tomlEscape(msg.id,)}"`,);
    lines.push(`role = "${tomlEscape(msg.role,)}"`,);
    lines.push(`author = "${tomlEscape(msg.display_name ?? "",)}"`,);
    lines.push(`content = """${msg.content}"""`,);
    lines.push(`createdAt = "${tomlEscape(msg.created_at,)}"`,);
    if (msg.model_id !== null) { lines.push(`model = "${tomlEscape(msg.model_id,)}"`,); }
    lines.push("",);
  }
  return lines.join("\n",);
}

/**
 * Render the export as YAML. `js-yaml`'s `dump` handles strings and
 * nested objects cleanly; we pre-shape the payload so the layout
 * matches the JSON exporter.
 */
function renderYaml(payload: ExportPayload,): string {
  const shaped = {
    chat: {
      id: payload.chat.id,
      name: payload.chat.name,
      type: payload.chat.type,
      mode: payload.chat.mode,
      createdAt: payload.chat.createdAt,
    },
    messages: Array.from(payload.messages, (m,) => ({
      id: m.id,
      role: m.role,
      author: m.display_name,
      content: m.content,
      createdAt: m.created_at,
      model: m.model_id,
      tokenCount: m.token_count_total,
    }),),
    exportedAt: new Date().toISOString(),
  };
  return yamlDump(shaped, { lineWidth: 120, noRefs: true, },);
}

/**
 * Render the export as pretty-printed JSON.
 */
function renderJson(payload: ExportPayload,): string {
  const sr = safeJsonStringify(
    {
      chat: payload.chat,
      messages: Array.from(payload.messages, (m,) => ({
        id: m.id,
        role: m.role,
        display_name: m.display_name,
        content: m.content,
        created_at: m.created_at,
        model_id: m.model_id,
        token_count_total: m.token_count_total,
      }),),
      exported_at: new Date().toISOString(),
    },
    2,
  );
  return sr.ok ? sr.value : "{}";
}

const FORMATTERS: Record<ExportFormat, (payload: ExportPayload,) => string> = {
  json: renderJson,
  yaml: renderYaml,
  toml: renderToml,
  md: renderMarkdown,
};

/**
 * Serialize a chat + messages payload in the requested format.
 * @param payload
 * @param format
 * @returns A serialized string (empty for an empty message list).
 */
export function exportChat(
  payload: ExportPayload,
  format: ExportFormat,
): string {
  if (!VALID_FORMATS.includes(format,)) {
    throw new Error(`Unsupported export format: ${format}`,);
  }
  return FORMATTERS[format](payload,);
}
