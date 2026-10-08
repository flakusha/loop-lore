// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tool gating — gate plugin tools by agent role.
 *
 * Extracted from tool-execution.ts to keep that module under the size budget.
 */

import { getLogger, } from "../../logger";
import { registry, } from "../../plugins/registry";
import type { ToolDefinition, } from "../../plugins/types";

/**
 * Gate plugin tools by the actor's assigned agent role.
 *
 * UNASSIGNED (`null`) keeps every registered tool: `agent_role` is a per-character
 * plugin persona (`actors.agent_role`), not an authz principal. The INVARIANT that
 * makes this safe is upstream, not here: `validateGenerateRequest`
 * (`./validate.ts`) rejects any `actorId` that is not a participant of the very
 * chat being generated, so the `actors` lookup in the sole caller
 * (`./provider-request.ts:56`) can only MISS for a character that genuinely has
 * no plugin persona — the benign case. If that check is ever relaxed, a missing
 * or failed lookup returns `null` again and this branch becomes an authz bypass.
 * An ASSIGNED role that does not resolve DENIES instead — a typo or a disabled
 * plugin's role must never widen the surface (BUG-plugin-tool-authorization-fails-open).
 * @param agentRole - The actor's assigned plugin agent role id (or null)
 * @returns The filtered list of plugin tool definitions
 */
export function gatePluginToolsByRole(agentRole: string | null,): ToolDefinition[] {
  const pluginTools = registry.getAllTools();
  if (!agentRole) { return pluginTools; }

  const role = registry.getAgentRole(agentRole,);
  // Fail CLOSED — an unresolvable id must never yield MORE tools than a resolvable one.
  if (!role) {
    auditUnresolvedRole(agentRole,);
    return [];
  }

  if (!role.tools?.length) { return []; }

  const allowed: Record<string, true> = {};
  for (const name of role.tools) { allowed[name] = true; }
  const out: ToolDefinition[] = [];
  for (const t of pluginTools) { if (allowed[t.name]) { out.push(t,); } }
  return out;
}

/** Log a denial from an agent role id no plugin registers (best-effort, like `auditDenial` in src/plugins/route-access.ts). */
function auditUnresolvedRole(agentRole: string,): void {
  try {
    getLogger().warn("plugin tool gate denied: unresolvable agent role", {
      module: "authz",
      agentRole,
      registeredRoles: registry.getAllAgentRoles().map((r,) => r.id),
    },);
  } catch {
    // Logger not initialised — swallow.
  }
}
