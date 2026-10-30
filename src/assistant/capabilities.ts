// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Capability vocabulary for the assistant tool guard.
 *
 * Every registered command declares the capabilities it needs; the guard
 * (Layer 1) turns that declaration into a deterministic allow / review / deny
 * decision before any handler runs. A command that declares nothing is denied
 * — the declaration IS the security contract.
 */
import type { ChatParticipantRole, } from "../db/enums";

/** Capability tags a tool may declare. */
export type CapabilityTag =
  | "read-chat"
  | "write-chat"
  | "read-memory"
  | "write-memory"
  | "read-asset"
  | "write-asset"
  | "delete-asset"
  | "read-world"
  | "write-world"
  | "delete-world"
  | "read-lore"
  | "write-lore"
  | "read-character"
  | "write-character"
  | "delete-character"
  | "network"
  | "cross-user"
  | "irreversible"
  | "destructive"
  | "admin-only"
  | "moderator-only";

/** What the guard does with a capability. */
export type CapabilityPolicy = "deny" | "allow" | "review";

/**
 * Policy per tag.
 *
 * `read-*` is allowed, mutations and outward-facing effects are reviewed, and
 * the three privilege tags are denied outright (the role gate can lift
 * `admin-only` / `moderator-only` / `destructive` for a privileged caller).
 */
export const CAPABILITY_POLICY: Record<CapabilityTag, CapabilityPolicy> = {
  "read-chat": "allow",
  "write-chat": "review",
  "read-memory": "allow",
  "write-memory": "review",
  "read-asset": "allow",
  "write-asset": "review",
  "delete-asset": "review",
  "read-world": "allow",
  "write-world": "review",
  "delete-world": "review",
  "read-lore": "allow",
  "write-lore": "review",
  "read-character": "allow",
  "write-character": "review",
  "delete-character": "review",
  "network": "review",
  "cross-user": "review",
  "irreversible": "review",
  "destructive": "deny",
  "admin-only": "deny",
  "moderator-only": "deny",
};

/** Resource ceilings for one tool call. */
export interface ToolLimits {
  /** Hard wall-clock ceiling for the call. */
  timeoutMs: number;
  /** Declared memory ceiling in megabytes. */
  memoryMb: number;
  /** Optional outbound byte ceiling. */
  networkBytes?: number;
}

/** A tool's declared capability profile. */
export interface ToolCapability {
  /** Registered command name. */
  tool: string;
  /** Declared capability tags. */
  tags: CapabilityTag[];
  /** Limits applied to the call. */
  limits: ToolLimits;
  /** Minimum chat role, when the command declares one. */
  requiredRole?: ChatParticipantRole;
}

/**
 * Default limits shared by every command that does not declare its own.
 *
 * The memory ceiling is declarative only — Bun exposes no `ResourceLimits`
 * equivalent, so it cannot be enforced in-process. The timeout can.
 */
export const DEFAULT_LIMITS: ToolLimits = { timeoutMs: 10_000, memoryMb: 256, };
