/**
 * Memory Provision — Privacy-Aware Filtering and Injection
 *
 * Given a set of memories, a viewer, and context, determines which
 * memories should be injected into a prompt. Respects privacy levels,
 * shareability, scope, and token budget.
 *
 * Pure functions for the filtering logic; DB queries are in the service layer.
 */
import { estimateTokens, } from "../chat/token-utils";
import { selectWithinBudget, } from "./budget";
import { evaluateShareability, parseShareability, } from "./shareability";
import type { MemoryEntry, MemoryPrivacy, } from "./types";

// ─── Types ────────────────────────────────────────────────────

/** Context for memory provisioning. */
export interface ProvisionContext {
  /** Who is the viewer (the character whose perspective we're building). */
  viewerId: string;
  /** Who owns the memories being evaluated. */
  ownerId: string;
  /** Current chat ID. */
  chatId: string;
  /** Current world ID (null if not in a world). */
  worldId: string | null;
  /** All participant IDs in the current chat. */
  participantIds: string[];
  /** Optional trust modifier for this viewer-owner pair (-1 to +1). */
  trustModifier?: number;
  /** Random function for deterministic testing. */
  randomFn?: () => number;
}

/** Result of memory provisioning. */
export interface ProvisionResult {
  /** Memories that passed all filters and should be injected. */
  accepted: MemoryEntry[];
  /** Memories that were rejected, with reasons. */
  rejected: { memory: MemoryEntry; reason: string }[];
  /** Total tokens consumed by accepted memories. */
  tokensUsed: number;
}

// ─── Core Provisioning ────────────────────────────────────────

/**
 * Filter and select memories for injection into a prompt.
 *
 * Applies filters in order:
 * 1. Scope filtering (character/world/general)
 * 2. Privacy filtering (public/shared/private/secret)
 * 3. Shareability evaluation (probability + trusted/blocked)
 * 4. Token budget enforcement
 *
 * @param memories - All candidate memories
 * @param ctx - Provision context
 * @param maxTokens - Maximum tokens for memories (default: 1024)
 * @returns ProvisionResult with accepted and rejected memories
 */
export function provisionMemories(
  memories: MemoryEntry[],
  ctx: ProvisionContext,
  maxTokens = 1024,
): ProvisionResult {
  const rejected: { memory: MemoryEntry; reason: string }[] = [];
  const accepted: MemoryEntry[] = [];

  for (const memory of memories) {
    const rejection = evaluateMemory(memory, ctx,);
    if (rejection) {
      rejected.push({ memory, reason: rejection, },);
      continue;
    }
    accepted.push(memory,);
  }

  // Apply token budget
  const withinBudget = selectWithinBudget(accepted, { maxTokens, respectPins: true, },);
  const tokensUsed = withinBudget.reduce((sum, m,) => sum + estimateTokens(m.content,), 0,);

  // Track rejected-by-budget
  const acceptedIds = new Set(withinBudget.map((m,) => m.id),);
  for (const memory of accepted) {
    if (!acceptedIds.has(memory.id,)) {
      rejected.push({ memory, reason: "budget_exceeded", },);
    }
  }

  return { accepted: withinBudget, rejected, tokensUsed, };
}

// ─── Single Memory Evaluation ─────────────────────────────────

/**
 * Evaluate a single memory against the provision context.
 *
 * @returns Rejection reason string, or null if memory should be accepted
 */
function evaluateMemory(
  memory: MemoryEntry,
  ctx: ProvisionContext,
): string | null {
  const privacy = memory.privacy ?? "shared";

  // For secret memories: shareability check first (trusted actors bypass scope)
  if (privacy === "secret") {
    const config = parseShareability(memory.shareability,);
    const ownerId = memory.actorId ?? memory.userId ?? "";
    const decision = evaluateShareability({
      privacy,
      ownerId,
      viewerId: ctx.viewerId,
      shareability: config,
      trustModifier: ctx.trustModifier,
      randomFn: ctx.randomFn,
    },);
    if (decision === "withhold") { return "privacy:secret_not_shared"; }
    return null; // trusted or probability passed — skip scope check
  }

  // For public/shared/private: scope check first
  const scopeRejection = checkScope(memory, ctx, privacy,);
  if (scopeRejection) { return scopeRejection; }

  // Privacy check for private memories
  return checkPrivacy(memory, ctx,);
}

// ─── Scope Filtering ──────────────────────────────────────────

/**
 * Check if a memory's scope allows it in this context.
 *
 * Rules:
 * - `character`: owner sees own; shared/public visible to all
 * - `world`: must be in the same world
 * - `assistant`: visible to all users
 *
 * @returns Rejection reason, or null if scope is valid
 */
function checkScope(
  memory: MemoryEntry,
  ctx: ProvisionContext,
  privacy: MemoryPrivacy,
): string | null {
  switch (memory.scope) {
    case "character": {
      if (memory.actorId === ctx.viewerId) { return null; }
      if (privacy === "public") { return null; }
      return "scope:character_not_owner";
    }
    case "world": {
      if (!ctx.worldId || memory.worldId !== ctx.worldId) { return "scope:world_mismatch"; }
      return null;
    }
    case "assistant": {
      return null;
    }
    default: {
      return "scope:unknown";
    }
  }
}

// ─── Privacy Filtering ────────────────────────────────────────

/**
 * Check if a memory's privacy level allows it to be shared with the viewer.
 *
 * Note: secret memories are handled by evaluateMemory before this is called.
 * Only public, shared, and private reach here.
 *
 * @returns Rejection reason, or null if privacy allows sharing
 */
function checkPrivacy(
  memory: MemoryEntry,
  ctx: ProvisionContext,
): string | null {
  const ownerId = memory.actorId ?? memory.userId ?? "";
  const privacy = memory.privacy ?? "shared";

  if (privacy === "public" || privacy === "shared") {
    return null;
  }

  // Private: only owner sees
  if (privacy === "private") {
    if (ownerId !== ctx.viewerId) { return "privacy:private_not_owner"; }
    return null;
  }

  return "privacy:unknown";
}
