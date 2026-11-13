// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The permission-outcome wire boundary: a harness's own spelling folds into
 * the spec union, and a decision maps onto the option that harness advertised.
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
  it("answers in the spelling of the option the harness advertised", () => {
    const options = advertisedPermissionOptions({ options: [{ optionId: "allow-once", kind: "allow-once", },], },);

    expect(wirePermissionOutcome({ outcome: "allow_once", }, options,),).toEqual({
      outcome: "allow-once",
      optionId: "allow-once",
    },);
  });

  it("denies an allow when the harness advertised no options", () => {
    // The spec REQUIRES the options on a permission request, so a harness that
    // advertises none offers nothing to select - the allow fails closed.
    expect(wirePermissionOutcome({ outcome: "allow_once", }, [],),).toEqual({ outcome: "reject_once", },);
  });

  it("keeps a denial a denial when the harness advertised no options", () => {
    expect(wirePermissionOutcome({ outcome: "reject_once", }, [],),).toEqual({ outcome: "reject_once", },);
  });

  it("rides the nearest allow kind when the harness advertises no always-kind", () => {
    const options = advertisedPermissionOptions({
      options: [
        { optionId: "allow", kind: "allow_once", },
        { optionId: "reject", kind: "reject_once", },
      ],
    },);

    expect(wirePermissionOutcome({ outcome: "allow_always", }, options,),).toEqual({
      outcome: "allow_once",
      optionId: "allow",
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
      outcome: "reject_once",
      optionId: "reject",
    },);
  });

  it("denies an allow the harness advertised no option for", () => {
    const options = advertisedPermissionOptions({ options: [{ optionId: "ask", kind: "ask_user", },], },);

    expect(wirePermissionOutcome({ outcome: "allow_once", }, options,),).toEqual({ outcome: "reject_once", },);
  });

  it("keeps a denial a denial", () => {
    const options = advertisedPermissionOptions({ options: [{ optionId: "ask", kind: "ask_user", },], },);

    expect(wirePermissionOutcome({ outcome: "reject_once", }, options,),).toEqual({ outcome: "reject_once", },);
  });

  it("never lets a denial ride an allow option", () => {
    const options = advertisedPermissionOptions({
      options: [
        { optionId: "allow", kind: "allow_once", },
        { optionId: "reject", kind: "reject_once", },
      ],
    },);

    expect(wirePermissionOutcome({ outcome: "reject_once", optionId: "allow", }, options,),).toEqual({
      outcome: "reject_once",
      optionId: "reject",
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
      outcome: "allow_once",
      optionId: "allow",
    },);
  });

  it("answers a cancellation as itself", () => {
    const options = advertisedPermissionOptions({
      options: [{ optionId: "allow", kind: "allow_once", },],
    },);

    expect(wirePermissionOutcome({ outcome: "cancelled", }, options,),).toEqual({ outcome: "cancelled", },);
  });

  it("rides the advertised reject kind when the decision names an unadvertised one", () => {
    // The harness advertised only reject_always: the denial rides THAT
    // option, never a verb it never offered.
    const options = advertisedPermissionOptions({ options: [{ optionId: "no", kind: "reject_always", },], },);

    expect(wirePermissionOutcome({ outcome: "reject_once", }, options,),).toEqual({
      outcome: "reject_always",
      optionId: "no",
    },);
  });

  it("falls back to the spec verb only when the harness advertised no denial option", () => {
    const options = advertisedPermissionOptions({ options: [{ optionId: "allow", kind: "allow_once", },], },);

    expect(wirePermissionOutcome({ outcome: "reject_once", }, options,),).toEqual({ outcome: "reject_once", },);
  });

  it("denies in the harness's own spelling when no option can carry the allow", () => {
    const options = advertisedPermissionOptions({
      options: [
        { optionId: "always", kind: "allow-always", },
        { optionId: "no", kind: "reject-once", },
      ],
    },);

    expect(wirePermissionOutcome({ outcome: "allow_once", }, options,),).toEqual({
      outcome: "reject-once",
      optionId: "no",
    },);
  });
});
