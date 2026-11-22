// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `/chars` — list characters, then `/chars <n>` creates a chat with the nth
 * row of that same page. Re-listing on selection keeps this stateless: no
 * module-level cache that a chat switch could invalidate.
 */
import { createChatWithCharacter, listCharacters, } from "./characters-api";
import type { ChatHost, } from "./types";

const PAGE_SIZE = 20;

/**
 * @param host - chat widget host
 * @param text - trimmed input starting with `/chars`
 * @returns true when the text was a character command
 */
export async function dispatchCharacterCommand(host: ChatHost, text: string,): Promise<boolean> {
  if (text !== "/chars" && !text.startsWith("/chars ",)) { return false; }

  const token = text.slice("/chars".length,).trim();
  const page = 1;
  const listed = await listCharacters({ sessionToken: host.sessionToken, page, pageSize: PAGE_SIZE, },);
  if (!listed.ok) {
    host.showError(listed.error,);
    return true;
  }

  const rows = listed.data.data ?? [];
  if (token === "") {
    const lines = rows.map((row, index,) => `${index + 1}. ${row.display_name} (${row.id})`);
    host.addMessage({
      id: crypto.randomUUID(),
      role: "system",
      content: lines.length > 0
        ? `Characters:\n${lines.join("\n",)}\n/chars <n> to start a chat.`
        : "No characters found.",
    },);

    return true;
  }

  const index = Number.parseInt(token, 10,) - 1;
  const row = rows[index];
  if (!Number.isInteger(index,) || index < 0 || row === undefined) {
    host.showError(`No character #${token} on this page. Run /chars to list.`,);
    return true;
  }

  const created = await createChatWithCharacter({
    name: row.display_name,
    actorId: row.id,
    sessionToken: host.sessionToken,
  },);

  if (!created.ok) {
    host.showError(created.error,);
    return true;
  }

  host.addMessage({
    id: crypto.randomUUID(),
    role: "system",
    content: `Chat with ${row.display_name} created: ${created.chatId}. Select it from the chat picker.`,
  },);

  return true;
}
