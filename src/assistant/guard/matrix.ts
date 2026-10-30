// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Layer 1 of the assistant tool guard — the capability matrix.
 *
 * A deterministic pre-check (<1ms, no LLM): the tool's declared capability
 * tags plus the caller's chat role and site role decide whether the call is
 * allowed, needs the Layer 2 judge, or is denied outright.
 *
 * Fail closed: a tool that declares no capabilities is denied.
 */
import type { ChatParticipantRole, } from "../../db/enums";
import { isAdminRole, isElevatedRole, } from "../../users/roles";
import { CAPABILITY_POLICY, } from "../capabilities";
import type { CapabilityPolicy, CapabilityTag, } from "../capabilities";

/** Outcome of the Layer 1 check. */
export interface CapabilityDecision {
  /** Whether the call may proceed (a review-tier call still needs the judge). */
  allowed: boolean;
  /** Human-readable explanation, surfaced to the caller on denial. */
  reason: string;
  /** Whether the call must pass the Layer 2 judge before it runs. */
  requiresReview: boolean;
  /** The tags the decision was based on. */
  tags: CapabilityTag[];
}

/** Input for the Layer 1 check. */
export interface CapabilityInput {
  /** Registered command name. */
  tool: string;
  /** Declared capability tags — undefined/empty means "undeclared". */
  tags: CapabilityTag[] | undefined;
  /** The caller's role in the chat. */
  roleInChat?: ChatParticipantRole;
  /** The caller's site role (`users.role`). */
  userRole?: string | null;
}

/** Privilege a deny-tier tag demands, in words. */
const DEMAND: Record<string, string> = {
  "admin-only": "site administrator",
  "moderator-only": "moderator",
  "destructive": "privileged caller",
};

/**
 * Whether the caller satisfies the privilege a deny-tier tag demands.
 *
 * `admin-only` demands a site administrator. `moderator-only` accepts an
 * elevated site role or the chat owner. `destructive` accepts a site
 * administrator or the chat owner — the owner of the world the destructive
 * tool operates on.
 * @param tag - Deny-tier capability tag
 * @param roleInChat - Caller's chat role
 * @param userRole - Caller's site role
 * @returns true when the caller may use the tool
 */
function satisfiesDenyTag(
  tag: CapabilityTag,
  roleInChat: ChatParticipantRole | undefined,
  userRole: string | null | undefined,
): boolean {
  if (tag === "admin-only") { return isAdminRole(userRole,); }
  const chatOwner = roleInChat === "owner";
  if (tag === "moderator-only") { return isElevatedRole(userRole,) || chatOwner; }
  if (tag === "destructive") { return isAdminRole(userRole,) || chatOwner; }
  return false;
}

/**
 * Rank policies by restrictiveness — deny beats review beats allow.
 * @param left - First policy
 * @param right - Second policy
 * @returns The more restrictive of the two
 */
function mostRestrictive(left: CapabilityPolicy, right: CapabilityPolicy,): CapabilityPolicy {
  const rank: Record<CapabilityPolicy, number> = { allow: 0, review: 1, deny: 2, };
  return rank[left] >= rank[right] ? left : right;
}

/**
 * Run the Layer 1 capability check.
 * @param input - Tool name, declared tags, and the caller's roles
 * @returns The decision, with the tags it was based on
 */
export function evaluateCapabilities(input: CapabilityInput,): CapabilityDecision {
  const { tool, tags, roleInChat, userRole, } = input;

  if (!tags || tags.length === 0) {
    return {
      allowed: false,
      reason: `\`/${tool}\` declares no capabilities and cannot run.`,
      requiresReview: false,
      tags: [],
    };
  }

  let effective: CapabilityPolicy = "allow";
  const reviewTags: CapabilityTag[] = [];

  for (const tag of tags) {
    const policy = CAPABILITY_POLICY[tag] ?? "deny";
    if (policy === "deny") {
      if (!satisfiesDenyTag(tag, roleInChat, userRole,)) {
        return {
          allowed: false,
          reason: `\`/${tool}\` requires ${DEMAND[tag] ?? "elevated privileges"} and cannot run for this caller.`,
          requiresReview: false,
          tags,
        };
      }

      // The caller met the privilege the tag demands — the tag no longer
      // restricts anything, so it contributes no policy of its own.
      continue;
    }

    if (policy === "review") { reviewTags.push(tag,); }
    effective = mostRestrictive(effective, policy,);
  }

  const requiresReview = effective === "review";
  return {
    allowed: true,
    reason: requiresReview
      ? `\`/${tool}\` needs review for: ${reviewTags.join(", ",)}.`
      : `\`/${tool}\` may run.`,
    requiresReview,
    tags,
  };
}
