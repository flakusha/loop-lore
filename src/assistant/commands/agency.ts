// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /agency — player-agency story points (Bennies / FATE / Inspiration).
 *
 * Subcommands:
 *   /agency               — status for the calling actor
 *   /agency status        — same as above
 *   /agency earn <n> [reason] — owner-only credit (used by GM tool flows)
 *   /agency spend <n> [reason] — debit (e.g. for rerolls)
 *   /agency cap <n|clear> — owner-only set/clear the cap
 */

import { ChatParticipantRole, } from "../../db/enums";
import {
  earnStoryPoints,
  getStoryPointBalance,
  InsufficientStoryPointsError,
  InvalidAmountError,
  setStoryPointCap,
  spendStoryPoints,
} from "../../services/agency/story-points";
import { type CommandResult, registerCommand, } from "./registry";

function parseAmount(raw: string | undefined,): number | null {
  if (raw === undefined) { return null; }
  const n = Number(raw,);
  if (!Number.isFinite(n,) || !Number.isInteger(n,)) { return null; }
  return n;
}

function formatStatus(name: string, bal: Awaited<ReturnType<typeof getStoryPointBalance>>,): string {
  const capLabel = bal.cap === null ? "∞" : String(bal.cap,);
  return (
    `**${name}** story points: **${bal.balance}** ` +
    `(earned ${bal.earned_total}, spent ${bal.spent_total}, cap ${capLabel})`
  );
}

registerCommand("agency", async (args, ctx,): Promise<CommandResult> => {
  const db = ctx.db;
  if (!db) {
    return {
      systemMessage: "**Agency unavailable:** command context missing database.",
      handled: true,
    };
  }

  const actorId = ctx.userId;
  if (!actorId) {
    return {
      systemMessage: "**Agency unavailable:** no calling actor.",
      handled: true,
    };
  }

  const sub = (args[0] ?? "status").toLowerCase();
  const worldId = ctx.activeChat?.worldId ?? null;

  if (sub === "status" || sub === "") {
    const bal = await getStoryPointBalance(db, actorId, worldId,);
    const name = ctx.currentCharacter?.display_name ?? ctx.currentCharacter?.name ?? "You";
    return { systemMessage: formatStatus(name, bal,), handled: true, };
  }

  if (sub === "earn") {
    const role = ctx.roleInChat ?? ChatParticipantRole.Member;
    if (role !== ChatParticipantRole.Owner) {
      return {
        systemMessage: "**Agency earn:** owner-only.",
        handled: true,
      };
    }
    const amount = parseAmount(args[1],);
    if (amount === null) {
      return {
        systemMessage: "Usage: `/agency earn <amount> [reason]` — amount must be a positive integer.",
        handled: true,
      };
    }
    try {
      const reason = args.slice(2,).join(" ",) || null;
      const ledger = await earnStoryPoints(db, { actorId, worldId, amount, reason, },);
      return {
        systemMessage: `**+${amount}** story points → balance **${ledger.balance}** (earned ${ledger.earned_total}).`,
        handled: true,
      };
    } catch (err) {
      if (err instanceof InvalidAmountError) {
        return { systemMessage: "**Agency earn:** amount must be a positive integer.", handled: true, };
      }
      const msg = err instanceof Error ? err.message : String(err,);
      return { systemMessage: `**Agency earn failed:** ${msg}`, handled: true, };
    }
  }

  if (sub === "spend") {
    const amount = parseAmount(args[1],);
    if (amount === null) {
      return {
        systemMessage: "Usage: `/agency spend <amount> [reason]` — amount must be a positive integer.",
        handled: true,
      };
    }
    try {
      const reason = args.slice(2,).join(" ",) || null;
      const ledger = await spendStoryPoints(db, { actorId, worldId, amount, reason, },);
      return {
        systemMessage: `**-${amount}** story points → balance **${ledger.balance}** (spent ${ledger.spent_total}).`,
        handled: true,
      };
    } catch (err) {
      if (err instanceof InsufficientStoryPointsError) {
        return {
          systemMessage: `**Not enough story points.** You have ${err.available}, need ${err.requested}.`,
          handled: true,
        };
      }
      if (err instanceof InvalidAmountError) {
        return { systemMessage: "**Agency spend:** amount must be a positive integer.", handled: true, };
      }
      const msg = err instanceof Error ? err.message : String(err,);
      return { systemMessage: `**Agency spend failed:** ${msg}`, handled: true, };
    }
  }

  if (sub === "cap") {
    const role = ctx.roleInChat ?? ChatParticipantRole.Member;
    if (role !== ChatParticipantRole.Owner) {
      return {
        systemMessage: "**Agency cap:** owner-only.",
        handled: true,
      };
    }
    const raw = args[1];
    if (raw === undefined) {
      return {
        systemMessage: "Usage: `/agency cap <amount|clear>` — set the story-point cap for this world.",
        handled: true,
      };
    }
    if (raw.toLowerCase() === "clear") {
      await setStoryPointCap(db, actorId, worldId, null,);
      return { systemMessage: "**Story-point cap cleared** (unlimited).", handled: true, };
    }
    const amount = parseAmount(raw,);
    if (amount === null) {
      return { systemMessage: "**Agency cap:** must be a positive integer or `clear`.", handled: true, };
    }
    await setStoryPointCap(db, actorId, worldId, amount,);
    return { systemMessage: `**Story-point cap set to ${amount}**.`, handled: true, };
  }

  return {
    systemMessage: "Usage: `/agency [status|earn <n> [reason]|spend <n> [reason]|cap <n|clear>]`",
    handled: true,
  };
},);
