// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /agency slash command — smoke tests for status/earn/spend/cap subcommands.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type Kysely, } from "kysely";
import { ChatParticipantRole, } from "../../db/enums";
import { setTestDatabase, } from "../../db/index";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import "./agency";
import { type CommandContext, getCommand, } from "./registry";

let db: Kysely<DB>;

const OWNER = "agency-owner";
const NON_OWNER = "agency-member";

beforeAll(async () => {
  const tdb = await createTestDb();
  db = tdb.db;
  setTestDatabase(db,);
  await insertUsers(db, OWNER, "Owner", { id: OWNER, password_hash: "h", } as never,);
  await insertUsers(db, NON_OWNER, "Member", { id: NON_OWNER, password_hash: "h", } as never,);
},);

afterAll(async () => {
  await db.destroy();
},);

function ctxFor(overrides?: Partial<CommandContext>,): CommandContext {
  return {
    chatId: "chat-agency",
    db,
    userId: OWNER,
    roleInChat: ChatParticipantRole.Owner,
    ...overrides,
  };
}

describe("/agency", () => {
  test("reports missing db", async () => {
    const handler = getCommand("agency",)!;
    const result = await handler([], ctxFor({ db: undefined, userId: OWNER, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("command context missing database",);
  });

  test("status returns zero balance on first call", async () => {
    const handler = getCommand("agency",)!;
    const result = await handler([], ctxFor({ userId: NON_OWNER, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("story points:",);
    expect(result.systemMessage,).toContain("**0**",);
  });

  test("earn — owner credits balance", async () => {
    const handler = getCommand("agency",)!;
    const result = await handler(["earn", "5",], ctxFor({ userId: OWNER, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("+5",);
  });

  test("earn — non-owner is rejected", async () => {
    const handler = getCommand("agency",)!;
    const result = await handler(
      ["earn", "5",],
      ctxFor({ userId: NON_OWNER, roleInChat: ChatParticipantRole.Member, },),
    );

    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("owner-only",);
  });

  test("earn — bad amount is rejected", async () => {
    const handler = getCommand("agency",)!;
    const result = await handler(["earn", "abc",], ctxFor({ userId: OWNER, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("positive integer",);
  });

  test("spend — succeeds when balance is sufficient", async () => {
    const handler = getCommand("agency",)!;
    await handler(["earn", "10",], ctxFor({ userId: OWNER, },),);
    const result = await handler(["spend", "4",], ctxFor({ userId: OWNER, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("-4",);
  });

  test("spend — friendly message when insufficient", async () => {
    const handler = getCommand("agency",)!;
    const result = await handler(
      ["spend", "999",],
      ctxFor({ userId: NON_OWNER, roleInChat: ChatParticipantRole.Member, },),
    );

    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Not enough story points",);
  });

  test("cap — owner sets cap", async () => {
    const handler = getCommand("agency",)!;
    const result = await handler(["cap", "7",], ctxFor({ userId: OWNER, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("cap set to 7",);
  });

  test("cap — owner clears cap", async () => {
    const handler = getCommand("agency",)!;
    const result = await handler(["cap", "clear",], ctxFor({ userId: OWNER, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("cleared",);
  });

  test("cap — non-owner is rejected", async () => {
    const handler = getCommand("agency",)!;
    const result = await handler(
      ["cap", "3",],
      ctxFor({ userId: NON_OWNER, roleInChat: ChatParticipantRole.Member, },),
    );

    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("owner-only",);
  });

  test("unknown subcommand returns usage", async () => {
    const handler = getCommand("agency",)!;
    const result = await handler(["bogus",], ctxFor({ userId: OWNER, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Usage",);
  });

  test("reports missing actor", async () => {
    const handler = getCommand("agency",)!;
    const result = await handler([], ctxFor({ userId: undefined, db, roleInChat: ChatParticipantRole.Owner, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("no calling actor",);
  });

  test("earn with zero amount surfaces service InvalidAmountError", async () => {
    const handler = getCommand("agency",)!;
    const result = await handler(["earn", "0",], ctxFor({ userId: OWNER, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Agency earn:** amount must be a positive integer.",);
  });

  test("earn with cap exceeded returns generic failure", async () => {
    const handler = getCommand("agency",)!;
    const ownerCtx = ctxFor({ userId: OWNER, },);
    await handler(["cap", "2",], ownerCtx,);
    await handler(["earn", "2",], ownerCtx,);
    const result = await handler(["earn", "1",], ownerCtx,);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Agency earn failed:**",);
    expect(result.systemMessage,).toContain("cap 2",);
  });

  test("spend with non-numeric amount returns usage message", async () => {
    const handler = getCommand("agency",)!;
    const result = await handler(["spend", "abc",], ctxFor({ userId: OWNER, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Usage: `/agency spend <amount> [reason]`",);
    expect(result.systemMessage,).toContain("positive integer",);
  });

  test("spend with zero amount surfaces service InvalidAmountError", async () => {
    const handler = getCommand("agency",)!;
    const result = await handler(["spend", "0",], ctxFor({ userId: OWNER, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Agency spend:** amount must be a positive integer.",);
  });

  test("spend when insufficient returns specific friendly message", async () => {
    const handler = getCommand("agency",)!;
    const result = await handler(
      ["spend", "5",],
      ctxFor({ userId: NON_OWNER, roleInChat: ChatParticipantRole.Member, },),
    );

    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Not enough story points.**",);
    expect(result.systemMessage,).toContain("have 0",);
    expect(result.systemMessage,).toContain("need 5",);
  });

  test("cap with no argument returns usage message", async () => {
    const handler = getCommand("agency",)!;
    const result = await handler(["cap",], ctxFor({ userId: OWNER, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Usage: `/agency cap <amount|clear>`",);
  });

  test("cap with non-numeric argument returns usage message", async () => {
    const handler = getCommand("agency",)!;
    const result = await handler(["cap", "abc",], ctxFor({ userId: OWNER, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Agency cap:** must be a positive integer or `clear`.",);
  });
});
