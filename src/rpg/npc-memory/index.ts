// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC memory subsystem.
 *
 *   recordMemory / recallMemories / reinforceMemory  - memory.ts
 *   updateRelationship / computeRelationshipType     - memory.ts
 *   decayMemories                                     - decay.ts
 *
 * All functions take an explicit `db` and, where a timestamp is involved, an
 * explicit `now`; nothing here reads the wall clock or an RNG.
 */
export type { DecayInputs, DecaySweepResult, } from "./decay";
export { decayLoss, decayMemories, } from "./decay";
export type {
  NpcMemoryRow,
  NpcRelationshipRow,
  RecallMemoriesOptions,
  RecordMemoryInput,
  RecordMemoryOptions,
  RelationshipHistoryEntry,
  RelationshipStanding,
  UpdateRelationshipOptions,
} from "./memory";
export {
  computeRelationshipType,
  recallMemories,
  recordMemory,
  reinforceMemory,
  updateRelationship,
} from "./memory";
