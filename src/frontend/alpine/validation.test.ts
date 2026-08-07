/**
 * Tests for frontend/alpine/validation.ts — TypeBox parseOr/parse helpers.
 */

import { Type, } from "@sinclair/typebox";
import { describe, expect, test, } from "bun:test";
import { MessageListResponse, } from "../../validation/schemas/responses";
import { getChecker, parse, parseOr, TypeBoxParseError, } from "./validation";

const BookSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  pages: Type.Optional(Type.Number(),),
},);

describe("getChecker", () => {
  test("returns a compiled checker for a schema", () => {
    const checker = getChecker(BookSchema,);
    expect(checker.Check({ id: "1", title: "T", },),).toBe(true,);
    expect(checker.Check({ id: 42, title: "T", },),).toBe(false,);
  });

  test("caches the checker (same instance on repeat)", () => {
    expect(getChecker(BookSchema,),).toBe(getChecker(BookSchema,),);
  });
});

describe("parseOr", () => {
  test("returns the value when it matches the schema", () => {
    const value = { id: "1", title: "The Book", pages: 320, };
    expect(parseOr(BookSchema, value, { id: "", title: "", },),).toEqual(value,);
  });

  test("returns the fallback on schema mismatch", () => {
    const fallback = { id: "", title: "", };
    expect(parseOr(BookSchema, { id: 42, title: "x", }, fallback,),).toEqual(fallback,);
  });

  test("returns the fallback when value is null/undefined", () => {
    const fallback = { id: "", title: "", };
    expect(parseOr(BookSchema, null, fallback,),).toEqual(fallback,);
    expect(parseOr(BookSchema, undefined, fallback,),).toEqual(fallback,);
  });

  test("accepts missing optional fields", () => {
    const value = { id: "1", title: "No Pages", };
    expect(parseOr(BookSchema, value, { id: "", title: "", },),).toEqual(value,);
  });

  test("calls onError with the first error on mismatch", () => {
    const errors = parseOr(BookSchema, { id: 42, title: "x", }, { id: "", title: "", }, (e,) => e,);
    expect(errors,).toEqual({ id: "", title: "", },);
  });

  test("never throws on malformed input", () => {
    const fallback = { id: "", title: "", };
    expect(() => parseOr(BookSchema, "not-an-object", fallback,)).not.toThrow();
    expect(parseOr(BookSchema, "not-an-object", fallback,),).toEqual(fallback,);
  });
});

describe("parse", () => {
  test("returns the value when it matches", () => {
    const value = { id: "1", title: "T", };
    expect(parse(BookSchema, value,),).toEqual(value,);
  });

  test("throws TypeBoxParseError on mismatch", () => {
    expect(() => parse(BookSchema, { id: 1, title: "T", },)).toThrow(TypeBoxParseError,);
  });

  test("throws with a message describing the failing path", () => {
    try {
      parse(BookSchema, { id: 1, title: "T", },);
      expect.unreachable();
    } catch (error) {
      expect(error,).toBeInstanceOf(TypeBoxParseError,);
      const e = error as TypeBoxParseError;
      expect(e.errors.length,).toBeGreaterThan(0,);
      expect(e.message,).toContain("id",);
    }
  });
});

describe("MessageListResponse schema", () => {
  const page = (data: unknown[],): MessageListResponse => ({
    data: data as MessageListResponse["data"],
    pagination: { total: 1, page: 1, pageSize: 50, totalPages: 1, },
  });
  const base = { id: "m1", role: "user", content: "hi", created_at: "2024-01-01", };
  const EMPTY: MessageListResponse = {
    data: [],
    pagination: { total: 0, page: 1, pageSize: 50, totalPages: 0, },
  };

  test("accepts a plain message", () => {
    const value = page([base,],);
    expect(parseOr(MessageListResponse, value, EMPTY,),).toEqual(value,);
  });

  test("accepts null attachments (route returns object|null)", () => {
    const value = page([{ ...base, attachments: null, },],);
    expect(parseOr(MessageListResponse, value, EMPTY,),).toEqual(value,);
  });

  test("accepts a full DB row with extra snake_case + nullable columns", () => {
    const value = page([{
      ...base,
      attachments: null,
      key_id: "k1",
      content_encoding: "identity",
      visibility: "visible",
      actor_id: "a1",
      swipe_index: 1,
      chat_id: "c1",
      edited_at: null,
      token_count_total: null,
      emotion: null,
    },],);
    expect(parseOr(MessageListResponse, value, EMPTY,),).toEqual(value,);
  });
});
