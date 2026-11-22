// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Stage-1 discard-on-cancel regression: out-of-band audio output must not be
 * persisted after the chat's active generation is cancelled, while requests
 * with no active generation keep the legacy success path.
 *
 * Parallel-safe contract: owned in-memory DB per test, randomUUID ids, tracker
 * maps and provider registry restored to their exact prior state in finally.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { CancelReason, CancelSource, GenerationStatus, PolicyType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChatParticipants, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { handleAmbientGeneration, } from "../audio-gen-route";
import { handleAudioGeneration, } from "../audio-prompt-route";
import type { AudioProvider, } from "../audio/types";
import { registerAudioProvider, unregisterAudioProvider, } from "../audio/types";
import { encodeWav, } from "../audio/wav";
import { activeGenerations, chatToAttempt, } from "../cancellation-tracker";
import type { ActiveGeneration, } from "../cancellation-tracker/types";
import { StreamingRepetitionDetector, } from "../repetition-detector";
import { DEFAULT_REPETITION_DETECTION, } from "../types";
import { cancelGeneration, } from "./cancel";
import { registerDiscardOnCancel, } from "./side-effects";

createLogger({ level: "error", },);

function makeActive(attemptId: string, chatId: string,): ActiveGeneration {
  return {
    attemptId,
    chatId,
    parentMessageId: randomUUID(),
    actorId: randomUUID(),
    abortController: new AbortController(),
    startedAt: Date.now(),
    repetitionDetector: new StreamingRepetitionDetector(DEFAULT_REPETITION_DETECTION,),
    policyConfig: { expectedPolicy: PolicyType.Sfw, cancel: false, },
    responseLimitConfig: { maxResponses: 50, isGroupChat: false, currentCount: 0, },
    streaming: false,
    chunksReceived: 0,
    charsReceived: 0,
    status: GenerationStatus.Streaming,
    lastRenderedChunkIndex: -1,
    deliveryConfirmed: false,
    sideEffectJobs: undefined,
    stepIndex: 0,
    totalSteps: 1,
  };
}

/** Install an attempt for one chat, restoring the exact prior map entries. */
async function withAttempt<T,>(chatId: string, attemptId: string, fn: () => Promise<T>,): Promise<T> {
  const priorGen = activeGenerations.get(attemptId,);
  const priorChat = chatToAttempt.get(chatId,);
  activeGenerations.set(attemptId, makeActive(attemptId, chatId,),);
  chatToAttempt.set(chatId, attemptId,);
  try {
    return await fn();
  } finally {
    if (priorGen === undefined) { activeGenerations.delete(attemptId,); }
    else { activeGenerations.set(attemptId, priorGen,); }

    if (priorChat === undefined) { chatToAttempt.delete(chatId,); }
    else { chatToAttempt.set(chatId, priorChat,); }
  }
}

/** Register one uniquely-named fake provider, removing it in finally. */
async function withProvider<T,>(provider: AudioProvider, fn: () => Promise<T>,): Promise<T> {
  registerAudioProvider(provider,);
  try {
    return await fn();
  } finally {
    unregisterAudioProvider(provider.id,);
  }
}

/** Own DB per test with the minimal chat + owner rows the route requires. */
async function withDb<T,>(
  fn: (db: Kysely<DB>, ownerId: string, chatId: string,) => Promise<T>,
): Promise<T> {
  const { db, } = await createTestDb();
  const ownerId = randomUUID();
  const chatId = randomUUID();
  try {
    await insertUsers(db, `u-${randomUUID()}`, "Owner", { id: ownerId, } as never,);
    await insertActors(db, `a-${randomUUID()}`, {
      id: ownerId,
      actor_type: "user",
      user_id: ownerId,
    } as never,);

    await insertChats(db, `c-${randomUUID()}`, ownerId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, ownerId, { role_in_chat: "owner", } as never,);
    return await fn(db, ownerId, chatId,);
  } finally {
    await db.destroy();
  }
}

describe("audio generation discard-on-cancel", () => {
  test("cancelled mid-audio returns 409 and writes zero asset/link rows", async () => {
    await withDb(async (db, ownerId, chatId,) => {
      const attemptId = randomUUID();
      await withAttempt(chatId, attemptId, async () => {
        const provider: AudioProvider = {
          id: `test:cancel-${randomUUID()}`,
          async generate(request,) {
            cancelGeneration({
              attemptId,
              reason: CancelReason.UserCancel,
              source: CancelSource.User,
              detail: "stop",
            },);

            return { ok: true, buffer: Buffer.from(`audio:${request.prompt}`,), mimeType: "audio/wav", };
          },
        };

        await withProvider(provider, async () => {
          const res = await handleAudioGeneration(
            { prompt: "thunder", chatId, provider: provider.id, },
            db,
            ownerId,
          );

          expect(res.status,).toBe(409,);
          expect(await res.json(),).toEqual({ error: "Generation cancelled", status: 409, },);

          const assets = await db.selectFrom("assets",).select("id",).execute();
          const links = await db.selectFrom("asset_links",).select("asset_id",).execute();
          expect(assets.length,).toBe(0,);
          expect(links.length,).toBe(0,);
        },);
      },);
    },);
  });

  test("no active attempt keeps the success path unchanged", async () => {
    await withDb(async (db, ownerId, chatId,) => {
      const provider: AudioProvider = {
        id: `test:ok-${randomUUID()}`,
        async generate(request,) {
          return { ok: true, buffer: Buffer.from(`audio:${request.prompt}`,), mimeType: "audio/wav", };
        },
      };

      await withProvider(provider, async () => {
        const res = await handleAudioGeneration(
          { prompt: "rain on a window", chatId, provider: provider.id, },
          db,
          ownerId,
        );

        expect(res.status,).toBe(200,);

        const body = await res.json() as { data: { id: string } };
        const assets = await db.selectFrom("assets",).select("id",).execute();
        const links = await db.selectFrom("asset_links",).select("entity_type",).execute();
        expect(assets.length,).toBe(1,);
        expect(assets[0]?.id,).toBe(body.data.id,);
        expect(links.length,).toBe(1,);
        expect(links[0]?.entity_type,).toBe("chat",);
      },);
    },);
  });

  test("a late-arriving registration discards; an absent chatId never does", async () => {
    const chatId = randomUUID();
    const attemptId = randomUUID();
    const prior = chatToAttempt.get(chatId,);
    // chatToAttempt resolves an id, but the attempt record is already gone.
    chatToAttempt.set(chatId, attemptId,);
    try {
      expect(registerDiscardOnCancel(chatId, "tts",).isDiscarded(),).toBe(true,);
      expect(registerDiscardOnCancel(undefined, "tts",).isDiscarded(),).toBe(false,);
    } finally {
      if (prior === undefined) { chatToAttempt.delete(chatId,); }
      else { chatToAttempt.set(chatId, prior,); }
    }
  });

  test("ambient generation discards audio when the chat is cancelled", async () => {
    await withDb(async (db, ownerId, chatId,) => {
      const attemptId = randomUUID();
      await withAttempt(chatId, attemptId, async () => {
        const provider: AudioProvider = {
          id: `test:ambient-cancel-${randomUUID()}`,
          async generate() {
            cancelGeneration({
              attemptId,
              reason: CancelReason.UserCancel,
              source: CancelSource.User,
              detail: "stop",
            },);

            return {
              ok: true,
              buffer: encodeWav({ sampleRate: 32_000, samples: new Float32Array(1_000,), },),
              mimeType: "audio/wav",
            };
          },
        };

        await withProvider(provider, async () => {
          const res = await handleAmbientGeneration(
            { tags: ["rain",], chatId, duration_sec: 1, provider: provider.id, },
            db,
            ownerId,
          );

          expect(res.status,).toBe(409,);
          expect(await res.json(),).toEqual({ error: "Generation cancelled", status: 409, },);
          expect(await db.selectFrom("assets",).select("id",).execute(),).toHaveLength(0,);
          expect(await db.selectFrom("asset_links",).select("asset_id",).execute(),).toHaveLength(0,);
        },);
      },);
    },);
  });
});
