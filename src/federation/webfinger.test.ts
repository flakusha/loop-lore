// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * WebFinger / host-meta primitives.
 *
 * Both sides parse untrusted input — the resolver reads a peer's host-meta XRD,
 * the routes turn a raw `resource` query value into a local lookup — so the
 * accept/reject matrix is pinned here rather than inferred from the callers.
 */
import { describe, expect, test, } from "bun:test";
import {
  acctSubject,
  ACTIVITY_JSON,
  ACTIVITY_LD_JSON,
  applyWebFingerTemplate,
  buildActorJrd,
  buildHostMetaXrd,
  defaultWebFingerTemplate,
  extractLrddTemplate,
  HOST_META_PATH,
  parseAcctResource,
  WEBFINGER_PATH,
} from "./webfinger";

describe("parseAcctResource", () => {
  test("splits a well-formed handle", () => {
    expect(parseAcctResource("acct:alice@remote.example",),).toEqual({ user: "alice", host: "remote.example", },);
  });

  test("splits on the LAST @ so a user part may contain one", () => {
    expect(parseAcctResource("acct:a@b@remote.example",),).toEqual({ user: "a@b", host: "remote.example", },);
  });

  test("accepts a scheme in any case", () => {
    expect(parseAcctResource("ACCT:alice@remote.example",),).not.toBeNull();
  });

  test("keeps a port in the host", () => {
    expect(parseAcctResource("acct:alice@lore.example:3000",),).toEqual({
      user: "alice",
      host: "lore.example:3000",
    },);
  });

  test("rejects non-acct, empty, or path-bearing values", () => {
    for (
      const bad of [
        "alice@remote.example",
        "https://remote.example/users/alice",
        "acct:alice",
        "acct:@remote.example",
        "acct:alice@",
        "acct:ali ce@remote.example",
        "acct:alice@remote.example/path",
        "acct:alice@remote.example?x=1",
        "",
      ]
    ) {
      expect(parseAcctResource(bad,),).toBeNull();
    }
  });
});

describe("buildHostMetaXrd", () => {
  test("points lrdd at the RFC 7033 path", () => {
    const xrd = buildHostMetaXrd("https://lore.example",);

    expect(xrd,).toContain('rel="lrdd"',);
    expect(xrd,).toContain('template="https://lore.example/.well-known/webfinger?resource={uri}"',);
  });

  test("escapes an origin carrying an ampersand (round-trips through the parser)", () => {
    const origin = "https://lore.example/?a=1&b=2";
    const xrd = buildHostMetaXrd(origin,);

    expect(xrd,).toContain("&amp;",);
    expect(extractLrddTemplate(xrd,),).toBe(defaultWebFingerTemplate(origin,),);
  });
});

describe("extractLrddTemplate", () => {
  test("reads capital <Link> in any attribute order", () => {
    const xml = '<XRD><Link template="https://p.example/wf?resource={uri}" rel="lrdd"/></XRD>';

    expect(extractLrddTemplate(xml,),).toBe("https://p.example/wf?resource={uri}",);
  });

  test("accepts single quotes and lowercase elements", () => {
    expect(extractLrddTemplate("<xrd><link rel='lrdd' template='https://p.example/wf'/></xrd>",),)
      .toBe("https://p.example/wf",);
  });

  test("decodes XML entities in the template", () => {
    const xml = '<XRD><Link rel="lrdd" template="https://p.example/wf?a=1&amp;resource={uri}"/></XRD>';

    expect(extractLrddTemplate(xml,),).toBe("https://p.example/wf?a=1&resource={uri}",);
  });

  test("ignores a decoy `data-rel` attribute and other rel values", () => {
    const xml =
      '<XRD><Link data-rel="lrdd" template="https://evil.example/wf"/><Link rel="self" template="https://evil.example/wf"/></XRD>';

    expect(extractLrddTemplate(xml,),).toBeNull();
  });

  test("returns null for 404 bodies, HTML, and lrdd without a template", () => {
    for (const body of ["", "<!doctype html><html></html>", '<XRD><Link rel="lrdd"/></XRD>',]) {
      expect(extractLrddTemplate(body,),).toBeNull();
    }
  });
});

describe("applyWebFingerTemplate", () => {
  test("substitutes {uri} with an encoded resource", () => {
    expect(
      applyWebFingerTemplate("https://p.example/wf?resource={uri}", "acct:alice@remote.example",),
    ).toBe("https://p.example/wf?resource=acct%3Aalice%40remote.example",);
  });

  test("appends the parameter when the peer template has no placeholder", () => {
    expect(applyWebFingerTemplate("https://p.example/wf", "acct:a@b.example",),)
      .toBe("https://p.example/wf?resource=acct%3Aa%40b.example",);

    expect(applyWebFingerTemplate("https://p.example/wf?v=2", "acct:a@b.example",),)
      .toBe("https://p.example/wf?v=2&resource=acct%3Aa%40b.example",);
  });
});

describe("buildActorJrd", () => {
  test("advertises the actor URI as a rel=self ActivityStreams link", () => {
    const jrd = buildActorJrd("acct:alice@lore.example", "https://lore.example/users/abc",);

    expect(jrd.subject,).toBe("acct:alice@lore.example",);
    expect(jrd.aliases,).toEqual(["https://lore.example/users/abc",],);
    expect(jrd.links,).toEqual([{
      rel: "self",
      type: "application/activity+json",
      href: "https://lore.example/users/abc",
    },],);

    expect(acctSubject("alice", "lore.example",),).toBe(jrd.subject,);
  });
});

describe("protocol constants", () => {
  test("the well-known paths are the RFC-fixed ones", () => {
    // RFC 6415 §4 and RFC 7033 §4 pin both locations; a peer only probes these.
    expect(HOST_META_PATH,).toBe("/.well-known/host-meta",);
    expect(WEBFINGER_PATH,).toBe("/.well-known/webfinger",);
  });

  test("the host-meta document advertises WEBFINGER_PATH", () => {
    const xrd = buildHostMetaXrd("https://lore.example",);

    expect(xrd,).toContain(`https://lore.example${WEBFINGER_PATH}?resource={uri}`,);
    expect(defaultWebFingerTemplate("https://lore.example",),).toBe(
      `https://lore.example${WEBFINGER_PATH}?resource={uri}`,
    );
  });

  test("ACTIVITY_JSON is the AS2 media type and is what a JRD advertises", () => {
    expect(ACTIVITY_JSON,).toBe("application/activity+json",);

    const jrd = buildActorJrd("acct:alice@lore.example", "https://lore.example/users/a",);
    expect(jrd.links[0]?.type,).toBe(ACTIVITY_JSON,);
  });

  test("ACTIVITY_LD_JSON is JSON-LD carrying the ActivityStreams profile", () => {
    // The profile parameter is what makes a JSON-LD document an AS2 document;
    // a bare `application/ld+json` would not identify the vocabulary.
    expect(ACTIVITY_LD_JSON.startsWith("application/ld+json",),).toBe(true,);
    expect(ACTIVITY_LD_JSON,).toContain('profile="https://www.w3.org/ns/activitystreams"',);
  });
});
