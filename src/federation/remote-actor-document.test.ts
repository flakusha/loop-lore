// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ActivityStreams actor-document narrowing.
 *
 * The body is attacker-controlled (a peer's actor document over the open
 * network), so the accept/reject matrix is pinned here: what a usable actor
 * needs (absolute id + inbox, a known type) and what is merely dropped
 * (optional profile fields, malformed `url`/`publicKey` shapes).
 *
 * RESOURCE CONTRACT (parallel-safe): pure functions only — no DB, no port, no
 * file, no module-level mutable state.
 */
import { describe, expect, test, } from "bun:test";
import {
  isObjectLike,
  parseActorDocument,
  parseJsonObject,
  stringField,
} from "./remote-actor-document";

const ACTOR = "https://remote.example/users/alice";

/** Minimal usable actor body; `overrides` mutate single fields. */
function actorBody(overrides: Record<string, unknown> = {},): string {
  return JSON.stringify({
    id: ACTOR,
    type: "Person",
    preferredUsername: "alice",
    name: "Alice",
    inbox: `${ACTOR}/inbox`,
    outbox: `${ACTOR}/outbox`,
    followers: `${ACTOR}/followers`,
    url: "https://remote.example/@alice",
    ...overrides,
  },);
}

describe("parseActorDocument", () => {
  test("narrows a complete actor document", () => {
    const actor = parseActorDocument(actorBody(),);

    expect(actor,).not.toBeNull();
    expect(actor?.id,).toBe(ACTOR,);
    expect(actor?.type,).toBe("Person",);
    expect(actor?.preferredUsername,).toBe("alice",);
    expect(actor?.inbox,).toBe(`${ACTOR}/inbox`,);
    expect(actor?.outbox,).toBe(`${ACTOR}/outbox`,);
    expect(actor?.followers,).toBe(`${ACTOR}/followers`,);
    expect(actor?.url,).toBe("https://remote.example/@alice",);
  });

  test("rejects a document missing its id, type, or inbox", () => {
    for (const overrides of [{ id: undefined, }, { type: undefined, }, { inbox: undefined, },]) {
      expect(parseActorDocument(actorBody(overrides,),),).toBeNull();
    }
  });

  test("rejects a relative id or inbox — both are dereferenced as URLs", () => {
    expect(parseActorDocument(actorBody({ id: "/users/alice", },),),).toBeNull();
    expect(parseActorDocument(actorBody({ inbox: "alice/inbox", },),),).toBeNull();
  });

  test("rejects an unknown actor type", () => {
    expect(parseActorDocument(actorBody({ type: "Note", },),),).toBeNull();
  });

  test("accepts a type array and keeps the first string", () => {
    const actor = parseActorDocument(actorBody({ type: ["Service", "Person",], },),);

    expect(actor?.type,).toBe("Service",);
  });

  test("drops non-http outbox/followers instead of rejecting the actor", () => {
    const actor = parseActorDocument(actorBody({ outbox: "not a url", followers: "/followers", },),);

    expect(actor,).not.toBeNull();
    expect(actor?.outbox,).toBeNull();
    expect(actor?.followers,).toBeNull();
  });

  test("reads url from an array of link objects when the string form is absent", () => {
    const actor = parseActorDocument(
      actorBody({
        url: [
          { type: "Link", href: "/relative", },
          { type: "Link", href: "https://remote.example/@alice", },
        ],
      },),
    );

    expect(actor?.url,).toBe("https://remote.example/@alice",);
  });

  test("keeps both PEM and JWK public-key forms", () => {
    const pemActor = parseActorDocument(
      actorBody({
        publicKey: { id: `${ACTOR}#main-key`, owner: ACTOR, publicKeyPem: "-----BEGIN PUBLIC KEY-----x", },
      },),
    );

    expect(pemActor?.publicKey?.pem,).toContain("BEGIN PUBLIC KEY",);
    expect(pemActor?.publicKey?.owner,).toBe(ACTOR,);

    const jwkActor = parseActorDocument(
      actorBody({ publicKey: { publicKeyJwk: { kty: "OKP", crv: "Ed25519", }, }, },),
    );

    expect(jwkActor?.publicKey?.jwk,).toEqual({ kty: "OKP", crv: "Ed25519", },);
    expect(jwkActor?.publicKey?.pem,).toBeNull();
  });

  test("a non-object publicKey yields null rather than throwing", () => {
    expect(parseActorDocument(actorBody({ publicKey: "-----BEGIN", },),)?.publicKey,).toBeNull();
  });

  test("rejects non-object and malformed JSON bodies", () => {
    for (const body of ["", "not json", "null", "42", "[]", '["Person"]',]) {
      expect(parseActorDocument(body,),).toBeNull();
    }
  });
});

describe("parseJsonObject", () => {
  test("returns the parsed object", () => {
    expect(parseJsonObject('{"a":1}',),).toEqual({ a: 1, },);
  });

  test("returns null for arrays, scalars, and invalid JSON", () => {
    for (const body of ["[]", "null", '"text"', "42", "true", "{", "",]) {
      expect(parseJsonObject(body,),).toBeNull();
    }
  });
});

describe("isObjectLike", () => {
  test("accepts plain objects only", () => {
    expect(isObjectLike({},),).toBe(true,);
    expect(isObjectLike({ a: 1, },),).toBe(true,);
    for (const value of [null, undefined, [], ["a",], "a", 1, true,]) {
      expect(isObjectLike(value,),).toBe(false,);
    }
  });
});

describe("stringField", () => {
  test("returns a non-empty string and null otherwise", () => {
    const obj: Record<string, unknown> = { name: "Alice", empty: "", numeric: 7, };

    expect(stringField(obj, "name",),).toBe("Alice",);
    expect(stringField(obj, "empty",),).toBeNull();
    expect(stringField(obj, "numeric",),).toBeNull();
    expect(stringField(obj, "absent",),).toBeNull();
  });
});
