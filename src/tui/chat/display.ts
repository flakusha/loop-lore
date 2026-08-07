import type { ChatMessage, } from "./types";

/** Format a message line for display in the blessed list. */
export function formatMessageLine(message: ChatMessage,): string {
  /* eslint-disable unicorn/no-incorrect-template-string-interpolation */
  const prefix = message.actorName
    ? `{bold}${message.actorName}{/bold}: `
    : `{bold}${message.role}{/bold}: `;
  /* eslint-enable unicorn/no-incorrect-template-string-interpolation */
  return `${prefix}${message.content.slice(0, 200,)}${message.content.length > 200 ? "..." : ""}`;
}
