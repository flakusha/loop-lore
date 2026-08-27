// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, test, } from "bun:test";
import {
  __peekContentVersionRegistry,
  __resetContentVersionRegistry,
  computeRowHash,
  getContentEnvelope,
  registerContentVersion,
} from "./content-version";
import { asTableName, } from "../hash/record-hash";

afterEach(() => {
  __resetContentVersionRegistry();
},);

describe("registerContentVersion", () => {
  test("stores the projection keyed on (table, v)", () => {
    registerContentVersion("messages", 1, ["chat_id", "author_id", "body",],);
    const r = __peekContentVersionRegistry();
    expect(r.get("messages",)?.get(1,),).toEqual(["author_id", "body", "chat_id",],);
  },);

  test("is idempotent on duplicate registration", () => {
    registerContentVersion("messages", 1, ["chat_id", "body",],);
    registerContentVersion("messages", 1, ["body", "chat_id",],);
    const r = __peekContentVersionRegistry();
    expect(r.get("messages",)?.size,).toBe(1,);
  },);

  test("normalizes column casing + ordering", () => {
    registerContentVersion("messages", 2, ["CHAT_ID", "Body",],);
    const cols = __peekContentVersionRegistry().get("messages",)?.get(2,);
    expect(cols,).toEqual(["body", "chat_id",],);
  },);

  test("throws on duplicate v with different columns", () => {
    registerContentVersion("messages", 1, ["a", "b",],);
    expect(() => registerContentVersion("messages", 1, ["a", "c",],),).toThrow(/different columns/,);
  },);

  test("throws on empty projection", () => {
    expect(() => registerContentVersion("messages", 1, [],),).toThrow(/empty/,);
  },);

  test("throws on invalid data_version", () => {
    expect(() => registerContentVersion("messages", 0, ["a",],),).toThrow(/invalid/);
    expect(() => registerContentVersion("messages", 1.5, ["a",],),).toThrow(/invalid/);
  },);
},);

describe("getContentEnvelope", () => {
  test("emits the v projection", () => {
    registerContentVersion("messages", 1, ["chat_id", "body",],);
    const env = getContentEnvelope(asTableName("messages",), {
      id: "m1",
      data_version: 1,
      chat_id: "c1",
      body: "hi",
      metadata: "extra", // ignored (not in projection)
    },);
    expect(env,).toEqual({ chat_id: "c1", body: "hi", },);
  },);

  test("returns null for unknown table", () => {
    expect(getContentEnvelope(asTableName("messages",), { id: "x", data_version: 1, },),).toBeNull();
  },);

  test("returns null for unknown data_version", () => {
    registerContentVersion("messages", 1, ["chat_id",],);
    expect(getContentEnvelope(asTableName("messages",), { id: "x", data_version: 99, chat_id: "c", },),).toBeNull();
  },);

  test("skips undefined values", () => {
    registerContentVersion("messages", 1, ["chat_id", "body",],);
    const env = getContentEnvelope(asTableName("messages",), {
      id: "x",
      data_version: 1,
      chat_id: "c",
      // body is undefined
      body: undefined,
    },);
    expect(env,).toEqual({ chat_id: "c", },);
  },);
},);

describe("computeRowHash", () => {
  test("produces same hash for same input", () => {
    registerContentVersion("messages", 1, ["chat_id", "body",],);
    const row = { id: "m1", data_version: 1, chat_id: "c1", body: "hi", };
    expect(computeRowHash(asTableName("messages",), row,),).toBe(
      computeRowHash(asTableName("messages",), row,),
    );
  },);

  test("different row content → different hash", () => {
    registerContentVersion("messages", 1, ["chat_id", "body",],);
    const a = computeRowHash(asTableName("messages",), { id: "m1", data_version: 1, chat_id: "c1", body: "hi", },);
    const b = computeRowHash(asTableName("messages",), { id: "m1", data_version: 1, chat_id: "c1", body: "ho", },);
    expect(a,).not.toBe(b,);
  },);

  test("returns null when projection missing", () => {
    const h = computeRowHash(asTableName("messages",), { id: "x", data_version: 1, },);
    expect(h,).toBeNull();
  },);

  test("bumping data_version changes the hash projection path", () => {
    registerContentVersion("messages", 1, ["chat_id",],);
    registerContentVersion("messages", 2, ["chat_id", "body",],);
    const v1 = computeRowHash(asTableName("messages",), { id: "m1", data_version: 1, chat_id: "c1", },);
    const v2 = computeRowHash(asTableName("messages",), { id: "m1", data_version: 2, chat_id: "c1", body: "x", },);
    expect(v1,).not.toBe(v2,);
  },);
},);