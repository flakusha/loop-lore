// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /split — branch the party chat into per-group child chats (C7).
 *
 *   /split <locationId>:<actorId>[,actorId...] [<locationId>:<actors> ...]
 *
 *   /split forest:alice,bob cave:gm          — two branches
 *
 * Each whitespace token is one branch group (the command parser splits on
 * whitespace, so the grammar carries no arrows or quotes). The grammar
 * needs at least two groups; `splitParty` validates that every location
 * belongs to the chat's world and every actor is a chat participant.
 *
 * Ownership: the service's `created_by === actorId` guard applies, with the
 * session user (`ctx.userId`) as the actor — never a client-supplied id.
 */
import { type SplitBranch, splitParty, } from "../../chat/service/split";
import { ChatParticipantRole, } from "../../db/enums";
import { type CommandResult, registerCommand, } from "./registry";

const USAGE =
  "Usage: `/split <locationId>:<actorId>[,actorId...] [<locationId>:<actors> ...]` — at least two branch groups.";

registerCommand("split", async (args, ctx,): Promise<CommandResult> => {
  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Split unavailable:** command context missing database.", handled: true, };
  }

  const userId = ctx.userId;
  if (!userId) {
    return { systemMessage: "**Split unavailable:** missing user context.", handled: true, };
  }

  const parsed = parseBranchGroups(args,);
  if (!parsed.ok) {
    return { systemMessage: `**Split:** ${parsed.reason}\n${USAGE}`, handled: true, };
  }

  const result = await splitParty(db, { chatId: ctx.chatId, actorId: userId, branches: parsed.branches, },);
  if ("code" in result) {
    return { systemMessage: `**Split failed:** ${result.message}`, handled: true, };
  }

  const lines = [`**Party split** — ${result.branches.length} branches created:`,];
  for (const branch of result.branches) {
    const group = branch.participantCount === 1 ? "participant" : "participants";
    lines.push(`- ${branch.locationId}: \`${branch.chatId}\` (${branch.participantCount} ${group})`,);
  }

  return {
    systemMessage: lines.join("\n",),
    action: "party-split",
    actionPayload: { branches: result.branches, },
    handled: true,
  };
}, { requiredRole: ChatParticipantRole.Owner, capabilities: ["write-chat",], },);

/** Parse `/split` branch-group tokens into service branches. */
function parseBranchGroups(
  args: string[],
): { ok: true; branches: SplitBranch[] } | { ok: false; reason: string } {
  if (args.length < 2) {
    return { ok: false, reason: "at least two branch groups are required.", };
  }

  const branches: SplitBranch[] = [];
  for (const arg of args) {
    const separator = arg.indexOf(":",);
    if (separator <= 0 || separator === arg.length - 1) {
      return { ok: false, reason: `"${arg}" is not a <locationId>:<actorId>[,actorId...] group.`, };
    }

    const locationId = arg.slice(0, separator,);
    const actorIds = arg.slice(separator + 1,).split(",",).filter(id => id.length > 0);
    if (actorIds.length === 0) {
      return { ok: false, reason: `branch "${locationId}" has no actors.`, };
    }

    branches.push({ locationId, actorIds, name: locationId, },);
  }

  return { ok: true, branches, };
}
