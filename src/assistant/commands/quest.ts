/**
 * /quest — Manage quests for the current chat/world.
 *
 * Subcommands:
 *   /quest list       — List active quests
 *   /quest create     — Create a quest from description
 *   /quest status     — Show quest status
 *   /quest complete   — Mark a quest as complete
 */

import { type CommandResult, registerCommand, } from "./registry";

registerCommand("quest", async (args,): Promise<CommandResult> => {
  const action = (args[0] || "list").toLowerCase();

  switch (action) {
    case "list": {
      // TODO: Query quest table for current chat/world
      return {
        systemMessage: "**Active Quests:**\n\nNo active quests in this chat.",
        handled: true,
      };
    }

    case "create": {
      const description = args.slice(1,).join(" ",).trim();
      if (!description) {
        return {
          systemMessage:
            "Usage: /quest create <description>\nExample: /quest create Find the lost artifact in the crypt",
          handled: true,
        };
      }
      // TODO: Call generation pipeline with quest prompt template
      // TODO: Store result in quests table
      return {
        systemMessage: `**Quest created:** ${description}\n\nThe quest has been added to your journal.`,
        action: "create-quest",
        actionPayload: { description, },
        handled: true,
      };
    }

    case "status": {
      // TODO: Show quest progress
      return {
        systemMessage: "**Quest Status:**\n\nNo quests to show.",
        handled: true,
      };
    }

    case "complete": {
      const questName = args.slice(1,).join(" ",).trim();
      if (!questName) {
        return {
          systemMessage: "Usage: /quest complete <quest name>",
          handled: true,
        };
      }
      // TODO: Update quest status in DB
      return {
        systemMessage: `**Quest completed:** ${questName}`,
        action: "complete-quest",
        actionPayload: { questName, },
        handled: true,
      };
    }

    default: {
      return {
        systemMessage: "Usage: /quest [list|create|status|complete] [args...]\n\n" +
          "- /quest list — List active quests\n" +
          "- /quest create <desc> — Create a new quest\n" +
          "- /quest status — Show quest progress\n" +
          "- /quest complete <name> — Mark quest as complete",
        handled: true,
      };
    }
  }
},);
