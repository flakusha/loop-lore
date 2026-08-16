// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { MessageRole, } from "../../db/enums";
import { safeJsonStringify, } from "../../utils";
import type { MessageData, } from "./types";

function escapeHtml(text: string,): string {
  return text
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",)
    .replaceAll("'", "&#039;",);
}

export function formatMarkdown(chat: { name: string; type: string; mode: string }, messages: MessageData[],): string {
  const lines: string[] = [
    `# ${chat.name}`,
    "",
    `> Exported from loop-lore on ${new Date().toLocaleDateString()}`,
    `> Chat type: ${chat.type} | Mode: ${chat.mode}`,
    "",
    "---",
    "",
  ];

  let lastAuthor = "";
  for (const msg of messages) {
    const author = msg.display_name || msg.role;
    const roleLabel = msg.role === MessageRole.User ? "You" : author;

    if (roleLabel !== lastAuthor) {
      lines.push(`### ${roleLabel}`, "",);
    }
    lines.push(msg.content, "",);
    lastAuthor = roleLabel;
  }

  return lines.join("\n",);
}

export function formatJson(
  chat: { id: string; name: string; type: string; mode: string; created_at: string },
  messages: MessageData[],
): string {
  const sr = safeJsonStringify(
    {
      chat: {
        id: chat.id,
        name: chat.name,
        type: chat.type,
        mode: chat.mode,
        created_at: chat.created_at,
      },
      messages: Array.from(messages, (m,) => ({
        id: m.id,
        role: m.role,
        author: m.display_name,
        content: m.content,
        created_at: m.created_at,
        model_id: m.model_id,
        token_count: m.token_count_total,
      }),),
      exported_at: new Date().toISOString(),
    },
    2,
  );
  return sr.ok ? sr.value : "{}";
}

export function formatHtml(chat: { name: string; type: string; mode: string }, messages: MessageData[],): string {
  const messageHtml = Array.from(messages, (msg,) => {
    const author = msg.display_name || msg.role;
    const roleLabel = msg.role === MessageRole.User ? "You" : author;
    const roleClass = msg.role === MessageRole.User ? "user" : "assistant";
    const time = new Date(msg.created_at,).toLocaleString();

    return `
    <div class="message ${roleClass}">
      <div class="header">
        <span class="sender">${escapeHtml(roleLabel,)}</span>
        <span class="time">${escapeHtml(time,)}</span>
      </div>
      <div class="content">${escapeHtml(msg.content,)}</div>
    </div>`;
  },).join("\n",);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(chat.name,)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
      color: #333;
    }
    h1 {
      color: #2c3e50;
      border-bottom: 2px solid #3498db;
      padding-bottom: 10px;
    }
    .info {
      color: #666;
      margin-bottom: 20px;
      font-size: 0.9em;
    }
    .messages {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message {
      padding: 12px 16px;
      border-radius: 8px;
      max-width: 85%;
    }
    .message.user {
      background: #e3f2fd;
      align-self: flex-end;
      border-bottom-right-radius: 2px;
    }
    .message.assistant {
      background: #f3e5f5;
      align-self: flex-start;
      border-bottom-left-radius: 2px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
      font-size: 0.85em;
    }
    .sender {
      font-weight: 600;
      color: #555;
    }
    .time {
      color: #999;
    }
    .content {
      white-space: pre-wrap;
      line-height: 1.5;
    }
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #ddd;
      color: #999;
      font-size: 0.8em;
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(chat.name,)}</h1>
  <div class="info">
    <p><strong>Chat type:</strong> ${escapeHtml(chat.type,)} | <strong>Mode:</strong> ${escapeHtml(chat.mode,)}</p>
    <p><strong>Exported:</strong> ${new Date().toLocaleDateString()}</p>
  </div>
  <div class="messages">
    ${messageHtml}
  </div>
  <div class="footer">
    Exported from loop-lore
  </div>
</body>
</html>`;
}

export function formatPlainText(
  chat: { name: string; type: string; mode: string },
  messages: MessageData[],
): string {
  const lines: string[] = [
    chat.name,
    `Type: ${chat.type} | Mode: ${chat.mode}`,
    `Exported: ${new Date().toLocaleDateString()}`,
    "",
    "---",
    "",
  ];

  for (const msg of messages) {
    const author = msg.display_name || msg.role;
    const roleLabel = msg.role === MessageRole.User ? "You" : author;
    const time = new Date(msg.created_at,).toLocaleString();

    lines.push(`[${roleLabel}] (${time})`, "", msg.content, "", "---", "",);
  }

  return lines.join("\n",);
}
