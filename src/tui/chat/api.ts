import { safeJsonStringify, } from "../../utils";
import type { ChatHost, ChatMessage, } from "./types";

export const API_BASE = process.env.LOOP_LORE_API_BASE_URL ?? "http://localhost:3000";

function getAuthHeaders(sessionToken: string | undefined,): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", };
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }
  return headers;
}

/**
 * Send message via POST /api/chats/:id/messages.
 * Shows typing indicator, adds user message + assistant auto-reply.
 */
export async function handleSend(host: ChatHost, text: string,): Promise<void> {
  if (!host.chatId) {
    host.showError("No active chat. Create or select a chat first.",);
    return;
  }
  if (host.isSending) { return; }

  host.isSending = true;
  host.showTyping();

  try {
    const bodyResult = safeJsonStringify({ content: text, role: "user", },);
    const res = await fetch(`${API_BASE}/api/chats/${host.chatId}/messages`, {
      method: "POST",
      headers: getAuthHeaders(host.sessionToken,),
      body: bodyResult.ok ? bodyResult.value : "{}",
    },);

    host.hideTyping();

    if (!res.ok) {
      let body: { error?: string };
      try {
        body = (await res.json()) as { error?: string };
      } catch {
        body = { error: res.statusText, };
      }
      host.showError(body.error ?? `HTTP ${res.status}`,);
      return;
    }

    const data = (await res.json()) as {
      id: string;
      assistantMessage?: { id: string; content: string };
    };

    // Add user message
    host.addMessage({ id: data.id, role: "user", content: text, },);

    // Add assistant auto-reply if present
    if (data.assistantMessage) {
      host.addMessage({
        id: data.assistantMessage.id,
        role: "assistant",
        content: data.assistantMessage.content,
      },);
    }
  } catch (error) {
    host.hideTyping();
    host.showError(`Network error: ${(error as Error).message}`,);
  } finally {
    host.isSending = false;
    host.screen.render();
  }
}

/** Load messages from GET /api/chats/:id/messages with cursor-based pagination */
export async function loadMessages(host: ChatHost,): Promise<void> {
  if (!host.chatId) { return; }
  try {
    const url = host.cursor
      ? `${API_BASE}/api/chats/${host.chatId}/messages?pageSize=200&cursor=${host.cursor}`
      : `${API_BASE}/api/chats/${host.chatId}/messages?pageSize=200`;
    const res = await fetch(url, { headers: getAuthHeaders(host.sessionToken,), },);
    if (!res.ok) {
      host.showError(`Failed to load messages (HTTP ${res.status})`,);
      return;
    }
    const data = (await res.json()) as { data: ChatMessage[]; cursor: string | null };
    host.cursor = data.cursor ?? host.cursor;
    // Prepend older messages (cursor fetches older)
    host.messages = host.messages.length > 0 ? [...data.data, ...host.messages,] : data.data;
    host.itemCount = host.messages.length;
    host.scrollToBottom();
  } catch (error) {
    host.showError(`Network error loading messages: ${(error as Error).message}`,);
  }
}
