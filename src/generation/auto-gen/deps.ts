// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { marked, } from "marked";
import { PromptAssembler, } from "../../assistant/prompt-assembler";
import {
  compressThenEncrypt,
  deriveChatKeyForChat,
  ensureActorKey,
  getSmk,
  isEncryptionEnabled,
} from "../../crypto";
import type { DB, } from "../../db/schema";
import {
  cancelGenerationByChat,
  completeGeneration,
  failGeneration,
  getOrCreateBuffer,
  scheduleBufferCleanup,
  startGenerationTracking,
} from "../index";
import {
  buildFailoverList,
  callWithFailover,
  listProviders,
  resolveProvider,
} from "../providers/registry";
import type { AutoGenOpts, } from "./auto-generation";
import { triggerAutoGeneration, } from "./auto-generation";
import type { GroupCascadeOpts, } from "./group-cascade";
import { triggerGroupCascade, } from "./group-cascade";

/** Injectable dependencies for generation functions. */
export interface GenDeps {
  cancelGenerationByChat: typeof cancelGenerationByChat;
  completeGeneration: typeof completeGeneration;
  failGeneration: typeof failGeneration;
  getOrCreateBuffer: typeof getOrCreateBuffer;
  scheduleBufferCleanup: typeof scheduleBufferCleanup;
  startGenerationTracking: typeof startGenerationTracking;
  resolveProvider: typeof resolveProvider;
  listProviders: typeof listProviders;
  callWithFailover: typeof callWithFailover;
  buildFailoverList: typeof buildFailoverList;
  isEncryptionEnabled: () => boolean;
  getSmk: () => CryptoKey | null;
  ensureActorKey: typeof ensureActorKey;
  deriveChatKeyForChat: typeof deriveChatKeyForChat;
  compressThenEncrypt: typeof compressThenEncrypt;
  markedParse: (src: string, opts?: Record<string, unknown>,) => string;
  createPromptAssembler: (db: Kysely<DB>,) => PromptAssembler;
  /** Self-references for recursive calls (set automatically). */
  triggerAutoGeneration?: (opts: AutoGenOpts,) => Promise<void>;
  triggerGroupCascade?: (opts: GroupCascadeOpts,) => Promise<void>;
}

/** Return the real production implementations. */
export function createDefaultDeps(): GenDeps {
  return {
    cancelGenerationByChat,
    completeGeneration,
    failGeneration,
    getOrCreateBuffer,
    scheduleBufferCleanup,
    startGenerationTracking,
    resolveProvider,
    listProviders,
    callWithFailover,
    buildFailoverList,
    isEncryptionEnabled,
    getSmk,
    ensureActorKey,
    deriveChatKeyForChat,
    compressThenEncrypt,
    markedParse: (src, opts?,) => marked.parse(src, opts ?? {},) as string,
    createPromptAssembler: (db,) => new PromptAssembler(db,),
    triggerAutoGeneration,
    triggerGroupCascade,
  };
}
