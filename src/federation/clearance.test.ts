// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the per-chat content-clearance gate (default-deny semantics)
 * and its fan-out wiring. Pure DB + fake transport — no SMK, no network.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DuplicationPolicy, } from "../config/schema";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertChats, insertUsers, } from "../test-utils/insert-helpers";
import {
  authorizeChatExport,
  ChatClearanceError,
  grantChatFederationConsent,
  revokeChatFederationConsent,
} from "./clearance";
import { upsertPeer, } from "./coordinator";
import { createMeshEncryption, } from "./encryption";
import { fanOutContent, } from "./fan-out";
import type { PeerPost, } from "./peer-fetch";

const B_ORIGIN = "https://b.example";

async function seedStandardChat(
  database: Kysely<DB>,
  chatId: string,
  encryptionLevel: string = "standard",
): Promise<void> {
  const user = await insertUsers(database, `u-${chatId}`, "U",);
  await insertChats(database, `chat ${chatId}`, user, { id: chatId, encryption_level: encryptionLevel, },);
}

function denialOf(error: unknown,): string | null {
  return error instanceof ChatClearanceError ? error.reason : null;
}

describe("chat clearance gate", () => {
  test("default-deny: consented-less standard chat is refused", async () => {
    const { db, } = await createTestDb();
    await seedStandardChat(db, "chat-deny",);
    try {
      await authorizeChatExport(db, { chatId: "chat-deny", peerOrigin: B_ORIGIN, },);
      expect.unreachable();
    } catch (error) {
      expect(denialOf(error,),).toBe("no-consent",);
    }
  });

  test("missing chat is refused", async () => {
    const { db, } = await createTestDb();
    try {
      await authorizeChatExport(db, { chatId: "chat-ghost", peerOrigin: B_ORIGIN, },);
      expect.unreachable();
    } catch (error) {
      expect(denialOf(error,),).toBe("chat-missing",);
    }
  });

  test.each([
    ["none", "none",],
    ["at-rest", "at-rest",],
  ],)("non-exportable tier %s is refused even when consented", async (_name, level,) => {
    const { db, } = await createTestDb();
    await seedStandardChat(db, `chat-tier-${level}`, level,);
    await grantChatFederationConsent(db, `chat-tier-${level}`,);
    try {
      await authorizeChatExport(db, { chatId: `chat-tier-${level}`, peerOrigin: B_ORIGIN, },);
      expect.unreachable();
    } catch (error) {
      expect(denialOf(error,),).toBe("tier-not-exportable",);
    }
  },);

  test("consented standard chat clears, with canonical peer origin", async () => {
    const { db, } = await createTestDb();
    await seedStandardChat(db, "chat-ok",);
    await grantChatFederationConsent(db, "chat-ok",);

    const clearance = await authorizeChatExport(db, {
      chatId: "chat-ok",
      peerOrigin: "HTTPS://B.example:443",
    },);

    expect(clearance.chatId,).toBe("chat-ok",);
    expect(clearance.peerOrigin,).toBe(B_ORIGIN,);
    expect(clearance.consentedAt,).not.toBeNull();
  });

  test("invalid peer origin is refused", async () => {
    const { db, } = await createTestDb();
    await seedStandardChat(db, "chat-orig",);
    await grantChatFederationConsent(db, "chat-orig",);
    try {
      await authorizeChatExport(db, { chatId: "chat-orig", peerOrigin: "not a url", },);
      expect.unreachable();
    } catch (error) {
      expect(denialOf(error,),).toBe("invalid-peer-origin",);
    }
  });

  test("revocation re-denies after a grant", async () => {
    const { db, } = await createTestDb();
    await seedStandardChat(db, "chat-rev",);
    await grantChatFederationConsent(db, "chat-rev",);
    await expect(authorizeChatExport(db, { chatId: "chat-rev", peerOrigin: B_ORIGIN, },),).resolves.toBeDefined();

    await revokeChatFederationConsent(db, "chat-rev",);
    try {
      await authorizeChatExport(db, { chatId: "chat-rev", peerOrigin: B_ORIGIN, },);
      expect.unreachable();
    } catch (error) {
      expect(denialOf(error,),).toBe("no-consent",);
    }
  });
});

describe("fan-out clearance wiring", () => {
  const POLICY: DuplicationPolicy = { mode: "trusted", peers: [], };
  const encryption = createMeshEncryption("mesh-test-psk",);

  async function trustedPeer(db: Kysely<DB>,): Promise<void> {
    await upsertPeer(db, { origin: B_ORIGIN, state: "trusted", },);
  }

  const recordingPost = (state: { reserves: string[] },): PeerPost =>
    (async (url: string,) => {
      if (url.endsWith("/api/mesh-reserve",)) {
        state.reserves.push(url,);
        return { ok: true, status: 200, body: { reservationId: "r-x", }, };
      }

      return { ok: true, status: 200, body: { verdict: "stored", }, };
    }) as PeerPost;

  test("denied chat never reaches reservation", async () => {
    const { db, } = await createTestDb();
    await trustedPeer(db,);
    await seedStandardChat(db, "chat-nogate",);
    const state = { reserves: [], };

    const result = await fanOutContent(db, recordingPost(state,), "https://a.example", POLICY, encryption, {
      id: "fan-blocked",
      content: "secret chat content",
      chatId: "chat-nogate",
    },);

    expect(result.failed,).toHaveLength(1,);
    expect(result.failed[0]?.error,).toContain("content clearance denied: no-consent",);
    expect(state.reserves,).toEqual([],);
  });

  test("consented chat pushes normally", async () => {
    const { db, } = await createTestDb();
    await trustedPeer(db,);
    await seedStandardChat(db, "chat-gated",);
    await grantChatFederationConsent(db, "chat-gated",);
    const state = { reserves: [], };

    const result = await fanOutContent(db, recordingPost(state,), "https://a.example", POLICY, encryption, {
      id: "fan-allowed",
      content: "consented chat content",
      chatId: "chat-gated",
    },);

    expect(result.stored,).toEqual([B_ORIGIN,],);
    expect(state.reserves,).toHaveLength(1,);
  });

  test("content without a chat id is not chat-gated", async () => {
    const { db, } = await createTestDb();
    await trustedPeer(db,);
    const state = { reserves: [], };

    const result = await fanOutContent(db, recordingPost(state,), "https://a.example", POLICY, encryption, {
      id: "fan-blob",
      content: "non-chat blob",
    },);

    expect(result.stored,).toEqual([B_ORIGIN,],);
    expect(state.reserves,).toHaveLength(1,);
  });
});
