import { afterAll, beforeEach, describe, expect, test, } from "bun:test";
import { registry, } from "../../../plugins/registry";
import type { AssembleContext, } from "../types";
import { pluginAgentRoleSection, } from "./plugin-agent-role";

/**
 * @param agentRole
 */
function makeContext(agentRole: string | null,): AssembleContext {
  return {
    db: {} as never,
    actor: {
      id: "actor-1",
      display_name: "Test",
      system_prompt: null,
      description: null,
      personality: null,
      scenario: null,
      post_history_instructions: null,
      mes_example: null,
      agent_role: agentRole,
    },
    chat: { id: "chat-1", mode: "chat", world_id: null, current_location_id: null, },
    params: {} as never,
    isStory: false,
    tokenBudget: 32_000,
  };
}

afterAll(() => {
  registry.unregisterAll();
},);
describe("pluginAgentRoleSection", () => {
  beforeEach(() => {
    registry.unregisterAll();
  },);

  test("disabled when actor has no agent_role", () => {
    const ctx = makeContext(null,);
    expect(pluginAgentRoleSection.enabled(ctx,),).toBe(false,);
  });

  test("enabled when actor has an agent_role", () => {
    const ctx = makeContext("card-battler",);
    expect(pluginAgentRoleSection.enabled(ctx,),).toBe(true,);
  });

  test("injects role system prompt when role is registered", async () => {
    registry.register({
      manifest: { name: "card-battle", version: "1.0.0", description: "", author: "t", },
      origin: "core",
      directory: "/tmp/card-battle",
    },);
    registry.addAgentRoles("card-battle", [
      {
        id: "card-battler",
        name: "Card Battler",
        description: "Card combat NPC",
        systemPrompt: "You are a fierce card battler.",
        tools: ["play_card_battle",],
      },
    ],);

    const msgs = await pluginAgentRoleSection.build(makeContext("card-battler",),);
    expect(msgs,).toHaveLength(1,);
    expect(msgs[0]!.role,).toBe("system",);
    expect(msgs[0]!.content,).toContain("You are a fierce card battler.",);
    expect(msgs[0]!.content,).toContain("<plugin_agent_role>",);
  });

  test("returns empty when role id not registered", async () => {
    const msgs = await pluginAgentRoleSection.build(makeContext("missing-role",),);
    expect(msgs,).toEqual([],);
  });

  test("returns empty when registered role has no systemPrompt", async () => {
    registry.register({
      manifest: { name: "p", version: "1.0.0", description: "", author: "t", },
      origin: "community",
      directory: "/tmp/p",
    },);
    registry.addAgentRoles("p", [
      { id: "empty", name: "Empty", description: "", systemPrompt: "", tools: [], },
    ],);

    const msgs = await pluginAgentRoleSection.build(makeContext("empty",),);
    expect(msgs,).toEqual([],);
  });
});
