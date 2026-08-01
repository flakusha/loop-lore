/**
 * Plugin agent role section — injects a plugin-declared role's system prompt.
 *
 * When the generating actor has an `agent_role` assigned (a kebab-case id
 * referencing a plugin's AgentRoleDefinition), this section injects that
 * role's system prompt into the conversation so the actor behaves according
 * to the plugin role's persona and capabilities.
 *
 * The role's declared tool list is gated separately in the generation route
 * (only the role's tools are exposed to the model when a role is assigned).
 */
import { registry, } from "../../../plugins/registry";
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

export const pluginAgentRoleSection: SectionBuilder = {
  name: "pluginAgentRole",
  enabled: (ctx,) => !!ctx.actor.agent_role,
  build: (ctx,) => {
    const roleId = ctx.actor.agent_role;
    if (!roleId) { return []; }

    const role = registry.getAgentRole(roleId,);
    if (!role) {
      // Role id assigned but no matching plugin role registered — no-op.
      return [];
    }
    if (!role.systemPrompt) { return []; }

    return [{ role: "system", content: wrapSection("plugin_agent_role", role.systemPrompt,), },];
  },
};
