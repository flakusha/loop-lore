// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The permission-outcome wire boundary: a harness's own spelling folds into
 * the spec union, and a decision maps onto the option that harness advertised.
 * The answer itself is the spec's `RequestPermissionOutcome`: `selected` with
 * the advertised option id, or `cancelled`.
 *
 * Resource contract: pure — no child process, no database, no ports, no
 * module state.
 */
import { describe, expect, it, } from "bun:test";
import {
  advertisedPermissionOptions,
  normalizePermissionOutcome,
  wirePermissionOutcome,
} from "./permission-outcome";

describe("normalizePermissionOutcome", () => {
  it("folds hyphens and case into the spec union", () => {
    expect(normalizePermissionOutcome("allow-once",),).toBe("allow_once",);
    expect(normalizePermissionOutcome("ALLOW_ALWAYS",),).toBe("allow_always",);
    expect(normalizePermissionOutcome(" reject-once ",),).toBe("reject_once",);
    expect(normalizePermissionOutcome("cancelled",),).toBe("cancelled",);
  });

  it("refuses a spelling it does not know", () => {
    expect(normalizePermissionOutcome("ask_user",),).toBeNull();
    expect(normalizePermissionOutcome("",),).toBeNull();
  });
});

describe("advertisedPermissionOptions", () => {
  it("narrows the advertised options with their normalised kind", () => {
    const options = advertisedPermissionOptions({
      options: [
        { optionId: "allow-once", name: "Allow", kind: "allow-once", },
        { optionId: "ask", name: "Ask", kind: "ask_user", },
        { name: "No id", },
      ],
    },);

    expect(options,).toEqual([
      { optionId: "allow-once", kind: "allow-once", outcome: "allow_once", },
      { optionId: "ask", kind: "ask_user", outcome: null, },
    ],);
  });

  it("reads no options from a payload that carries none", () => {
    expect(advertisedPermissionOptions(null,),).toEqual([],);
    expect(advertisedPermissionOptions({ options: "nope", },),).toEqual([],);
  });
});

describe("wirePermissionOutcome", () => {
  it("answers with one of the two spec variants, naming the advertised option id", () => {
    const options = advertisedPermissionOptions({
      options: [
        { optionId: "allow", name: "Allow", kind: "allow_once", },
        { optionId: "reject", name: "Reject", kind: "reject_once", },
      ],
    },);

    // The spec's answer is `{ outcome: "selected", optionId }` - the id the
    // harness advertised, never the option's kind.
    expect(wirePermissionOutcome({ outcome: "allow_once", }, options,),).toEqual({
      ok: true,
      outcome: { outcome: "selected", optionId: "allow", },
    },);

    expect(wirePermissionOutcome({ outcome: "reject_once", }, options,),).toEqual({
      ok: true,
      outcome: { outcome: "selected", optionId: "reject", },
    },);

    expect(wirePermissionOutcome({ outcome: "cancelled", }, options,),).toEqual({
      ok: true,
      outcome: { outcome: "cancelled", },
    },);
  });

  it("answers the exact JSON the spec allows", () => {
    const options = advertisedPermissionOptions({ options: [{ optionId: "allow", kind: "allow_once", },], },);

    expect(JSON.stringify(wirePermissionOutcome({ outcome: "allow_once", }, options,),),).toBe(
      '{"ok":true,"outcome":{"outcome":"selected","optionId":"allow"}}',
    );
  });

  it("answers a hyphenated harness dialect with the advertised option id", () => {
    const options = advertisedPermissionOptions({ options: [{ optionId: "allow-once", kind: "allow-once", },], },);

    expect(wirePermissionOutcome({ outcome: "allow_once", }, options,),).toEqual({
      ok: true,
      outcome: { outcome: "selected", optionId: "allow-once", },
    },);
  });

  it("never puts the option's kind on the wire", () => {
    const options = advertisedPermissionOptions({ options: [{ optionId: "allow", kind: "allow_always", },], },);

    const answer = wirePermissionOutcome({ outcome: "allow_always", }, options,);
    expect(answer.ok,).toBe(true,);
    expect(Object.keys(answer.ok ? answer.outcome : {},),).toEqual(["outcome", "optionId",],);
    expect(JSON.stringify(answer,),).not.toContain("allow_always",);
  });

  it("fails closed when the harness advertised no options", () => {
    // The spec REQUIRES the options on a permission request, so a harness that
    // advertises none offers nothing to select: no `selected` answer can name
    // an option, and `cancelled` would lie about the turn.
    expect(wirePermissionOutcome({ outcome: "allow_once", }, [],),).toEqual({
      ok: false,
      reason: "no advertised permission option can carry the allow_once decision",
    },);

    expect(wirePermissionOutcome({ outcome: "reject_once", }, [],),).toEqual({
      ok: false,
      reason: "no advertised permission option can carry the reject_once decision",
    },);
  });

  it("fails closed when no advertised option has the decision's polarity", () => {
    const options = advertisedPermissionOptions({ options: [{ optionId: "ask", kind: "ask_user", },], },);

    expect(wirePermissionOutcome({ outcome: "allow_once", }, options,),).toMatchObject({ ok: false, },);
    expect(wirePermissionOutcome({ outcome: "reject_once", }, options,),).toMatchObject({ ok: false, },);
  });

  it("rides the nearest allow kind when the harness advertises no always-kind", () => {
    const options = advertisedPermissionOptions({
      options: [
        { optionId: "allow", kind: "allow_once", },
        { optionId: "reject", kind: "reject_once", },
      ],
    },);

    expect(wirePermissionOutcome({ outcome: "allow_always", }, options,),).toEqual({
      ok: true,
      outcome: { outcome: "selected", optionId: "allow", },
    },);
  });

  it("rides the nearest reject kind when the harness advertises no always-kind", () => {
    const options = advertisedPermissionOptions({
      options: [
        { optionId: "allow", kind: "allow_once", },
        { optionId: "reject", kind: "reject_once", },
      ],
    },);

    expect(wirePermissionOutcome({ outcome: "reject_always", }, options,),).toEqual({
      ok: true,
      outcome: { outcome: "selected", optionId: "reject", },
    },);
  });

  it("never lets a denial ride an allow option", () => {
    const options = advertisedPermissionOptions({
      options: [
        { optionId: "allow", kind: "allow_once", },
        { optionId: "reject", kind: "reject_once", },
      ],
    },);

    expect(wirePermissionOutcome({ outcome: "reject_once", optionId: "allow", }, options,),).toEqual({
      ok: true,
      outcome: { outcome: "selected", optionId: "reject", },
    },);
  });

  it("never lets an allow ride a reject option", () => {
    const options = advertisedPermissionOptions({
      options: [
        { optionId: "allow", kind: "allow_once", },
        { optionId: "reject", kind: "reject_once", },
      ],
    },);

    expect(wirePermissionOutcome({ outcome: "allow_once", optionId: "reject", }, options,),).toEqual({
      ok: true,
      outcome: { outcome: "selected", optionId: "allow", },
    },);
  });

  it("rides the advertised reject kind when the decision names an unadvertised one", () => {
    // The harness advertised only reject_always: the denial rides THAT
    // option, never one it never offered.
    const options = advertisedPermissionOptions({ options: [{ optionId: "no", kind: "reject_always", },], },);

    expect(wirePermissionOutcome({ outcome: "reject_once", }, options,),).toEqual({
      ok: true,
      outcome: { outcome: "selected", optionId: "no", },
    },);
  });
});
