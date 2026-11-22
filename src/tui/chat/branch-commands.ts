// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Client-side TUI commands for the shipped branch / party-split routes.
 * They are dispatched from the chat input before a plain message send, the
 * same way `/image` and `/upload` are handled in `chat/index.ts`.
 */
import { safeJsonParse, } from "../../utils";
import { type BranchResult, createBranch, listBranches, mergeBranch, reuniteChats, splitChat, } from "./branch-api";
import type { ChatHost, } from "./types";

/** Render one command result as a system row (or an error line). */
function report<T,>(host: ChatHost, result: BranchResult<T>, format: (data: T,) => string,): void {
  if (!result.ok) {
    host.showError(result.error,);
    return;
  }

  host.addMessage({ id: crypto.randomUUID(), role: "system", content: format(result.data,), },);
}

/**
 * Handle `/branch`, `/split` and `/reunite`.
 * @param host - chat widget host (chat id, token, transcript sinks)
 * @param text - trimmed input starting with `/`
 * @returns true when the text was one of these commands
 */
export async function dispatchBranchCommand(host: ChatHost, text: string,): Promise<boolean> {
  const parts = text.split(/\s+/,);
  const name = parts[0]?.slice(1,);
  if (name !== "branch" && name !== "split" && name !== "reunite") { return false; }

  if (!host.chatId) {
    host.showError("No active chat. Create or select a chat first.",);
    return true;
  }

  const base = { chatId: host.chatId, sessionToken: host.sessionToken, };

  if (name === "branch") {
    const action = parts[1] ?? "list";
    if (action === "create") {
      const messageId = parts[2];
      if (!messageId) {
        host.showError("Usage: /branch create <messageId> [name]",);
        return true;
      }

      const result = await createBranch({ ...base, messageId, name: parts[3], },);
      report(host, result, (data,) => `Branch ${data.branch.name} (${data.branch.id}) created.`,);
      return true;
    }

    if (action === "merge") {
      const branchId = parts[2];
      if (!branchId) {
        host.showError("Usage: /branch merge <branchId> [intoBranchId]",);
        return true;
      }

      const result = await mergeBranch({ ...base, branchId, intoBranchId: parts[3], },);
      report(
        host,
        result,
        (data,) =>
          `Merged ${data.sourceBranchId} into ${data.targetBranchId}: ${data.movedMessageIds.length} messages moved.`,
      );

      return true;
    }

    const result = await listBranches(base,);
    report(host, result, (data,) => {
      const rows = data.branches.map((branch,) =>
        `${branch.isActive ? "*" : " "} ${branch.id} ${branch.name} (${branch.messageCount} messages)`
      );

      return rows.length > 0 ? `Branches:\n${rows.join("\n",)}` : "No branches yet.";
    },);

    return true;
  }

  if (name === "split") {
    const raw = parts.slice(1,).join(" ",);
    const parsed = safeJsonParse<{ name?: string; locationId: string; actorIds: string[] }[]>(raw,);
    if (!parsed.ok) {
      host.showError('Usage: /split [{"locationId":"...","actorIds":["..."]}]',);
      return true;
    }

    if (
      !Array.isArray(parsed.value,) || parsed.value.length === 0 ||
      parsed.value.some((b,) => typeof b?.locationId !== "string" || !Array.isArray(b?.actorIds,))
    ) {
      host.showError("Invalid split: each branch needs locationId and actorIds.",);
      return true;
    }

    const branches = parsed.value;

    const result = await splitChat({ ...base, branches, },);
    report(host, result, (data,) => `Split into ${data.branches.map((b,) => b.chatId).join(", ",)}.`,);
    return true;
  }

  const secondaryChatId = parts[1];
  if (!secondaryChatId) {
    host.showError("Usage: /reunite <secondaryChatId>",);
    return true;
  }

  const result = await reuniteChats({ ...base, secondaryChatId, },);
  report(host, result, (data,) => `Reunited ${data.mergedMessageCount} messages.`,);
  return true;
}
